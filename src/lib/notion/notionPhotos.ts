import type { StoredPhoto } from '../../types/person';
import { NotionClient, type NotionPage } from './notionClient';
import { photoCache, photoFileKey } from '../photoQueue';

interface NotionPhoto {
  name: string;
  url: string;
  // What has to be sent back to keep this file when the list is rewritten: a files update replaces the whole list.
  keep: Record<string, unknown>;
}

const MAX_EDGE = 1600;
const TARGET_BYTES = 700 * 1024;
const MIN_QUALITY = 0.5;
// Notion's file links expire after an hour; links older than this are not trusted for a download.
const FRESH_URL_MS = 50 * 60_000;

type FileValue = { name: string; type: 'file'; file: { url: string } } | { name: string; type: 'external'; external: { url: string } };

function photosOf(page: NotionPage, property: string): NotionPhoto[] {
  const value = page.properties[property] as { type?: string; files?: FileValue[] } | undefined;
  if (value?.type !== 'files' || !value.files) return [];
  return value.files.map((f) => f.type === 'file' ? { name: f.name, url: f.file.url, keep: { name: f.name, type: 'file', file: { url: f.file.url } } } : { name: f.name, url: f.external.url, keep: { name: f.name, type: 'external', external: { url: f.external.url } } });
}

const freshUrls = new Map<string, { url: string; at: number }>();

// Every page read hands out download links that work for an hour, so the import's own reads are enough to fill the cache.
export function readPhotoColumns(page: NotionPage, properties: readonly string[]): Record<string, StoredPhoto[]> {
  const listing: Record<string, StoredPhoto[]> = {};
  for (const property of properties) {
    const photos = photosOf(page, property);
    if (!photos.length) continue;
    listing[property] = photos.map((photo) => ({ key: photoFileKey(photo.url), name: photo.name }));
    for (const photo of photos) freshUrls.set(photoFileKey(photo.url), { url: photo.url, at: Date.now() });
  }
  return listing;
}

function freshUrl(key: string): string | undefined {
  const entry = freshUrls.get(key);
  return entry && Date.now() - entry.at < FRESH_URL_MS ? entry.url : undefined;
}

// Reads one person's photo columns to get new download links, for photos whose links from the import have expired.
export async function refreshPhotoUrls(client: NotionClient, pageId: string, properties: readonly string[]): Promise<void> {
  readPhotoColumns(await client.retrievePage(pageId, [...properties]), properties);
}

export async function downloadToCache(key: string): Promise<boolean> {
  const url = freshUrl(key);
  if (!url) return false;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Nie udało się pobrać zdjęcia (${response.status}).`);
  await photoCache.put(key, await compressImage(await response.blob()));
  return true;
}

// Uploads first, then one update that rewrites the column from what Notion has right now, so photos added in Notion meanwhile are kept.
// Returns the column as Notion now has it; the uploaded photos go straight into the cache, since they are already compressed.
export async function applyPhotoChanges(client: NotionClient, pageId: string, property: string, adds: { blob: Blob; filename: string }[], removeKeys: string[]): Promise<StoredPhoto[]> {
  const uploaded: Record<string, unknown>[] = [];
  for (const { blob, filename } of adds) uploaded.push({ name: filename, type: 'file_upload', file_upload: { id: await client.uploadFile(blob, filename) } });
  const current = photosOf(await client.retrievePage(pageId, [property]), property);
  const kept = current.filter((photo) => !removeKeys.includes(photoFileKey(photo.url))).map((photo) => photo.keep);
  const page = await client.updatePage(pageId, { properties: { [property]: { files: [...kept, ...uploaded] } } });
  const listing = readPhotoColumns(page, [property])[property] ?? [];
  const newOnes = listing.slice(listing.length - adds.length);
  await Promise.all(newOnes.map((photo, i) => photoCache.put(photo.key, adds[i]!.blob).catch(() => undefined)));
  return listing;
}

// Phone photos are several megabytes; scaled to MAX_EDGE and re-encoded as JPEG they stay well under Notion's per-file limit, load
// quickly on mobile data and let the local cache hold a whole family's photos. Images that are already small enough are kept as they are.
export async function compressImage(image: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && image.size <= TARGET_BYTES && image.type === 'image/jpeg') { bitmap.close(); return image; }
  let width = Math.round(bitmap.width * scale);
  let height = Math.round(bitmap.height * scale);
  let quality = 0.85;
  for (;;) {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    if (blob.size <= TARGET_BYTES || (quality <= MIN_QUALITY && width <= 800)) { bitmap.close(); return blob; }
    if (quality > MIN_QUALITY) quality = Math.max(MIN_QUALITY, quality - 0.1);
    else { width = Math.round(width * 0.8); height = Math.round(height * 0.8); }
  }
}

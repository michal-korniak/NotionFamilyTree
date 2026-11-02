import type { StoredPhoto } from '../../types/person';
import { NotionClient, type NotionPage } from './notionClient';
import { photoCache, photoFileKey } from '../photoQueue';

interface NotionPhoto {
  name: string;
  url: string;
  // What has to be sent back to keep this file when the list is rewritten: a files update replaces the whole list.
  keep: Record<string, unknown>;
}

// Each photo column has a thumbnail column next to it; a thumbnail carries its photo's name with this prefix.
export const THUMB_PREFIX = 'min_';
export const thumbnailColumn = (property: string) => `${property} (miniatura)`;

const FULL = { maxEdge: 1600, targetBytes: 700 * 1024 };
const THUMB = { maxEdge: 400, targetBytes: 40 * 1024 };
// Notion's file links expire after an hour; links older than this are not trusted for a download.
const FRESH_URL_MS = 50 * 60_000;

type FileValue = { name: string; type: 'file'; file: { url: string } } | { name: string; type: 'external'; external: { url: string } };

function photosOf(page: NotionPage, property: string): NotionPhoto[] {
  const value = page.properties[property] as { type?: string; files?: FileValue[] } | undefined;
  if (value?.type !== 'files' || !value.files) return [];
  return value.files.map((f) => f.type === 'file' ? { name: f.name, url: f.file.url, keep: { name: f.name, type: 'file', file: { url: f.file.url } } } : { name: f.name, url: f.external.url, keep: { name: f.name, type: 'external', external: { url: f.external.url } } });
}

const freshUrls = new Map<string, { url: string; at: number }>();

const remember = (photos: NotionPhoto[]) => photos.forEach((photo) => freshUrls.set(photoFileKey(photo.url), { url: photo.url, at: Date.now() }));

// Every page read hands out download links that work for an hour, so the import's own reads are enough to fill the thumbnail cache.
export function readPhotoColumns(page: NotionPage, properties: readonly string[]): Record<string, StoredPhoto[]> {
  const listing: Record<string, StoredPhoto[]> = {};
  for (const property of properties) {
    const photos = photosOf(page, property);
    const thumbs = photosOf(page, thumbnailColumn(property));
    remember(photos);
    remember(thumbs);
    if (!photos.length) continue;
    const thumbByName = new Map(thumbs.map((thumb) => [thumb.name, photoFileKey(thumb.url)]));
    listing[property] = photos.map((photo) => { const thumbKey = thumbByName.get(THUMB_PREFIX + photo.name); return { key: photoFileKey(photo.url), name: photo.name, ...(thumbKey ? { thumbKey } : {}) }; });
  }
  return listing;
}

export const photoColumnsToRead = (properties: readonly string[]) => properties.flatMap((property) => [property, thumbnailColumn(property)]);

function freshUrl(key: string): string | undefined {
  const entry = freshUrls.get(key);
  return entry && Date.now() - entry.at < FRESH_URL_MS ? entry.url : undefined;
}

// Reads one person's photo columns to get new download links once the import's have expired.
export async function refreshPhotoUrls(client: NotionClient, pageId: string, properties: readonly string[]): Promise<void> {
  readPhotoColumns(await client.retrievePage(pageId, photoColumnsToRead(properties)), properties);
}

// Caches a photo's thumbnail under the photo's own key: from its thumbnail in Notion when there is one, otherwise made from the full
// photo, which is then downloaded this once. False when no fresh link is known; the caller refreshes the links and tries again.
export async function cacheThumbnail(photo: StoredPhoto): Promise<boolean> {
  const url = freshUrl(photo.thumbKey ?? photo.key);
  if (!url) return false;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Nie udało się pobrać zdjęcia (${response.status}).`);
  await photoCache.put(photo.key, await makeThumbnail(await response.blob()));
  return true;
}

// The full photo is never kept locally; opening one asks Notion for a fresh link unless the last read is recent enough.
export async function fullPhotoUrl(client: NotionClient, pageId: string, key: string, properties: readonly string[]): Promise<string> {
  const known = freshUrl(key);
  if (known) return known;
  await refreshPhotoUrls(client, pageId, properties);
  const url = freshUrl(key);
  if (!url) throw new Error('Tego zdjęcia nie ma już w Notion.');
  return url;
}

export interface PhotoAdd {
  blob: Blob;
  thumb: Blob;
  filename: string;
}

// Uploads first, then one update of the photo column and its thumbnail column, rewritten from what Notion has right now so photos added in
// Notion meanwhile are kept. Removing a photo removes its thumbnail too. Returns the column as Notion now has it; the new thumbnails go
// straight into the cache.
export async function applyPhotoChanges(client: NotionClient, pageId: string, property: string, adds: PhotoAdd[], removeKeys: string[]): Promise<StoredPhoto[]> {
  const thumbProperty = thumbnailColumn(property);
  const uploaded: Record<string, unknown>[] = [];
  const uploadedThumbs: Record<string, unknown>[] = [];
  for (const { blob, thumb, filename } of adds) {
    uploaded.push({ name: filename, type: 'file_upload', file_upload: { id: await client.uploadFile(blob, filename) } });
    uploadedThumbs.push({ name: THUMB_PREFIX + filename, type: 'file_upload', file_upload: { id: await client.uploadFile(thumb, THUMB_PREFIX + filename) } });
  }
  const page = await client.retrievePage(pageId, [property, thumbProperty]);
  const current = photosOf(page, property);
  const removedNames = new Set(current.filter((photo) => removeKeys.includes(photoFileKey(photo.url))).map((photo) => THUMB_PREFIX + photo.name));
  const kept = current.filter((photo) => !removeKeys.includes(photoFileKey(photo.url))).map((photo) => photo.keep);
  const keptThumbs = photosOf(page, thumbProperty).filter((thumb) => !removedNames.has(thumb.name)).map((thumb) => thumb.keep);
  const updated = await client.updatePage(pageId, { properties: { [property]: { files: [...kept, ...uploaded] }, [thumbProperty]: { files: [...keptThumbs, ...uploadedThumbs] } } });
  const listing = readPhotoColumns(updated, [property])[property] ?? [];
  const newOnes = listing.slice(listing.length - adds.length);
  await Promise.all(newOnes.map((photo, i) => photoCache.put(photo.key, adds[i]!.thumb).catch(() => undefined)));
  return listing;
}

// Phone photos are several megabytes; scaled down and re-encoded as JPEG they stay well under Notion's per-file limit and load quickly on
// mobile data. Images that are already small enough are kept as they are.
async function shrink(image: Blob, { maxEdge, targetBytes }: { maxEdge: number; targetBytes: number }): Promise<Blob> {
  const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && image.size <= targetBytes && image.type === 'image/jpeg') { bitmap.close(); return image; }
  let width = Math.max(1, Math.round(bitmap.width * scale));
  let height = Math.max(1, Math.round(bitmap.height * scale));
  let quality = 0.85;
  for (;;) {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    if (blob.size <= targetBytes || (quality <= 0.5 && Math.max(width, height) <= maxEdge / 2)) { bitmap.close(); return blob; }
    if (quality > 0.5) quality = Math.max(0.5, quality - 0.1);
    else { width = Math.max(1, Math.round(width * 0.8)); height = Math.max(1, Math.round(height * 0.8)); }
  }
}

export const compressImage = (image: Blob) => shrink(image, FULL);
export const makeThumbnail = (image: Blob) => shrink(image, THUMB);

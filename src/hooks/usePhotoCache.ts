import { useEffect, useRef, useState } from 'react';
import type { NotionLink, StoredPhoto } from '../types/person';
import { photoCache } from '../lib/photoQueue';
import { backfillThumbnails, cacheThumbnail, refreshPhotoUrls } from '../lib/notion/notionPhotos';
import { NotionClient } from '../lib/notion/notionClient';
import { PHOTO_PROPERTIES } from '../lib/notion/notionMapping';
import { notionSettings } from '../lib/notion/notionSettings';

export interface PhotoCacheState {
  cached: ReadonlySet<string>;
  missing: number;
  syncing: boolean;
  failed: number;
}

export type ThumbnailsAdded = (personId: string, property: string, thumbKeyByName: Record<string, string>) => void;

const PARALLEL_DOWNLOADS = 3;

interface Owner {
  personId: string;
  property: string;
  photo: StoredPhoto;
}

// Keeps a thumbnail of every photo listed in link.photos: removes the ones no longer in Notion and fetches the rest in the background.
// Photos that have no thumbnail in Notion (added there directly) get one made from the original, which is then uploaded to the thumbnail
// column, so other devices never need the original; onThumbnailsAdded records them in link.photos so they are not uploaded again.
export function usePhotoCache(link: NotionLink | undefined, onThumbnailsAdded: ThumbnailsAdded): PhotoCacheState {
  const [cached, setCached] = useState<ReadonlySet<string>>(new Set());
  const [missing, setMissing] = useState(0);
  const [failed, setFailed] = useState(0);
  const [syncing, setSyncing] = useState(true);
  const onAdded = useRef(onThumbnailsAdded);
  onAdded.current = onThumbnailsAdded;

  useEffect(() => {
    let cancelled = false;
    const owners = new Map<string, Owner>();
    for (const [personId, columns] of Object.entries(link?.photos ?? {})) for (const [property, photos] of Object.entries(columns)) for (const photo of photos) owners.set(photo.key, { personId, property, photo });

    void (async () => {
      const stored = await photoCache.keys().catch(() => [] as string[]);
      await Promise.all(stored.filter((key) => !owners.has(key)).map((key) => photoCache.delete(key).catch(() => undefined)));
      const have = new Set(stored.filter((key) => owners.has(key)));
      if (cancelled) return;
      setCached(have);
      const todo = [...owners.keys()].filter((key) => !have.has(key));
      setMissing(todo.length);
      setFailed(0);
      const needsThumbnail = [...owners.values()].some((owner) => !owner.photo.thumbKey);
      if (!link || (!todo.length && !needsThumbnail)) { setSyncing(false); return; }
      setSyncing(true);
      // Without this the browser may clear IndexedDB when the disk runs low, and every photo would have to be downloaded again.
      void navigator.storage?.persist?.().catch(() => undefined);

      const token = notionSettings.token();
      const client = token ? new NotionClient(token) : null;
      const refreshed = new Set<string>();
      const next = () => todo.shift();
      const worker = async () => {
        for (let key = next(); key && !cancelled; key = next()) {
          try {
            const { personId, photo } = owners.get(key)!;
            let done = await cacheThumbnail(photo);
            const pageId = link.pageIds[personId];
            if (!done && client && pageId && !refreshed.has(personId)) {
              refreshed.add(personId);
              await refreshPhotoUrls(client, pageId, PHOTO_PROPERTIES);
              done = await cacheThumbnail(photo);
            }
            if (!done) throw new Error('no link');
            have.add(key);
            if (!cancelled) { setCached((current) => new Set([...current, key])); setMissing((m) => m - 1); }
          } catch {
            if (!cancelled) setFailed((f) => f + 1);
          }
        }
      };
      await Promise.all(Array.from({ length: PARALLEL_DOWNLOADS }, worker));
      if (!cancelled) setSyncing(false);

      // One update per person and column, one after another, so two uploads never rewrite the same column at once.
      const groups = new Map<string, Owner[]>();
      for (const owner of owners.values()) {
        if (owner.photo.thumbKey || !have.has(owner.photo.key) || !link.pageIds[owner.personId]) continue;
        const groupKey = `${owner.personId}|${owner.property}`;
        groups.set(groupKey, [...(groups.get(groupKey) ?? []), owner]);
      }
      if (!client) return;
      for (const group of groups.values()) {
        if (cancelled) return;
        const { personId, property } = group[0]!;
        try {
          const items = (await Promise.all(group.map(async ({ photo }) => ({ name: photo.name, thumb: await photoCache.get(photo.key) })))).filter((item): item is { name: string; thumb: Blob } => Boolean(item.thumb));
          const added = await backfillThumbnails(client, link.pageIds[personId]!, property, items);
          if (!cancelled && Object.keys(added).length) onAdded.current(personId, property, added);
        } catch {
          // Left for the next sync: the photo still has no thumbKey, so it is tried again.
        }
      }
    })();
    return () => { cancelled = true; };
  }, [link]);

  return { cached, missing, failed, syncing };
}

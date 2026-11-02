import { useEffect, useState } from 'react';
import type { NotionLink } from '../types/person';
import { photoCache } from '../lib/photoQueue';
import { downloadToCache, refreshPhotoUrls } from '../lib/notion/notionPhotos';
import { NotionClient } from '../lib/notion/notionClient';
import { PHOTO_PROPERTIES } from '../lib/notion/notionMapping';
import { notionSettings } from '../lib/notion/notionSettings';

export interface PhotoCacheState {
  cached: ReadonlySet<string>;
  missing: number;
  syncing: boolean;
  failed: number;
}

const PARALLEL_DOWNLOADS = 3;

// Keeps a local copy of every photo listed in link.photos: removes the ones no longer in Notion and downloads the rest in the background.
export function usePhotoCache(link: NotionLink | undefined): PhotoCacheState {
  const [cached, setCached] = useState<ReadonlySet<string>>(new Set());
  const [missing, setMissing] = useState(0);
  const [failed, setFailed] = useState(0);
  const [syncing, setSyncing] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const owners = new Map<string, string>();
    for (const [personId, columns] of Object.entries(link?.photos ?? {})) for (const photos of Object.values(columns)) for (const photo of photos) owners.set(photo.key, personId);

    void (async () => {
      const stored = await photoCache.keys().catch(() => [] as string[]);
      await Promise.all(stored.filter((key) => !owners.has(key)).map((key) => photoCache.delete(key).catch(() => undefined)));
      const have = new Set(stored.filter((key) => owners.has(key)));
      if (cancelled) return;
      setCached(have);
      const todo = [...owners.keys()].filter((key) => !have.has(key));
      setMissing(todo.length);
      setFailed(0);
      if (!todo.length || !link) { setSyncing(false); return; }
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
            let done = await downloadToCache(key);
            const personId = owners.get(key)!;
            const pageId = link.pageIds[personId];
            if (!done && client && pageId && !refreshed.has(personId)) {
              refreshed.add(personId);
              await refreshPhotoUrls(client, pageId, PHOTO_PROPERTIES);
              done = await downloadToCache(key);
            }
            if (!done) throw new Error('no link');
            if (!cancelled) { setCached((current) => new Set([...current, key])); setMissing((m) => m - 1); }
          } catch {
            if (!cancelled) setFailed((f) => f + 1);
          }
        }
      };
      await Promise.all(Array.from({ length: PARALLEL_DOWNLOADS }, worker));
      if (!cancelled) setSyncing(false);
    })();
    return () => { cancelled = true; };
  }, [link]);

  return { cached, missing, failed, syncing };
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { compressImage, makeThumbnail } from '../lib/notion/notionPhotos';
import { newPhotoOpId, photoFileKey, photoQueue, type PhotoOp } from '../lib/photoQueue';
import type { StoredPhoto } from '../types/person';
import type { PhotoCacheState } from './usePhotoCache';

export function usePhotoQueue() {
  const [ops, setOps] = useState<PhotoOp[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    photoQueue.list().then((stored) => { if (!cancelled) setOps(stored); }, () => { /* IndexedDB unavailable: the queue starts empty */ });
    return () => { cancelled = true; };
  }, []);

  const store = useCallback(async (op: PhotoOp) => {
    setOps((current) => [...current, op]);
    try { await photoQueue.put(op); } catch { setError('Nie udało się zapamiętać zdjęcia w przeglądarce; zostanie utracone po odświeżeniu strony.'); }
  }, []);

  const drop = useCallback(async (ids: string[]) => {
    setOps((current) => current.filter((op) => !ids.includes(op.id)));
    await Promise.all(ids.map((id) => photoQueue.delete(id).catch(() => undefined)));
  }, []);

  // The short suffix keeps names unique within a column, since a thumbnail is matched to its photo by name.
  const add = useCallback(async (personId: string, property: string, file: File) => {
    const blob = await compressImage(file);
    const thumb = await makeThumbnail(blob);
    const id = newPhotoOpId();
    const filename = `${file.name.replace(/\.[^.]+$/, '') || 'zdjecie'}-${id.slice(-4)}.${blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1] ?? 'jpg'}`;
    await store({ id, kind: 'add', personId, property, blob, thumb, filename });
  }, [store]);

  // Removing a photo that is still only queued just forgets it; removing one already in Notion queues its removal.
  const remove = useCallback(async (personId: string, property: string, photo: { pendingId?: string; url: string; name: string }) => {
    if (photo.pendingId) await drop([photo.pendingId]);
    else await store({ id: newPhotoOpId(), kind: 'remove', personId, property, fileKey: photoFileKey(photo.url), name: photo.name });
  }, [drop, store]);

  const clear = useCallback(async () => {
    setOps([]);
    await photoQueue.clear().catch(() => undefined);
  }, []);

  return useMemo(() => ({ ops, error, add, remove, drop, clear }), [ops, error, add, remove, drop, clear]);
}

export type PhotoQueue = ReturnType<typeof usePhotoQueue>;

export interface PhotosContextValue {
  queue: PhotoQueue;
  cache: PhotoCacheState;
  listing: Record<string, Record<string, StoredPhoto[]>>;
  // The full photo is not kept locally; this asks Notion for a link to it.
  openFull: (personId: string, key: string) => Promise<string>;
}

export const PhotosContext = createContext<PhotosContextValue | null>(null);

export function usePhotosContext(): PhotosContextValue {
  const value = useContext(PhotosContext);
  if (!value) throw new Error('PhotosContext is missing');
  return value;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageOff, ImagePlus, Loader2, X } from 'lucide-react';
import { photoCache } from '../lib/photoQueue';
import { usePhotosContext } from '../hooks/usePhotoQueue';
import { ConfirmDialog } from './ConfirmDialog';

interface PhotoGalleryProps {
  personId: string;
  property: string;
  // Without it the gallery only shows the photos: adding and removing them belongs to the edit form.
  addLabel?: string;
}

interface ShownPhoto {
  id: string;
  name: string;
  // Set for a photo already in Notion; its image comes from the local cache.
  key?: string;
  // Set for a photo waiting for "Zapisz zmiany".
  pendingId?: string;
  blob?: Blob;
}

// The URL is created inside the effect that revokes it: created during render, a remount (React's StrictMode does one on purpose) would revoke it while the <img> still uses it.
function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) { setUrl(undefined); return; }
    const created = URL.createObjectURL(blob);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [blob]);
  return url;
}

function PhotoTile({ photo, cached, failed, onRemove }: { photo: ShownPhoto; cached: boolean; failed: boolean; onRemove?: () => void }) {
  const [blob, setBlob] = useState<Blob | undefined>(photo.blob);
  useEffect(() => {
    if (photo.blob || !photo.key || !cached) return;
    let cancelled = false;
    photoCache.get(photo.key).then((stored) => { if (!cancelled) setBlob(stored); }, () => undefined);
    return () => { cancelled = true; };
  }, [photo.blob, photo.key, cached]);
  const url = useObjectUrl(blob);

  return (
    <li className="group/photo relative aspect-square overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" title={photo.name}><img src={url} alt={photo.name} className="size-full object-cover" /></a>
      ) : (
        <div className="grid size-full place-items-center text-zinc-400" title={failed ? 'Nie udało się pobrać zdjęcia' : 'Pobieranie zdjęcia…'}>
          {failed ? <ImageOff className="size-4" /> : <Loader2 className="size-4 animate-spin" />}
        </div>
      )}
      {photo.pendingId && <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-amber-500/90 px-1 py-px text-[9px] font-medium text-white">niezapisane</span>}
      {onRemove && <button type="button" onClick={onRemove} aria-label={`Usuń zdjęcie: ${photo.name}`} title="Usuń zdjęcie" className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-zinc-900/60 text-white transition-opacity hover:bg-red-600 mouse:opacity-0 mouse:group-hover/photo:opacity-100">
        <X className="size-3.5" />
      </button>}
    </li>
  );
}

export function PhotoGallery({ personId, property, addLabel }: PhotoGalleryProps) {
  const { queue, cache, listing } = usePhotosContext();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ShownPhoto | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ops = useMemo(() => queue.ops.filter((op) => op.personId === personId && op.property === property), [queue.ops, personId, property]);
  const shown = useMemo<ShownPhoto[]>(() => {
    const removed = new Set(ops.flatMap((op) => (op.kind === 'remove' ? [op.fileKey] : [])));
    const stored = (listing[personId]?.[property] ?? []).filter((photo) => !removed.has(photo.key)).map((photo) => ({ id: photo.key, key: photo.key, name: photo.name }));
    const pending = ops.flatMap((op) => (op.kind === 'add' ? [{ id: op.id, pendingId: op.id, name: op.filename, blob: op.blob }] : []));
    return [...stored, ...pending];
  }, [ops, listing, personId, property]);

  const add = async (file: File) => {
    setAdding(true);
    setError(null);
    try { await queue.add(personId, property, file); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setAdding(false); }
  };

  return (
    <div className="space-y-2">
      {shown.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {shown.map((photo) => <PhotoTile key={photo.id} photo={photo} cached={photo.key ? cache.cached.has(photo.key) : false} failed={!cache.syncing} onRemove={addLabel ? () => setRemoving(photo) : undefined} />)}
        </ul>
      )}
      {addLabel && <button type="button" onClick={() => inputRef.current?.click()} disabled={adding} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
        {adding ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
        {adding ? 'Przygotowywanie…' : addLabel}
      </button>}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void add(file); }} />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {queue.error && <p className="text-xs text-red-600 dark:text-red-400">{queue.error}</p>}
      {removing && (
        <ConfirmDialog title="Usunąć zdjęcie?" confirmLabel="Usuń" danger onConfirm={() => { const photo = removing; setRemoving(null); void queue.remove(personId, property, { pendingId: photo.pendingId, url: photo.key ?? '', name: photo.name }); }} onCancel={() => setRemoving(null)}>
          {removing.pendingId ? null : 'Zdjęcie zniknie z Notion po użyciu „Zapisz zmiany”.'}
        </ConfirmDialog>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';

interface PhotoViewerProps {
  name: string;
  // Resolves to the full photo's URL: a fresh Notion link, or a local one for a photo that is not saved yet.
  load: () => Promise<string>;
  onClose: () => void;
}

// Rendered into <body>: the drawer's own positioning would otherwise clip a fixed overlay.
export function PhotoViewer({ name, load, onClose }: PhotoViewerProps) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    load().then((loaded) => { if (!cancelled) setUrl(loaded); }, (e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [load]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={name} onClick={onClose} className="fixed inset-0 z-[70] grid place-items-center bg-zinc-950/90 p-4">
      <button type="button" onClick={onClose} aria-label="Zamknij" className="absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"><X className="size-5" /></button>
      {url ? <img src={url} alt={name} onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-md object-contain" /> : error ? <p className="text-sm text-red-300">{error}</p> : <Loader2 className="size-6 animate-spin text-white" />}
    </div>,
    document.body,
  );
}

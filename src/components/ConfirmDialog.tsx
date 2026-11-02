import { useEffect, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  // A third choice between Anuluj and the main action, e.g. "Odrzuć zmiany".
  secondary?: { label: string; onSelect: () => void };
  onConfirm: () => void;
  onCancel: () => void;
}

// Rendered into <body>: opened from inside the details panel, whose slide-in transform would otherwise confine a fixed overlay to the panel.
export function ConfirmDialog({ title, children, confirmLabel, danger = false, secondary, onConfirm, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/40 p-4 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex gap-3">
          {danger && <div className="grid size-8 shrink-0 place-items-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400"><AlertTriangle className="size-4" /></div>}
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-sm font-semibold">{title}</h2>
            <div className="mt-1.5 space-y-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{children}</div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" autoFocus onClick={onCancel} className="h-8 rounded-md px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">Anuluj</button>
          {secondary && <button type="button" onClick={secondary.onSelect} className="h-8 rounded-md border border-zinc-200 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">{secondary.label}</button>}
          <button type="button" onClick={onConfirm} className={`h-8 rounded-md px-3 text-xs font-medium text-white ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-zinc-900 hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300'}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

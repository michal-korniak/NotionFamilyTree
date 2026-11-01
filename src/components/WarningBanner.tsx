import { AlertTriangle, X } from 'lucide-react';

export function WarningBanner({ warnings, onDismiss }: { warnings: string[]; onDismiss: () => void }) {
  if (!warnings.length) return null;
  return (
    <div role="status" className="absolute top-3 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-200">
      <AlertTriangle className="mt-px size-4 shrink-0" />
      <ul className="flex-1 space-y-0.5">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      <button type="button" onClick={onDismiss} aria-label="Zamknij" className="rounded p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/50"><X className="size-3.5" /></button>
    </div>
  );
}

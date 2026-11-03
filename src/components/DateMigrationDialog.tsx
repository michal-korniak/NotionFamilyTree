import { useState } from 'react';
import { AlertCircle, CalendarClock, CheckCircle2, Loader2 } from 'lucide-react';
import type { DateMigration } from '../lib/notion/notionSetup';
import { countOf } from '../lib/plural';

interface DateMigrationDialogProps {
  // Unsaved changes would be lost by the full read from Notion that follows, so they have to be saved first.
  pendingChanges: number;
  onRun: (onProgress: (message: string) => void) => Promise<DateMigration>;
  onClose: () => void;
}

type Phase = { kind: 'idle' } | { kind: 'running'; message: string } | { kind: 'done'; result: DateMigration } | { kind: 'failed'; error: string };

export function DateMigrationDialog({ pendingChanges, onRun, onClose }: DateMigrationDialogProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const running = phase.kind === 'running';

  const run = async () => {
    setPhase({ kind: 'running', message: 'Łączenie z Notion…' });
    try {
      setPhase({ kind: 'done', result: await onRun((message) => setPhase({ kind: 'running', message })) });
    } catch (e) {
      setPhase({ kind: 'failed', error: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid grid-cols-1 place-items-center bg-zinc-950/40 p-4 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget && !running) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="date-migration-title" className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2.5 border-b border-zinc-200 px-5 py-3.5 dark:border-zinc-800">
          <CalendarClock className="size-5 text-zinc-500" />
          <h2 id="date-migration-title" className="text-sm font-semibold">Przenieś daty do kolumn dat</h2>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm text-zinc-700 dark:text-zinc-300">
          {phase.kind === 'idle' && (
            <>
              <p>Daty urodzenia, śmierci i związków są teraz w Notion zwykłym tekstem. Aplikacja zamieni je na kolumny typu Data z kolumną „– dokładność” obok (np. YearOnly, About Month+Year).</p>
              <p className="text-xs text-zinc-500">Stare kolumny tekstowe zostaną jako „… (tekst)”, więc nic nie zginie. Można je potem usunąć w Notion.</p>
              {pendingChanges > 0 && <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200"><AlertCircle className="mt-px size-3.5 shrink-0" />Najpierw zapisz zmiany w Notion ({countOf(pendingChanges, 'zmiana', 'zmiany', 'zmian')}).</p>}
            </>
          )}
          {phase.kind === 'running' && <p className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />{phase.message}</p>}
          {phase.kind === 'done' && (
            <>
              <p className="flex items-center gap-2"><CheckCircle2 className="size-4 text-teal-500" />Gotowe. Przeniesiono daty: {countOf(phase.result.moved, 'strona', 'strony', 'stron')}.</p>
              {phase.result.unreadable.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Nie udało się odczytać: {phase.result.unreadable.map((text) => `„${text}”`).join(', ')}. Zostały w kolumnach „(tekst)”.</p>}
            </>
          )}
          {phase.kind === 'failed' && <p role="alert" className="flex items-start gap-2 text-red-700 dark:text-red-300"><AlertCircle className="mt-0.5 size-4 shrink-0" />{phase.error} Można spróbować ponownie — przeniesione już daty zostaną pominięte.</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
          {phase.kind === 'done' ? (
            <button type="button" onClick={onClose} className="h-8 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">Zamknij</button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={running} className="h-8 rounded-md px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800">Anuluj</button>
              <button type="button" onClick={() => void run()} disabled={running || pendingChanges > 0} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">{phase.kind === 'failed' ? 'Ponów' : 'Przenieś daty'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

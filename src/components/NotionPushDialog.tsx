import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import type { NotionLink, PeopleById, UnionDetails } from '../types/person';
import { diffNotion, pushToNotion, type NotionChange } from '../lib/notion/notionPush';
import { notionSettings } from '../lib/notion/notionSettings';
import { NotionIcon } from './NotionIcon';
import { countOf } from '../lib/plural';

interface NotionPushDialogProps {
  link: NotionLink;
  people: PeopleById;
  unions: Record<string, UnionDetails>;
  onPushed: (link: NotionLink) => void;
  onClose: () => void;
}

const kindLabel: Record<NotionChange['kind'], { label: string; className: string }> = {
  create: { label: 'Nowa', className: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300' },
  restore: { label: 'Przywróć', className: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300' },
  update: { label: 'Zmiana', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' },
  trash: { label: 'Do kosza', className: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
  'union-create': { label: 'Nowy związek', className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  'union-update': { label: 'Związek', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' },
  'union-rename': { label: 'Związek', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' },
  'union-trash': { label: 'Związek do kosza', className: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
};

type Phase = { kind: 'review' } | { kind: 'pushing'; done: number; total: number } | { kind: 'done'; applied: number } | { kind: 'failed'; error: string };

export function NotionPushDialog({ link, people, unions, onPushed, onClose }: NotionPushDialogProps) {
  const changes = useMemo(() => diffNotion(link, people, unions), [link, people, unions]);
  const [token, setToken] = useState(notionSettings.token);
  const [phase, setPhase] = useState<Phase>({ kind: 'review' });
  const busy = phase.kind === 'pushing';

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  const push = async () => {
    if (!token.trim()) return;
    notionSettings.save(token.trim(), notionSettings.databaseInput());
    setPhase({ kind: 'pushing', done: 0, total: changes.length });
    const result = await pushToNotion(token.trim(), link, people, unions, (done, total) => setPhase({ kind: 'pushing', done, total }));
    onPushed(result.link);
    setPhase(result.error ? { kind: 'failed', error: result.applied ? `${result.error} Przed błędem zapisano: ${result.applied}; ponowienie wyśle resztę.` : result.error } : { kind: 'done', applied: result.applied });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/40 p-4 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="notion-push-title" className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2.5 border-b border-zinc-200 px-5 py-3.5 dark:border-zinc-800">
          <NotionIcon className="size-5" />
          <div className="min-w-0 flex-1">
            <h2 id="notion-push-title" className="text-sm font-semibold">Aktualizuj Notion</h2>
            <p className="truncate text-xs text-zinc-500">{link.title} · ostatnia synchronizacja {new Date(link.syncedAt).toLocaleString('pl-PL')}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Zamknij" className="grid size-7 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"><X className="size-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {phase.kind === 'done' ? (
            <div className="flex flex-col items-center py-6 text-center">
              <CheckCircle2 className="size-8 text-teal-500" />
              <p className="mt-2 text-sm font-medium">Notion jest aktualny</p>
              <p className="mt-1 text-xs text-zinc-500">Wysłano żądań: {phase.applied}.</p>
            </div>
          ) : changes.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">Brak zmian do zaktualizowania.</p>
          ) : (
            <>
              <p className="mb-2 text-xs text-zinc-500">{countOf(changes.length, 'zmiana', 'zmiany', 'zmian')} od ostatniej synchronizacji:</p>
              <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {changes.map((change) => (
                  <li key={`${change.kind}:${change.key}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className={`shrink-0 rounded px-1.5 py-px text-[10px] font-medium ${kindLabel[change.kind].className}`}>{kindLabel[change.kind].label}</span>
                    <span className="min-w-0 flex-1 truncate">{change.label}</span>
                    {change.detail && <span className="max-w-[45%] shrink-0 truncate text-[11px] text-zinc-400" title={change.detail}>{change.detail}</span>}
                  </li>
                ))}
              </ul>
              {!notionSettings.token() && (
                <label className="mt-4 block">
                  <span className="mb-1 block text-[11px] font-medium tracking-wider text-zinc-500 uppercase">Token integracji</span>
                  <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ntn_…" autoComplete="off" className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 font-mono text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-800" />
                </label>
              )}
              {phase.kind === 'failed' && (
                <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  <AlertCircle className="mt-px size-3.5 shrink-0" />
                  <span>{phase.error}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
          {phase.kind === 'done' || changes.length === 0 ? (
            <button type="button" onClick={onClose} className="h-8 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">Zamknij</button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={busy} className="h-8 rounded-md px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800">Anuluj</button>
              <button type="button" onClick={() => void push()} disabled={busy || !token.trim()} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
                {phase.kind === 'pushing' ? <><Loader2 className="size-3.5 animate-spin" />Aktualizowanie {phase.done}/{phase.total}…</> : phase.kind === 'failed' ? 'Ponów' : `Aktualizuj (${changes.length})`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

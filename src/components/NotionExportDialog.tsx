import { useState, type FormEvent } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import type { NotionLink } from '../types/person';
import { notionSettings, parseDatabaseId } from '../lib/notion/notionSettings';
import { createNotionDatabases } from '../lib/notion/notionSetup';
import { NotionIcon } from './NotionIcon';

interface NotionExportDialogProps {
  onCreated: (link: NotionLink) => void;
  onClose: () => void;
}

const inputClass = 'h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-500 dark:focus:ring-zinc-800';
const labelClass = 'mb-1 block text-[11px] font-medium tracking-wider text-zinc-500 uppercase';

export function NotionExportDialog({ onCreated, onClose }: NotionExportDialogProps) {
  const [token, setToken] = useState(notionSettings.token);
  const [page, setPage] = useState('');
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const pageId = parseDatabaseId(page);
    if (!token.trim()) { setError('Wklej token integracji Notion.'); return; }
    if (!pageId) { setError('Wklej link do strony w Notion.'); return; }
    setError(null);
    setProgress('Łączenie…');
    try {
      const link = await createNotionDatabases(token.trim(), pageId, setProgress);
      notionSettings.save(token.trim(), page.trim());
      onCreated(link);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid grid-cols-1 place-items-center bg-zinc-950/40 p-4 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form role="dialog" aria-modal="true" aria-labelledby="notion-export-title" onSubmit={(e) => void submit(e)} className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2.5 border-b border-zinc-200 px-5 py-3.5 dark:border-zinc-800">
          <NotionIcon className="size-5" />
          <h2 id="notion-export-title" className="min-w-0 flex-1 text-sm font-semibold">Połącz z Notion</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Zamknij" className="grid size-7 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"><X className="size-4" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            <li>Utwórz w Notion pustą stronę (np. <span className="font-medium">Drzewo</span>).</li>
            <li>Na tej stronie kliknij ikonę <span className="font-medium">•••</span>, przejdź do sekcji <span className="font-medium">Połączenia</span> i dodaj swoją integrację.</li>
            <li>Wklej poniżej link do utworzonej strony. Aplikacja utworzy na niej bazy: Osoby, Związki oraz Groby, a następnie zapisze w nich całe drzewo.</li>
          </ol>
          <label className="block">
            <span className={labelClass}>Token integracji</span>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ntn_…" autoComplete="off" spellCheck={false} className={`${inputClass} font-mono`} />
          </label>
          <label className="block">
            <span className={labelClass}>Link do strony</span>
            <input value={page} onChange={(e) => setPage(e.target.value)} placeholder="https://www.notion.so/…/Drzewo-…" spellCheck={false} className={inputClass} />
          </label>
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              <AlertCircle className="mt-px size-3.5 shrink-0" />
              <span className="break-words">{error}</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <button type="button" onClick={onClose} disabled={busy} className="h-8 rounded-md px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800">Anuluj</button>
          <button type="submit" disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
            {busy ? <><Loader2 className="size-3.5 animate-spin" />{progress}</> : 'Utwórz bazy'}
          </button>
        </div>
      </form>
    </div>
  );
}

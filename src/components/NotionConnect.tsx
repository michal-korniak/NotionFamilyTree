import { useState, type FormEvent } from 'react';
import { NotionStructureHelp } from './NotionStructureHelp';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { notionSettings, parseDatabaseId } from '../lib/notion/notionSettings';
import { importNotionDatabase, type NotionImport } from '../lib/notion/notionMapping';
import { NotionIcon } from './NotionIcon';

interface NotionConnectProps {
  onImported: (result: NotionImport) => string | null;
}

const inputClass = 'h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-500 dark:focus:ring-zinc-800';

export function NotionConnect({ onImported }: NotionConnectProps) {
  const [token, setToken] = useState(notionSettings.token);
  const [database, setDatabase] = useState(notionSettings.databaseInput);
  const [showToken, setShowToken] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasSavedToken = Boolean(notionSettings.token());

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const databaseId = parseDatabaseId(database);
    if (!token.trim()) { setError('Wklej token integracji Notion.'); return; }
    if (!databaseId) { setError('Wklej link do strony Drzewo (albo do bazy Osoby).'); return; }
    setError(null);
    setProgress('Connecting…');
    try {
      const result = await importNotionDatabase(token.trim(), databaseId, setProgress);
      notionSettings.save(token.trim(), database.trim());
      const failure = onImported(result);
      if (failure) setError(failure);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  const forget = () => { notionSettings.forgetToken(); setToken(''); };

  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center gap-2.5">
        <NotionIcon className="size-5" />
        <div>
          <h2 className="text-sm font-semibold">Import z Notion</h2>
        </div>
      </div>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 flex items-center justify-between text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
            Token integracji
            {hasSavedToken && <button type="button" onClick={forget} className="text-[11px] font-normal tracking-normal text-zinc-400 normal-case underline-offset-2 hover:text-zinc-700 hover:underline dark:hover:text-zinc-200">Zapomnij zapisany token</button>}
          </span>
          <div className="relative">
            <input type={showToken ? 'text' : 'password'} value={token} onChange={(e) => setToken(e.target.value)} placeholder="ntn_…" autoComplete="off" spellCheck={false} className={`${inputClass} pr-9 font-mono`} />
            <button type="button" onClick={() => setShowToken((s) => !s)} aria-label={showToken ? 'Ukryj token' : 'Pokaż token'} className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
              {showToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          </div>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium tracking-wider text-zinc-500 uppercase">Link do strony z danymi</span>
          <input value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="https://www.notion.so/…/Drzewo-40bfaaf267608130867fc8c679650c21" spellCheck={false} className={inputClass} />
        </label>
      </div>

      {error && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[11px] leading-snug text-zinc-400">Token zostanie zapamiętany tylko w tej przeglądarce.</p>
        <button type="submit" disabled={progress !== null} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
          {progress ? <><Loader2 className="size-3.5 animate-spin" />{progress}</> : 'Importuj'}
        </button>
      </div>

      <details className="mt-4 text-xs text-zinc-500">
        <summary className="cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-300">Jak zdobyć token?</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4 leading-relaxed">
          <li>Otwórz <a href="https://www.notion.so/profile/integrations" target="_blank" rel="noreferrer" className="text-zinc-700 underline underline-offset-2 dark:text-zinc-300">notion.so/profile/integrations</a> i utwórz integrację wewnętrzną (Internal) z uprawnieniami do odczytu, edycji i dodawania treści.</li>
          <li>Skopiuj klucz „Internal Integration Secret” tej integracji (zaczyna się od <code className="font-mono">ntn_</code>).</li>
          <li>W Notion otwórz stronę <span className="font-medium">Drzewo</span>, kliknij <span className="font-medium">•••</span> → <span className="font-medium">Połączenia</span> i dodaj swoją integrację. Dzięki temu będzie miała dostęp do baz Osoby i Związki.</li>
        </ol>
      </details>
      <NotionStructureHelp />
    </form>
  );
}

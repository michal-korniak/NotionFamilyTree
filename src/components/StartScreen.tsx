import { FilePlus2, Network } from 'lucide-react';
import type { NotionImport } from '../lib/notion/notionMapping';
import { NotionConnect } from './NotionConnect';
import { TreeBackdrop } from './TreeBackdrop';

interface StartScreenProps {
  onStartEmpty: () => void;
  onNotionImported: (result: NotionImport) => string | null;
}

export function StartScreen({ onStartEmpty, onNotionImported }: StartScreenProps) {
  return (
    <main className="relative flex min-h-full items-center justify-center overflow-hidden p-4 sm:p-8">
      <TreeBackdrop />
      <div className="relative w-full max-w-xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
            <Network className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">NotionFamilyTree</h1>
          </div>
        </div>

        <NotionConnect onImported={onNotionImported} />

        <div className="mt-4 flex justify-center">
          <button type="button" onClick={onStartEmpty} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900">
            <FilePlus2 className="size-3.5" />
            Zacznij od początku
          </button>
        </div>
      </div>
    </main>
  );
}

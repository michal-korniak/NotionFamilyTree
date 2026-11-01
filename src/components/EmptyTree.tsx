import { UserPlus, Users } from 'lucide-react';

export function EmptyTree({ onAddPerson }: { onAddPerson: () => void }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center p-6">
      <div className="max-w-xs text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
          <Users className="size-5" />
        </div>
        <p className="mt-3 text-sm font-medium">To drzewo jest puste</p>
        <p className="mt-1 text-xs text-zinc-500">Dodaj pierwszą osobę, a potem jej rodziców, małżonków i dzieci z panelu szczegółów.</p>
        <button type="button" onClick={onAddPerson} className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
          <UserPlus className="size-3.5" />
          Dodaj osobę
        </button>
      </div>
    </div>
  );
}

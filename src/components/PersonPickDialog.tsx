import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { PeopleById } from '../types/person';
import { searchPeople } from '../lib/search';
import { formatLifeYears, isDeceased } from '../lib/dates';
import { displayName } from '../lib/names';
import { Avatar } from './Avatar';

const MAX_RESULTS = 8;

interface PersonPickDialogProps {
  title: string;
  people: PeopleById;
  exclude: ReadonlySet<string>;
  onPick: (id: string) => void;
  onClose: () => void;
}

export function PersonPickDialog({ title, people, exclude, onPick, onClose }: PersonPickDialogProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(() => searchPeople(people, query, MAX_RESULTS, exclude), [people, query, exclude]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); const person = results[activeIndex]; if (person) onPick(person.id); }
    else if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-950/40 p-4 pt-[15vh] backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Zamknij" className="grid size-7 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"><X className="size-4" /></button>
        </div>
        <div className="p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-400" />
            <input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }} onKeyDown={handleKeyDown} placeholder="Szukaj osoby…" className="h-9 w-full rounded-md border border-zinc-200 bg-transparent pr-2 pl-8 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700" />
          </div>
          <ul className="mt-1.5 max-h-80 overflow-y-auto">
            {results.map((person, index) => (
              <li key={person.id}>
                <button type="button" onClick={() => onPick(person.id)} onMouseEnter={() => setActiveIndex(index)} className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left ${index === activeIndex ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}>
                  <Avatar name={displayName(person)} gender={person.gender} size="sm" deceased={isDeceased(person)} />
                  <span className="min-w-0 flex-1 truncate text-sm">{displayName(person)}</span>
                  <span className="font-mono text-[11px] text-zinc-500">{formatLifeYears(person)}</span>
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="px-2 py-3 text-center text-xs text-zinc-400">{query.trim() ? 'Nikogo nie znaleziono' : 'Wpisz imię lub nazwisko'}</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

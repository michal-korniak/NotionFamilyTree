import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, UserRound, X } from 'lucide-react';
import type { PeopleById } from '../types/person';
import { formatLifeYears, isDeceased } from '../lib/dates';
import { searchPeople } from '../lib/search';
import { displayName } from '../lib/names';
import { Avatar } from './Avatar';

interface ConnectionPickerProps {
  people: PeopleById;
  meId: string;
  fromId: string;
  toId: string | null;
  onChange: (fromId: string, toId: string | null) => void;
}

const MAX_RESULTS = 30;

function PersonDropdown({ people, meId, value, placeholder, onSelect }: { people: PeopleById; meId: string; value: string | null; placeholder: string; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const results = useMemo(() => (query.trim() ? searchPeople(people, query, MAX_RESULTS) : []), [people, query]);
  const selected = value ? people.get(value) : undefined;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const choose = (id: string) => { onSelect(id); setOpen(false); setQuery(''); };
  const label = !selected ? placeholder : selected.id === meId ? 'Ja' : displayName(selected);

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`flex h-6 max-w-48 items-center gap-1 rounded px-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 ${selected ? '' : 'text-zinc-400'}`}>
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3 shrink-0 text-zinc-400" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1.5 w-80 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <button type="button" onClick={() => choose(meId)} className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${value === meId ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}>
            <span className="grid size-7 place-items-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800"><UserRound className="size-3.5" /></span>
            <span className="flex-1">Ja</span>
          </button>
          <div className="relative mt-1 border-t border-zinc-100 pt-1 dark:border-zinc-800">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 mt-0.5 size-3.5 -translate-y-1/2 text-zinc-400" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' && results[0]) choose(results[0].id); }} placeholder="Szukaj osoby…" className="h-8 w-full bg-transparent pr-2 pl-8 text-sm outline-none placeholder:text-zinc-400" />
          </div>
          {results.length > 0 && (
            <ul className="max-h-72 overflow-y-auto">
              {results.map((person) => (
                <li key={person.id}>
                  <button type="button" onClick={() => choose(person.id)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    <Avatar name={displayName(person)} gender={person.gender} size="sm" deceased={isDeceased(person)} />
                    <span className="min-w-0 flex-1 truncate text-sm">{displayName(person)}</span>
                    <span className="font-mono text-[11px] text-zinc-500">{formatLifeYears(person)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// "Powiązanie: A ↔ B" — with B chosen, only the chain of people connecting the two is drawn; clearing B returns to the family view.
export function ConnectionPicker({ people, meId, fromId, toId, onChange }: ConnectionPickerProps) {
  return (
    <div className="pointer-events-auto flex h-[30px] items-center gap-0.5 rounded-lg border border-zinc-200 bg-white/90 pr-1 pl-2.5 text-xs shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
      <span className="text-zinc-500">Powiązanie:</span>
      <PersonDropdown people={people} meId={meId} value={fromId} placeholder="Ja" onSelect={(id) => onChange(id, toId === id ? null : toId)} />
      <span className="text-zinc-400" aria-hidden>↔</span>
      <PersonDropdown people={people} meId={meId} value={toId} placeholder="wybierz osobę" onSelect={(id) => onChange(fromId, id === fromId ? null : id)} />
      {toId && <button type="button" onClick={() => onChange(meId, null)} aria-label="Zakończ widok powiązania" title="Zakończ widok powiązania" className="grid size-6 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"><X className="size-3.5" /></button>}
    </div>
  );
}

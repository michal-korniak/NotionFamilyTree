import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import type { PeopleById, Person } from '../types/person';
import { formatLifeYears, isDeceased } from '../lib/dates';
import { searchPeople } from '../lib/search';
import { Avatar } from './Avatar';
import { displayName } from '../lib/names';

const MAX_RESULTS = 8;
const MAX_PHONE_RESULTS = 30;

interface SearchBarProps {
  people: PeopleById;
  onSelect: (id: string) => void;
}

export function SearchBar({ people, onSelect }: SearchBarProps) {
  const [phoneOpen, setPhoneOpen] = useState(false);
  return (
    <>
      <div className="hidden w-full max-w-md sm:block">
        <DesktopSearch people={people} onSelect={onSelect} />
      </div>
      <button type="button" onClick={() => setPhoneOpen(true)} className="flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-zinc-200 bg-white px-2.5 text-left text-base text-zinc-400 sm:hidden dark:border-zinc-800 dark:bg-zinc-900">
        <Search className="size-4 shrink-0" />
        <span className="truncate">Szukaj osób…</span>
      </button>
      {/* The top bar's backdrop-filter would make it the containing block of a fixed overlay, so the overlay is rendered on body. */}
      {phoneOpen && createPortal(<PhoneSearch people={people} onSelect={(id) => { setPhoneOpen(false); onSelect(id); }} onClose={() => setPhoneOpen(false)} />, document.body)}
    </>
  );
}

function DesktopSearch({ people, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = useMemo(() => searchPeople(people, query, MAX_RESULTS), [people, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(event.target.tagName);
      if ((event.key === 'k' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !typing)) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const choose = (person: Person) => {
    onSelect(person.id);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (event.key === 'Enter' && results[activeIndex]) choose(results[activeIndex]);
    else if (event.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
  };

  const showResults = open && query.trim().length > 0;

  return (
    <div className="relative w-full">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" />
      <input ref={inputRef} type="search" value={query} placeholder="Szukaj osób…" role="combobox" aria-expanded={showResults} aria-controls={listId} aria-autocomplete="list" onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={handleKeyDown} className="h-9 w-full rounded-md border border-zinc-200 bg-white pr-12 pl-8 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-zinc-600 dark:focus:ring-zinc-800 [&::-webkit-search-cancel-button]:hidden" />
      <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-zinc-200 px-1.5 font-mono text-[10px] text-zinc-400 dark:border-zinc-700">Ctrl K</kbd>
      {showResults && (
        <ul id={listId} role="listbox" className="absolute top-full right-0 left-0 z-50 mt-1 max-h-80 overflow-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-zinc-500">Brak wyników dla „{query.trim()}”</li>}
          {results.map((person, index) => (
            <li key={person.id} role="option" aria-selected={index === activeIndex} onMouseDown={(e) => { e.preventDefault(); choose(person); }} onMouseEnter={() => setActiveIndex(index)} className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 ${index === activeIndex ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}>
              <Avatar name={displayName(person)} gender={person.gender} size="sm" deceased={isDeceased(person)} />
              <span className="min-w-0 flex-1 truncate text-sm">{displayName(person)}</span>
              <span className="font-mono text-xs text-zinc-500">{formatLifeYears(person)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// A dropdown under a field squeezed into the top bar has no room on a phone and closes when the keyboard steals focus, so a phone gets the whole screen.
function PhoneSearch({ people, onSelect, onClose }: SearchBarProps & { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchPeople(people, query, MAX_PHONE_RESULTS), [people, query]);
  const trimmed = query.trim();

  return (
    <div role="dialog" aria-modal="true" aria-label="Szukaj osób" className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" />
          <input autoFocus type="search" enterKeyHint="search" value={query} placeholder="Szukaj osób…" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); else if (e.key === 'Enter' && results[0]) onSelect(results[0].id); }} className="h-10 w-full rounded-md border border-zinc-200 bg-white pr-9 pl-8 text-base outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 [&::-webkit-search-cancel-button]:hidden" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Wyczyść" className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded text-zinc-400"><X className="size-4" /></button>}
        </div>
        <button type="button" onClick={onClose} className="h-10 shrink-0 px-1 text-sm font-medium text-zinc-600 dark:text-zinc-300">Anuluj</button>
      </div>
      <ul className="flex-1 overflow-y-auto px-2 py-1">
        {!trimmed && <li className="px-3 py-6 text-center text-sm text-zinc-400">Wpisz imię lub nazwisko</li>}
        {trimmed && results.length === 0 && <li className="px-3 py-6 text-center text-sm text-zinc-500">Brak wyników dla „{trimmed}”</li>}
        {results.map((person) => (
          <li key={person.id}>
            <button type="button" onClick={() => onSelect(person.id)} className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left active:bg-zinc-100 dark:active:bg-zinc-800">
              <Avatar name={displayName(person)} gender={person.gender} size="sm" deceased={isDeceased(person)} />
              <span className="min-w-0 flex-1 truncate text-base">{displayName(person)}</span>
              <span className="font-mono text-xs text-zinc-500">{formatLifeYears(person)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

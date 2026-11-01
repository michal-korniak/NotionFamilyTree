import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Search } from 'lucide-react';
import type { Gender, PeopleById } from '../types/person';
import type { NewPersonNames } from '../lib/treeEdits';
import { formatLifeYears, isDeceased } from '../lib/dates';
import { searchPeople } from '../lib/search';
import { Avatar } from './Avatar';
import { displayName } from '../lib/names';

const MAX_RESULTS = 6;

// Only a first guess for the form: the last word is taken as the surname, everything before it as given names.
function splitTypedName(typed: string, suggestedSurname?: string): NewPersonNames {
  const words = typed.split(/\s+/);
  return words.length > 1 ? { givenNames: words.slice(0, -1).join(' '), birthSurname: words[words.length - 1]! } : { givenNames: typed, birthSurname: suggestedSurname ?? '' };
}

const inputClass = 'w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-800';
const labelClass = 'mb-0.5 block text-[10px] font-medium tracking-wider text-zinc-500 uppercase';

interface RelativePickerProps {
  people: PeopleById;
  exclude: ReadonlySet<string>;
  placeholder: string;
  onPick: (id: string, secondParentId?: string | null) => string | null;
  onCreate: (names: NewPersonNames, gender: Gender, secondParentId?: string | null) => string | null;
  presetGender?: Gender;
  suggestedSurname?: string;
  secondParents?: { id: string; label: string }[];
  onClose: () => void;
}

export function RelativePicker({ people, exclude, placeholder, onPick, onCreate, presetGender, suggestedSurname, secondParents, onClose }: RelativePickerProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const results = useMemo(() => searchPeople(people, query, MAX_RESULTS, exclude), [people, query, exclude]);
  const trimmed = query.trim();
  // Creating someone shows the typed text split into given names and surname for correction, and asks for a gender; nobody is added with an unknown gender.
  const [draft, setDraft] = useState<{ givenNames: string; birthSurname: string; gender: Gender | null } | null>(null);
  const [secondParentId, setSecondParentId] = useState<string | null>(secondParents?.[0]?.id ?? null);
  const optionCount = results.length + (trimmed ? 1 : 0);

  const choose = (index: number) => {
    const person = results[index];
    if (!person && trimmed) { setDraft({ ...splitTypedName(trimmed, suggestedSurname), gender: presetGender ?? null }); return; }
    const failure = person ? onPick(person.id, secondParentId) : null;
    if (failure) setError(failure); else onClose();
  };

  const canCreate = !!draft?.gender && !!(draft.givenNames.trim() || draft.birthSurname.trim());
  const create = (event: FormEvent) => {
    event.preventDefault();
    if (!draft?.gender || !canCreate) return;
    const failure = onCreate({ givenNames: draft.givenNames.trim(), birthSurname: draft.birthSurname.trim() }, draft.gender, secondParentId);
    if (failure) { setError(failure); setDraft(null); } else onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((i) => Math.min(i + 1, optionCount - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); if (optionCount) choose(activeIndex); }
    else if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
  };

  const optionClass = (index: number) => `flex w-full cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-left ${index === activeIndex ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`;

  return (
    <div onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onClose(); }} className="mb-2 rounded-md border border-zinc-300 bg-white p-1 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      {secondParents && secondParents.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-zinc-100 px-1.5 pt-0.5 pb-1.5 dark:border-zinc-800">
          <span className="mr-0.5 text-[11px] text-zinc-500">Drugi rodzic:</span>
          {[...secondParents, { id: '', label: 'brak' }].map((option) => {
            const active = (secondParentId ?? '') === option.id;
            return <button key={option.id || 'none'} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setSecondParentId(option.id || null)} className={`max-w-44 truncate rounded-full border px-2 py-0.5 text-[11px] transition-colors ${active ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>{option.label}</button>;
          })}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-zinc-400" />
        <input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); setError(null); }} onKeyDown={handleKeyDown} readOnly={draft !== null} placeholder={placeholder} className="h-8 w-full bg-transparent pr-2 pl-7 text-sm outline-none placeholder:text-zinc-400" />
      </div>
      {(optionCount > 0 || error) && (
        <ul className="mt-1 border-t border-zinc-100 pt-1 dark:border-zinc-800">
          {results.map((person, index) => (
            <li key={person.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(index)} onMouseEnter={() => setActiveIndex(index)} className={optionClass(index)}>
                <Avatar name={displayName(person)} gender={person.gender} size="sm" deceased={isDeceased(person)} />
                <span className="min-w-0 flex-1 truncate text-sm">{displayName(person)}</span>
                <span className="font-mono text-[11px] text-zinc-500">{formatLifeYears(person)}</span>
              </button>
            </li>
          ))}
          {draft && (
            <li>
              <form onSubmit={create} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setDraft(null); } }} className="space-y-2 px-2 py-1.5">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block"><span className={labelClass}>Imiona</span><input autoFocus value={draft.givenNames} onChange={(e) => setDraft({ ...draft, givenNames: e.target.value })} className={inputClass} /></label>
                  <label className="block"><span className={labelClass}>Nazwisko rodowe</span><input value={draft.birthSurname} onChange={(e) => setDraft({ ...draft, birthSurname: e.target.value })} className={inputClass} /></label>
                </div>
                <div className="flex items-center gap-1">
                  {(['M', 'F'] as const).map((g) => (
                    <button key={g} type="button" onClick={() => setDraft({ ...draft, gender: g })} className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${draft.gender === g ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900' : 'border-zinc-200 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800'}`}>{g === 'M' ? 'Mężczyzna' : 'Kobieta'}</button>
                  ))}
                  <button type="button" onClick={() => setDraft(null)} className="ml-auto h-7 rounded-md px-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">Anuluj</button>
                  <button type="submit" disabled={!canCreate} className="h-7 rounded-md bg-zinc-900 px-2.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">Utwórz</button>
                </div>
              </form>
            </li>
          )}
          {trimmed && !draft && (
            <li>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(results.length)} onMouseEnter={() => setActiveIndex(results.length)} className={optionClass(results.length)}>
                <span className="grid size-7 place-items-center rounded-full border border-dashed border-zinc-300 text-zinc-500 dark:border-zinc-600"><Plus className="size-3.5" /></span>
                <span className="min-w-0 flex-1 truncate text-sm">Utwórz „{trimmed}”{presetGender && <span className="text-zinc-400"> · {presetGender === 'M' ? 'mężczyzna' : 'kobieta'}</span>}</span>
              </button>
            </li>
          )}
          {error && <li className="px-2 py-1.5 text-xs text-red-600 dark:text-red-400">{error}</li>}
        </ul>
      )}
    </div>
  );
}

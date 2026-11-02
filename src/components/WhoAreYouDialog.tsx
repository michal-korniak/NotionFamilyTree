import { useMemo, useState, type FormEvent } from 'react';
import { Search, UserPlus, UserRound } from 'lucide-react';
import type { Gender, PeopleById } from '../types/person';
import { formatLifeYears, isDeceased } from '../lib/dates';
import { searchPeople } from '../lib/search';
import { displayName } from '../lib/names';
import { Avatar } from './Avatar';

interface WhoAreYouDialogProps {
  people: PeopleById;
  currentMeId: string | null;
  onChoose: (id: string) => void;
  onCreate: (givenNames: string, surname: string, gender: Gender) => void;
  onCancel?: () => void;
}

const MAX_RESULTS = 50;

export function WhoAreYouDialog({ people, currentMeId, onChoose, onCreate, onCancel }: WhoAreYouDialogProps) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(people.size === 0);
  const [givenNames, setGivenNames] = useState('');
  const [surname, setSurname] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const results = useMemo(() => (query.trim() ? searchPeople(people, query, MAX_RESULTS) : [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl')).slice(0, MAX_RESULTS)), [people, query]);

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    if ((givenNames.trim() || surname.trim()) && gender) onCreate(givenNames.trim(), surname.trim(), gender);
  };

  return (
    <div className="fixed inset-0 z-50 grid grid-cols-1 place-items-center bg-zinc-950/40 p-4 backdrop-blur-[2px]" onMouseDown={(e) => { if (onCancel && e.target === e.currentTarget) onCancel(); }} onKeyDown={(e) => { if (onCancel && e.key === 'Escape') onCancel(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="who-title" className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="grid size-9 place-items-center rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"><UserRound className="size-4" /></div>
          <div>
            <h2 id="who-title" className="text-sm font-semibold">Kim jesteś?</h2>
            <p className="text-xs text-zinc-500">{creating ? 'Utwórz swój rekord — od niego zacznie się Twoje drzewo.' : 'Wybierz siebie z drzewa — od tej osoby zacznie się Twoje drzewo.'}</p>
          </div>
        </div>

        {creating ? (
          <form onSubmit={submitCreate} className="space-y-4 px-5 py-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium tracking-wider text-zinc-500 uppercase">Imiona</span>
                <input autoFocus value={givenNames} onChange={(e) => setGivenNames(e.target.value)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-800" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium tracking-wider text-zinc-500 uppercase">Nazwisko</span>
                <input value={surname} onChange={(e) => setSurname(e.target.value)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-800" />
              </label>
            </div>
            <div>
              <span className="mb-1 block text-[11px] font-medium tracking-wider text-zinc-500 uppercase">Płeć</span>
              <div className="grid grid-cols-2 gap-1 rounded-md border border-zinc-200 p-0.5 dark:border-zinc-800">
                {(['M', 'F'] as const).map((g) => (
                  <button key={g} type="button" onClick={() => setGender(g)} className={`rounded px-2 py-1 text-xs font-medium transition-colors ${gender === g ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>{g === 'M' ? 'Mężczyzna' : g === 'F' ? 'Kobieta' : 'Nieznana'}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              {people.size > 0 && <button type="button" onClick={() => setCreating(false)} className="mr-auto h-8 rounded-md px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">Wróć do listy</button>}
              {onCancel && <button type="button" onClick={onCancel} className="h-8 rounded-md px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">Anuluj</button>}
              <button type="submit" disabled={(!givenNames.trim() && !surname.trim()) || !gender} className="h-8 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">Utwórz mój rekord</button>
            </div>
          </form>
        ) : (
          <>
            <div className="px-5 pt-4">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" />
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Szukaj siebie…" className="h-9 w-full rounded-md border border-zinc-200 bg-white pr-2 pl-8 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-800" />
              </div>
            </div>
            <ul className="mt-2 flex-1 overflow-y-auto px-3 pb-2">
              {results.length === 0 && <li className="px-2 py-3 text-sm text-zinc-500">Brak wyników dla „{query.trim()}”</li>}
              {results.map((person) => (
                <li key={person.id}>
                  <button type="button" onClick={() => onChoose(person.id)} className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${person.id === currentMeId ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}>
                    <Avatar name={displayName(person)} gender={person.gender} size="sm" deceased={isDeceased(person)} />
                    <span className="min-w-0 flex-1 truncate text-sm">{displayName(person)}</span>
                    <span className="font-mono text-[11px] text-zinc-500">{formatLifeYears(person)}</span>
                    {person.id === currentMeId && <span className="text-[11px] font-medium text-zinc-500">obecnie</span>}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
              <button type="button" onClick={() => setCreating(true)} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
                <UserPlus className="size-3.5" />
                Nie ma mnie na liście — utwórz mój rekord
              </button>
              {onCancel && <button type="button" onClick={onCancel} className="h-8 rounded-md px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">Anuluj</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

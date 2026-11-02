import { Minus, Plus, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { DEGREE_RANGES, type DegreeRange, type FamilyDegrees } from '../lib/familyView';
import { countOf, plural } from '../lib/plural';

interface ViewControlsProps {
  degrees?: FamilyDegrees;
  rootName?: string;
  isMine: boolean;
  connection?: { fromName: string; fromIsMe: boolean; name: string; description: string };
  shownCount: number;
  totalCount: number;
  onDegreeChange: (kind: keyof FamilyDegrees, delta: number) => void;
}

const panelClass = 'pointer-events-auto flex flex-wrap items-center rounded-lg border border-zinc-200 bg-white/90 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90';

const FILTERS_HIDDEN_KEY = 'nft:filters-hidden';

function readFiltersHidden(): boolean {
  try { return localStorage.getItem(FILTERS_HIDDEN_KEY) === '1'; } catch { return false; }
}

const generations = (n: number) => (n === 0 ? 'brak' : `${n} ${plural(n, 'pokolenie', 'pokolenia', 'pokoleń')}`);

const kinshipExamples: Record<number, string> = {
  0: 'brak',
  1: 'rodzice i dzieci',
  2: '+ dziadkowie, wnuki, rodzeństwo',
  3: '+ wujostwo, bratankowie i siostrzeńcy, pradziadkowie',
  4: '+ kuzynostwo, prawnuki',
  5: '+ dzieci kuzynostwa, rodzeństwo dziadków',
  6: '+ kuzynostwo drugiego stopnia',
};

const affinityExamples: Record<number, string> = {
  0: 'tylko małżonek',
  1: 'teściowie, pasierbowie',
  2: '+ szwagrowie i szwagierki, dziadkowie małżonka',
  3: '+ wujostwo i siostrzeńcy małżonka',
  4: '+ kuzynostwo małżonka',
  5: '+ dalsza rodzina małżonka',
  6: '+ dalsza rodzina małżonka',
};

const controls: { kind: keyof FamilyDegrees; label: string; describe: (value: number) => string }[] = [
  { kind: 'ancestors', label: 'Przodkowie', describe: (n) => `linia prosta w górę: ${generations(n)}` },
  { kind: 'descendants', label: 'Potomkowie', describe: (n) => `linia prosta w dół: ${generations(n)}` },
  { kind: 'kinship', label: 'Pokrewieństwo', describe: (n) => `stopień ${n}: ${kinshipExamples[n] ?? ''}` },
  { kind: 'affinity', label: 'Powinowactwo', describe: (n) => `stopień ${n}: ${affinityExamples[n] ?? ''}` },
];

function Stepper({ label, value, range, description, onChange }: { label: string; value: number; range: DegreeRange; description: string; onChange: (delta: number) => void }) {
  const button = 'grid size-6 place-items-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-zinc-800 dark:hover:text-zinc-100';
  return (
    <div className="flex h-[30px] items-center justify-between gap-1 px-1.5" title={`${label} — ${description}`}>
      <span className="mr-auto pl-1 text-xs text-zinc-500">{label}</span>
      <button type="button" className={button} onClick={() => onChange(-1)} disabled={value <= range.min} aria-label={`${label}: mniej`}><Minus className="size-3" /></button>
      <span className="w-3 text-center font-mono text-xs tabular-nums">{value}</span>
      <button type="button" className={button} onClick={() => onChange(1)} disabled={value >= range.max} aria-label={`${label}: więcej`}><Plus className="size-3" /></button>
    </div>
  );
}

function FilterPanel({ degrees, onDegreeChange, className = '' }: { degrees: FamilyDegrees; onDegreeChange: ViewControlsProps['onDegreeChange']; className?: string }) {
  return (
    <div className={`${panelClass} grid grid-cols-2 sm:flex sm:divide-x sm:divide-zinc-200 sm:dark:divide-zinc-800 ${className}`}>
      {controls.map(({ kind, label, describe }) => (
        <Stepper key={kind} label={label} value={degrees[kind]} range={DEGREE_RANGES[kind]} description={describe(degrees[kind])} onChange={(d) => onDegreeChange(kind, d)} />
      ))}
    </div>
  );
}

export function ViewControls({ degrees, rootName, isMine, connection, shownCount, totalCount, onDegreeChange }: ViewControlsProps) {
  // On a phone the filters can be hidden, as they cover a good part of the tree; the heading is left out there as the tab already names the tree.
  const [filtersHidden, setFiltersHidden] = useState(readFiltersHidden);
  const toggleFilters = () => setFiltersHidden((hidden) => {
    try { localStorage.setItem(FILTERS_HIDDEN_KEY, hidden ? '0' : '1'); } catch { /* the choice is just not remembered */ }
    return !hidden;
  });
  return (
    <>
    <div className="pointer-events-none absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2">
      {connection ? (
        <div className="pointer-events-auto max-w-full rounded-lg bg-zinc-50/90 px-2 py-1 backdrop-blur dark:bg-zinc-950/90">
          <h2 className="truncate text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Powiązanie: {connection.fromName} ↔ {connection.name}</h2>
          <p className="text-xs text-zinc-500">{connection.fromIsMe ? 'Dla mnie' : `Dla: ${connection.fromName}`} — {connection.name} to {connection.description.charAt(0).toLowerCase() + connection.description.slice(1)}</p>
        </div>
      ) : rootName && (
        <h2 className="pointer-events-auto max-w-full truncate max-sm:hidden rounded-lg bg-zinc-50/90 px-2 py-0.5 backdrop-blur dark:bg-zinc-950/90 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100" title={`Widoczne: ${shownCount} z ${countOf(totalCount, 'osoby', 'osób', 'osób')}`}>
          {isMine ? 'Moje drzewo' : <>Drzewo: <span className="font-medium">{rootName}</span></>}
        </h2>
      )}
      <div className="flex flex-wrap items-center gap-2">
      {!connection && degrees && <FilterPanel degrees={degrees} onDegreeChange={onDegreeChange} className="max-sm:hidden" />}
      </div>
    </div>
    {!connection && degrees && (
      <div className="pointer-events-none absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] items-start gap-2 sm:hidden">
        <button type="button" onClick={toggleFilters} aria-pressed={!filtersHidden} aria-label={filtersHidden ? 'Pokaż filtry' : 'Ukryj filtry'} title={filtersHidden ? 'Pokaż filtry' : 'Ukryj filtry'} className={`pointer-events-auto grid size-8 shrink-0 place-items-center rounded-lg border shadow-sm backdrop-blur sm:hidden ${filtersHidden ? 'border-zinc-200 bg-white/90 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/90' : 'border-zinc-300 bg-zinc-100/90 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-100'}`}><SlidersHorizontal className="size-3.5" /></button>
        {!filtersHidden && <FilterPanel degrees={degrees} onDegreeChange={onDegreeChange} />}
      </div>
    )}
    </>
  );
}

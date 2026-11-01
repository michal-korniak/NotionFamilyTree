import type { ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { DEGREE_RANGES, type DegreeRange, type FamilyDegrees } from '../lib/familyView';
import { countOf, plural } from '../lib/plural';

interface ViewControlsProps {
  degrees?: FamilyDegrees;
  rootName?: string;
  isMine: boolean;
  picker?: ReactNode;
  connection?: { fromName: string; fromIsMe: boolean; name: string; description: string };
  shownCount: number;
  totalCount: number;
  onDegreeChange: (kind: keyof FamilyDegrees, delta: number) => void;
}

const panelClass = 'pointer-events-auto flex flex-wrap items-center rounded-lg border border-zinc-200 bg-white/90 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90';

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
    <div className="flex h-[30px] items-center gap-1 px-1.5" title={`${label} — ${description}`}>
      <span className="pl-1 text-xs text-zinc-500">{label}</span>
      <button type="button" className={button} onClick={() => onChange(-1)} disabled={value <= range.min} aria-label={`${label}: mniej`}><Minus className="size-3" /></button>
      <span className="w-3 text-center font-mono text-xs tabular-nums">{value}</span>
      <button type="button" className={button} onClick={() => onChange(1)} disabled={value >= range.max} aria-label={`${label}: więcej`}><Plus className="size-3" /></button>
    </div>
  );
}

export function ViewControls({ degrees, rootName, isMine, picker, connection, shownCount, totalCount, onDegreeChange }: ViewControlsProps) {
  return (
    <div className="pointer-events-none absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2">
      {connection ? (
        <div className="pointer-events-auto max-w-full rounded-lg bg-zinc-50/90 px-2 py-1 backdrop-blur dark:bg-zinc-950/90">
          <h2 className="truncate text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Powiązanie: {connection.fromName} ↔ {connection.name}</h2>
          <p className="text-xs text-zinc-500">{connection.fromIsMe ? 'Dla mnie' : `Dla: ${connection.fromName}`} — {connection.name} to {connection.description.charAt(0).toLowerCase() + connection.description.slice(1)}</p>
        </div>
      ) : rootName && (
        <h2 className="pointer-events-auto max-w-full truncate rounded-lg bg-zinc-50/90 px-2 py-0.5 backdrop-blur dark:bg-zinc-950/90 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100" title={`Widoczne: ${shownCount} z ${countOf(totalCount, 'osoby', 'osób', 'osób')}`}>
          {isMine ? 'Moje drzewo' : <>Drzewo: <span className="font-medium">{rootName}</span></>}
        </h2>
      )}
      <div className="flex flex-wrap items-center gap-2">
      {picker}
      {!connection && degrees && <div className={`${panelClass} divide-x divide-zinc-200 dark:divide-zinc-800`}>
        {controls.map(({ kind, label, describe }) => (
          <Stepper key={kind} label={label} value={degrees[kind]} range={DEGREE_RANGES[kind]} description={describe(degrees[kind])} onChange={(d) => onDegreeChange(kind, d)} />
        ))}
      </div>}
      </div>
    </div>
  );
}

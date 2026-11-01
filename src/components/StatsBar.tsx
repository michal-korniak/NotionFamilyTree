import { useEffect, useRef, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import type { TreeStats } from '../types/person';

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-1.5">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="font-mono text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function StatsBar({ stats }: { stats: TreeStats }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('pointerdown', onPointerDown); window.removeEventListener('keydown', onKeyDown); };
  }, [open]);

  const span = stats.earliestYear !== undefined ? `${stats.earliestYear}–${stats.latestYear}` : '—';
  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Statystyki drzewa" className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors ${open ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>
        <BarChart3 className="size-4" />
        <span className="font-mono tabular-nums">{stats.total}</span>
        <span className="hidden sm:inline">osób</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-64 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-1 text-[11px] font-medium tracking-wider text-zinc-500 uppercase">Statystyki drzewa</h3>
          <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
            <Row label="Osoby" value={stats.total} />
            <Row label="Pokolenia" value={stats.generations} />
            <Row label="Mężczyźni / kobiety" value={`${stats.male} / ${stats.female}`} />
            {stats.unknownGender > 0 && <Row label="Płeć nieznana" value={stats.unknownGender} />}
            {stats.isolated > 0 && <Row label="Bez krewnych" value={stats.isolated} />}
            <Row label="Urodzenia" value={span} />
          </dl>
        </div>
      )}
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import type { UnionDetails } from '../types/person';
import { focusOnOpen, useOpenForm } from '../hooks/useOpenForm';
import { DateField } from './DateField';

// The options of Notion's "Rodzaj" select in the Związki database.
const UNION_KINDS = ['Małżeństwo', 'Narzeczeństwo', 'Nieformalny'] as const;

interface UnionFormProps {
  initial: UnionDetails;
  onSave: (details: UnionDetails) => void;
  onCancel: () => void;
}

const inputClass = 'w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-800';
const labelClass = 'mb-0.5 block text-[10px] font-medium tracking-wider text-zinc-500 uppercase';

const optional = (value: string) => value.trim() || undefined;

export function UnionForm({ initial, onSave, onCancel }: UnionFormProps) {
  const [kind, setKind] = useState<string>(initial.kind ?? UNION_KINDS[0]);
  const [date, setDate] = useState(initial.date ?? '');
  const [dateError, setDateError] = useState<string | null>(null);
  const [showDateError, setShowDateError] = useState(false);
  const [place, setPlace] = useState(initial.place ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const kinds = initial.kind && !UNION_KINDS.includes(initial.kind as (typeof UNION_KINDS)[number]) ? [...UNION_KINDS, initial.kind] : [...UNION_KINDS];

  const details = { kind: optional(kind), date: optional(date), place: optional(place), notes: optional(notes) };
  const save = () => { if (dateError) { setShowDateError(true); return false; } onSave(details); return true; };
  useOpenForm({ isDirty: () => (['kind', 'date', 'place', 'notes'] as const).some((field) => (details[field] ?? '') !== (field === 'kind' ? initial.kind ?? UNION_KINDS[0] : initial[field] ?? '')), save, discard: onCancel });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save();
  };

  return (
    <form onSubmit={submit} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }} className="space-y-2 border-t border-zinc-100 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div>
        <span className={labelClass}>Rodzaj związku</span>
        <div className="flex flex-wrap gap-1">
          {kinds.map((option) => (
            <button key={option} type="button" onClick={() => setKind(option)} className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${kind === option ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>{option}</button>
          ))}
        </div>
      </div>
      <div>
        <span className={labelClass}>Data</span>
        <DateField value={date} onChange={(value, error) => { setDate(value); setDateError(error); }} invalid={showDateError && Boolean(dateError)} />
      </div>
      <label className="block"><span className={labelClass}>Miejsce</span><input autoFocus={focusOnOpen()} value={place} onChange={(e) => setPlace(e.target.value)} className={inputClass} /></label>
      <label className="block"><span className={labelClass}>Notatki</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-y`} /></label>
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} className="h-7 rounded-md px-2.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">Anuluj</button>
        <button type="submit" className="h-7 rounded-md bg-zinc-900 px-2.5 text-[11px] font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">Zapisz</button>
      </div>
    </form>
  );
}

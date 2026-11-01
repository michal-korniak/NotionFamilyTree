import { useState } from 'react';
import { ChevronRight, Pencil, Plus, X } from 'lucide-react';
import type { Gender, PeopleById, UnionDetails } from '../types/person';
import { UnionForm } from './UnionForm';
import { formatLifeYears, isDeceased } from '../lib/dates';
import { Avatar } from './Avatar';
import { displayName } from '../lib/names';
import { RelativePicker } from './RelativePicker';
import type { NewPersonNames } from '../lib/treeEdits';
import { relationStyles, type Relation } from '../lib/relationColors';

export interface RelativeEditing {
  exclude: ReadonlySet<string>;
  addLabel: string;
  canAdd: boolean;
  onAdd: (id: string, secondParentId?: string | null) => string | null;
  onCreate: (names: NewPersonNames, gender: Gender, secondParentId?: string | null) => string | null;
  suggestedSurname?: string;
  onRemove: (id: string) => void;
  // When the new relative's gender follows from the relation (a spouse of a man is a woman), the picker does not ask for it.
  presetGender?: Gender;
  // Offered as the other parent when adding a child (the person's spouses); the first one is preselected.
  secondParents?: { id: string; label: string }[];
}

interface RelativeListProps {
  title: string;
  relation?: Relation;
  ids: string[];
  people: PeopleById;
  onSelect: (id: string) => void;
  editing?: RelativeEditing;
  describe?: (id: string) => string | undefined;
  unionEditor?: { get: (id: string) => UnionDetails | undefined; save: (id: string, details: UnionDetails) => void };
}

export function RelativeList({ title, relation, ids, people, onSelect, editing, describe, unionEditor }: RelativeListProps) {
  const [picking, setPicking] = useState(false);
  const [editingUnionOf, setEditingUnionOf] = useState<string | null>(null);
  const relatives = ids.map((id) => people.get(id)).filter((p) => p !== undefined);
  return (
    <section>
      <h3 className="mb-1.5 flex h-6 items-center gap-2 text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
        {relation && <span className={`size-2 rounded-full ${relationStyles[relation].dot}`} aria-hidden />}
        {title}
        <span className="font-mono text-zinc-400">{relatives.length}</span>
        {editing?.canAdd && !picking && (
          <button type="button" onClick={() => setPicking(true)} className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium tracking-normal text-zinc-500 normal-case transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100">
            <Plus className="size-3" />
            {editing.addLabel}
          </button>
        )}
      </h3>
      {editing && picking && <RelativePicker people={people} exclude={editing.exclude} placeholder="Szukaj albo wpisz nowe imię…" onPick={editing.onAdd} onCreate={editing.onCreate} presetGender={editing.presetGender} suggestedSurname={editing.suggestedSurname} secondParents={editing.secondParents} onClose={() => setPicking(false)} />}
      {relatives.length === 0 ? (
        !picking && <p className="rounded-md border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-400 dark:border-zinc-800">Brak</p>
      ) : (
        <ul className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
          {relatives.map((person) => (
            <li key={person.id} className="border-b border-zinc-200 last:border-b-0 dark:border-zinc-800">
              <div className="group/row relative">
                <button type="button" onClick={() => onSelect(person.id)} className="group flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  <Avatar name={displayName(person)} gender={person.gender} size="sm" deceased={isDeceased(person)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{displayName(person)}</span>
                    <span className="block font-mono text-[11px] text-zinc-500">{formatLifeYears(person)}</span>
                    {describe?.(person.id) && <span className="mt-0.5 block truncate text-[11px] text-amber-700 dark:text-amber-400" title={describe(person.id)}>{describe(person.id)}</span>}
                  </span>
                  {!editing && !unionEditor && <ChevronRight className="size-4 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-500 dark:text-zinc-700" />}
                </button>
                {unionEditor && editingUnionOf !== person.id && (
                  <button type="button" onClick={() => setEditingUnionOf(person.id)} aria-label={`Edytuj związek z: ${displayName(person)}`} title="Edytuj związek" className={`absolute top-1/2 ${editing ? 'right-9' : 'right-2'} grid size-6 -translate-y-1/2 place-items-center rounded text-zinc-400 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-100`}>
                    <Pencil className="size-3.5" />
                  </button>
                )}
                {editing && (
                  <button type="button" onClick={() => editing.onRemove(person.id)} aria-label={`Usuń powiązanie: ${person.name}`} title="Usuń powiązanie" className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-zinc-400 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 dark:hover:bg-red-950/50 dark:hover:text-red-400">
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              {unionEditor && editingUnionOf === person.id && <UnionForm initial={unionEditor.get(person.id) ?? {}} onSave={(details) => { unionEditor.save(person.id, details); setEditingUnionOf(null); }} onCancel={() => setEditingUnionOf(null)} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

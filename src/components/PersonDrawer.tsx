import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Cake, Flower2, Hourglass, Link2, Pencil, Trash2, Users, X } from 'lucide-react';
import type { Gender, PeopleById, Person, UnionDetails } from '../types/person';
import { siblingIds, type NewPersonNames, type PersonDetails, type RelativeKind } from '../lib/treeEdits';
import { computeAge, formatDate, formatLifeYears, hasKnownDate, isDeceased } from '../lib/dates';
import { relativesOf } from '../lib/relationships';
import { Avatar } from './Avatar';
import { displayName, maidenName } from '../lib/names';
import { GenderBadge } from './GenderBadge';
import { IconButton } from './IconButton';
import { PersonForm } from './PersonForm';
import { RelativeList, type RelativeEditing } from './RelativeList';
import { countOf } from '../lib/plural';

export interface PersonEditActions {
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveDetails: (details: PersonDetails) => void;
  onDelete: () => void;
  onAddRelation: (kind: RelativeKind, otherId: string, secondParentId?: string | null) => string | null;
  onCreateRelative: (kind: RelativeKind, names: NewPersonNames, gender: Gender, secondParentId?: string | null) => string | null;
  onRemoveRelation: (kind: RelativeKind, otherId: string) => void;
}

interface PersonDrawerProps {
  person: Person | null;
  open: boolean;
  editing: boolean;
  people: PeopleById;
  describeUnion?: (personId: string, spouseId: string) => string | undefined;
  unions: { get: (personId: string, spouseId: string) => UnionDetails | undefined; save: (personId: string, spouseId: string, details: UnionDetails) => void };
  actions: PersonEditActions;
  onSelect: (id: string) => void;
  onFocus: (id: string) => void;
  onShowFamily: (id: string) => void;
  isNew?: boolean;
  relationToMe?: string;
  onShowConnection?: (id: string) => void;
  onClose: () => void;
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2">
      <div className="mt-0.5 text-zinc-400">{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] tracking-wider text-zinc-500 uppercase">{label}</div>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}

function withPlace(date: string | undefined, place: string | undefined) {
  const knownDate = hasKnownDate(date);
  return (
    <>
      {knownDate && formatDate(date)}
      {place && <span className={knownDate ? 'text-zinc-500' : undefined}>{knownDate ? ' · ' : ''}{place}</span>}
    </>
  );
}

function PersonDetailsView({ person, relationToMe, actions }: { person: Person; relationToMe?: string; actions?: ReactNode }) {
  const age = computeAge(person);
  const showBorn = hasKnownDate(person.birthDate) || Boolean(person.birthPlace);
  const showDied = hasKnownDate(person.deathDate) || Boolean(person.deathPlace);
  return (
    <>
      <div className="flex items-center gap-4">
        <Avatar name={displayName(person)} gender={person.gender} size="lg" deceased={isDeceased(person)} />
        <div className="min-w-0">
          <h2 className="text-lg leading-tight font-semibold break-words">{displayName(person)}</h2>
          {maidenName(person) && <div className="mt-0.5 text-sm text-zinc-500">z domu {maidenName(person)}</div>}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-zinc-500">{formatLifeYears(person)}</span>
            <GenderBadge gender={person.gender} withTitle />
          </div>
          {relationToMe && <div className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400" title="Powiązanie ze mną">{relationToMe}</div>}
        </div>
      </div>
      {actions}

      {(showBorn || showDied || age !== undefined) && (
        <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 px-3 dark:divide-zinc-900 dark:border-zinc-800">
          {showBorn && <Fact icon={<Cake className="size-4" />} label="Urodziny">{withPlace(person.birthDate, person.birthPlace)}</Fact>}
          {showDied && <Fact icon={<Flower2 className="size-4" />} label="Śmierć">{withPlace(person.deathDate, person.deathPlace)}</Fact>}
          {age !== undefined && <Fact icon={<Hourglass className="size-4" />} label={isDeceased(person) ? 'Wiek w chwili śmierci' : 'Wiek'}>{countOf(age, 'rok', 'lata', 'lat')}</Fact>}
        </div>
      )}

      <section>
        <h3 className="mb-1.5 text-[11px] font-medium tracking-wider text-zinc-500 uppercase">Biografia</h3>
        {person.biography ? <p className="text-sm leading-relaxed whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{person.biography}</p> : <p className="text-sm text-zinc-400 italic">Brak biografii.</p>}
      </section>
    </>
  );
}

function DeleteConfirmation({ person, onCancel, onConfirm }: { person: Person; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div role="alertdialog" aria-label={`Usuń: ${person.name}`} className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/40">
      <p className="text-sm font-medium text-red-800 dark:text-red-200">Usunąć: {displayName(person)}?</p>
      <p className="mt-1 text-xs text-red-700/80 dark:text-red-300/80">Możesz cofnąć przez Ctrl+Z.</p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" autoFocus onClick={onCancel} className="h-7 rounded-md px-3 text-xs font-medium text-zinc-700 hover:bg-red-100 dark:text-zinc-300 dark:hover:bg-red-900/40">Anuluj</button>
        <button type="button" onClick={onConfirm} className="h-7 rounded-md bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700">Usuń</button>
      </div>
    </div>
  );
}

function DrawerBody({ person, people, editing, isNew, describeUnion, unions, relationToMe, onShowConnection, actions, onSelect, onShowFamily, onClose }: Omit<PersonDrawerProps, 'person' | 'open'> & { person: Person }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const siblings = useMemo(() => siblingIds(people, person.id), [people, person.id]);
  const exclude = useMemo(() => new Set([person.id, ...relativesOf(person), ...siblings]), [person, siblings]);

  const father = person.gender === 'M' ? person : person.spouses.map((id) => people.get(id)).find((spouse) => spouse?.gender === 'M');
  const childSurname = father?.birthSurname;
  const relationEditing = (kind: RelativeKind, addLabel: string, canAdd = true): RelativeEditing => ({ exclude, addLabel, canAdd, onAdd: (id) => actions.onAddRelation(kind, id), onCreate: (names, gender) => actions.onCreateRelative(kind, names, gender), suggestedSurname: kind === 'siblings' ? person.birthSurname : kind === 'children' ? childSurname : undefined, onRemove: (id) => actions.onRemoveRelation(kind, id) });

  return (
    <>
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <span className="font-mono text-[11px] text-zinc-400">id: {person.id}</span>
        <div className="flex items-center gap-1">
          {!editing && <IconButton label="Edytuj dane" onClick={actions.onStartEdit}><Pencil className="size-4" /></IconButton>}
          <IconButton label="Usuń osobę" onClick={() => setConfirmingDelete(true)}><Trash2 className="size-4" /></IconButton>
          <IconButton label="Zamknij" onClick={onClose}><X className="size-4" /></IconButton>
        </div>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        {confirmingDelete && <DeleteConfirmation person={person} onCancel={() => setConfirmingDelete(false)} onConfirm={actions.onDelete} />}
        {editing ? <PersonForm person={person} isNew={isNew} onSave={actions.onSaveDetails} onCancel={actions.onCancelEdit} /> : <PersonDetailsView person={person} relationToMe={relationToMe} actions={(
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onShowFamily(person.id)} className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 ${onShowConnection && relationToMe ? '' : 'col-span-2'}`}>
              <Users className="size-3.5" />
              Drzewo tej osoby
            </button>
            {onShowConnection && relationToMe && (
              <button type="button" onClick={() => onShowConnection(person.id)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
                <Link2 className="size-3.5" />
                Powiązanie ze mną
              </button>
            )}
          </div>
        )} />}
        <div className="space-y-4">
          <RelativeList title="Rodzice" relation="parent" ids={person.parents} people={people} onSelect={onSelect} editing={relationEditing('parents', 'Dodaj rodzica', person.parents.length < 2)} />
          <RelativeList title="Małżonkowie" relation="spouse" ids={person.spouses} people={people} onSelect={onSelect} editing={{ ...relationEditing('spouses', 'Dodaj małżonka'), presetGender: person.gender === 'M' ? 'F' : person.gender === 'F' ? 'M' : undefined }} describe={describeUnion ? (spouseId) => describeUnion(person.id, spouseId) : undefined} unionEditor={{ get: (spouseId) => unions.get(person.id, spouseId), save: (spouseId, details) => unions.save(person.id, spouseId, details) }} />
          <RelativeList title="Rodzeństwo" ids={siblings} people={people} onSelect={onSelect} editing={relationEditing('siblings', 'Dodaj rodzeństwo')} />
          <RelativeList title="Dzieci" relation="child" ids={person.children} people={people} onSelect={onSelect} editing={{ ...relationEditing('children', 'Dodaj dziecko'), secondParents: person.spouses.filter((id) => people.has(id)).map((id) => ({ id, label: displayName(people.get(id)!) })), onAdd: (id, secondParentId) => actions.onAddRelation('children', id, secondParentId), onCreate: (names, gender, secondParentId) => actions.onCreateRelative('children', names, gender, secondParentId) }} />
        </div>
      </div>
    </>
  );
}

export function PersonDrawer({ person, open, ...rest }: PersonDrawerProps) {
  const { onClose } = rest;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const inField = event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
      if (event.key === 'Escape' && !inField) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Visibility is only transitioned on close (to keep the panel visible while it slides out); on open it must flip immediately so autoFocus inside works.
  return (
    <aside inert={!open} className={`absolute inset-y-0 right-0 z-30 flex w-full flex-col border-l border-zinc-200 bg-white duration-300 ease-out sm:w-[400px] dark:border-zinc-800 dark:bg-zinc-950 ${open ? 'visible translate-x-0 shadow-2xl transition-[translate,box-shadow]' : 'pointer-events-none invisible translate-x-full transition-[translate,box-shadow,visibility]'}`}>
      {person && <DrawerBody key={person.id} person={person} {...rest} />}
    </aside>
  );
}

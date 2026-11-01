import type { Gender, PeopleById, Person } from '../types/person';
import { composeName } from './names';

export type RelationKind = 'parents' | 'children' | 'spouses';

export type PersonDetails = Pick<Person, 'name' | 'gender' | 'birthDate' | 'deathDate' | 'birthPlace' | 'deathPlace' | 'biography' | 'givenNames' | 'birthSurname' | 'marriedSurname'>;

export type EditResult = { ok: true; people: PeopleById } | { ok: false; error: string };

const inverse: Record<RelationKind, RelationKind> = { parents: 'children', children: 'parents', spouses: 'spouses' };

const relationLabel: Record<RelationKind, string> = { parents: 'rodzicem', children: 'dzieckiem', spouses: 'małżonkiem' };

const MAX_PARENTS = 2;

export function nextId(people: PeopleById): string {
  const numeric = [...people.keys()].map(Number).filter(Number.isSafeInteger);
  if (numeric.length === people.size) return String((numeric.length ? Math.max(...numeric) : 0) + 1);
  let id: string;
  do id = `p${Math.random().toString(36).slice(2, 8)}`; while (people.has(id));
  return id;
}

function isAncestor(people: PeopleById, ancestorId: string, personId: string): boolean {
  const queue = [...(people.get(personId)?.parents ?? [])];
  const seen = new Set(queue);
  while (queue.length) {
    const id = queue.shift()!;
    if (id === ancestorId) return true;
    for (const parent of people.get(id)?.parents ?? []) if (!seen.has(parent)) { seen.add(parent); queue.push(parent); }
  }
  return false;
}

export function createPerson(people: PeopleById, details: PersonDetails): { people: PeopleById; id: string } {
  const id = nextId(people);
  const next = new Map(people);
  next.set(id, { ...details, id, parents: [], children: [], spouses: [] });
  return { people: next, id };
}

export function updatePersonDetails(people: PeopleById, id: string, details: PersonDetails): PeopleById {
  const person = people.get(id);
  if (!person) return people;
  const next = new Map(people);
  next.set(id, { ...person, ...details });
  return next;
}

export function deletePerson(people: PeopleById, id: string): PeopleById {
  const next = new Map(people);
  next.delete(id);
  for (const [otherId, other] of next) {
    if (other.parents.includes(id) || other.children.includes(id) || other.spouses.includes(id)) {
      next.set(otherId, { ...other, parents: other.parents.filter((x) => x !== id), children: other.children.filter((x) => x !== id), spouses: other.spouses.filter((x) => x !== id) });
    }
  }
  return next;
}

export function relationError(people: PeopleById, id: string, kind: RelationKind, otherId: string): string | null {
  const person = people.get(id);
  const other = people.get(otherId);
  if (!person || !other) return 'Nie znaleziono osoby.';
  if (id === otherId) return 'Osoba nie może być spokrewniona sama ze sobą.';
  for (const existing of ['parents', 'children', 'spouses'] as const) {
    if (person[existing].includes(otherId)) return `${other.name} jest już ${relationLabel[existing]} osoby ${person.name}.`;
  }
  if (kind === 'parents' && person.parents.length >= MAX_PARENTS) return `${person.name} ma już dwoje rodziców.`;
  if (kind === 'children' && other.parents.length >= MAX_PARENTS) return `${other.name} ma już dwoje rodziców.`;
  if (kind === 'parents' && isAncestor(people, id, otherId)) return `${other.name} jest potomkiem osoby ${person.name}.`;
  if (kind === 'children' && isAncestor(people, otherId, id)) return `${other.name} jest przodkiem osoby ${person.name}.`;
  return null;
}

export function addRelation(people: PeopleById, id: string, kind: RelationKind, otherId: string): EditResult {
  const error = relationError(people, id, kind, otherId);
  if (error) return { ok: false, error };
  const person = people.get(id)!;
  const other = people.get(otherId)!;
  const next = new Map(people);
  next.set(id, { ...person, [kind]: [...person[kind], otherId] });
  next.set(otherId, { ...other, [inverse[kind]]: [...other[inverse[kind]], id] });
  return { ok: true, people: next };
}

export function removeRelation(people: PeopleById, id: string, kind: RelationKind, otherId: string): PeopleById {
  const person = people.get(id);
  const other = people.get(otherId);
  if (!person || !other) return people;
  const next = new Map(people);
  next.set(id, { ...person, [kind]: person[kind].filter((x) => x !== otherId) });
  next.set(otherId, { ...other, [inverse[kind]]: other[inverse[kind]].filter((x) => x !== id) });
  return next;
}

export type RelativeKind = RelationKind | 'siblings';

const UNKNOWN_PARENT_NAME = 'Nieznany rodzic';

export function siblingIds(people: PeopleById, id: string): string[] {
  const siblings = new Set<string>();
  for (const parentId of people.get(id)?.parents ?? []) people.get(parentId)?.children.forEach((childId) => siblings.add(childId));
  siblings.delete(id);
  return [...siblings];
}

// Siblings are not stored directly: the other person becomes a child of every parent of this person. Without any parent there is nothing to share, so a placeholder parent is created to connect them.
export function addSibling(people: PeopleById, id: string, otherId: string): EditResult {
  const person = people.get(id);
  const other = people.get(otherId);
  if (!person || !other) return { ok: false, error: 'Nie znaleziono osoby.' };
  if (id === otherId) return { ok: false, error: 'Osoba nie może być własnym rodzeństwem.' };
  if (siblingIds(people, id).includes(otherId)) return { ok: false, error: `${other.name} jest już rodzeństwem osoby ${person.name}.` };
  for (const existing of ['parents', 'children', 'spouses'] as const) {
    if (person[existing].includes(otherId)) return { ok: false, error: `${other.name} jest już ${relationLabel[existing]} osoby ${person.name}.` };
  }
  const combinedParents = new Set([...person.parents, ...other.parents]);
  if (combinedParents.size > MAX_PARENTS) return { ok: false, error: `${other.name} ma już innych rodziców.` };

  let current = people;
  let parentIds = person.parents;
  if (parentIds.length === 0) {
    const created = createPerson(current, { name: UNKNOWN_PARENT_NAME, gender: 'U' });
    const linked = addRelation(created.people, id, 'parents', created.id);
    if (!linked.ok) return linked;
    current = linked.people;
    parentIds = [created.id];
  }
  for (const parentId of parentIds) {
    if (current.get(otherId)!.parents.includes(parentId)) continue;
    const result = addRelation(current, otherId, 'parents', parentId);
    if (!result.ok) return result;
    current = result.people;
  }
  return { ok: true, people: current };
}

export function removeSibling(people: PeopleById, id: string, otherId: string): PeopleById {
  const shared = (people.get(id)?.parents ?? []).filter((parentId) => people.get(otherId)?.parents.includes(parentId));
  return shared.reduce((current, parentId) => removeRelation(current, otherId, 'parents', parentId), people);
}

export function addRelative(people: PeopleById, id: string, kind: RelativeKind, otherId: string): EditResult {
  return kind === 'siblings' ? addSibling(people, id, otherId) : addRelation(people, id, kind, otherId);
}

export function removeRelative(people: PeopleById, id: string, kind: RelativeKind, otherId: string): PeopleById {
  return kind === 'siblings' ? removeSibling(people, id, otherId) : removeRelation(people, id, kind, otherId);
}

export interface NewPersonNames {
  givenNames: string;
  // The surname the person goes by now; it is stored as the married surname because the birth surname of someone added this way is usually unknown.
  surname: string;
}

export function createRelative(people: PeopleById, id: string, kind: RelativeKind, names: NewPersonNames, gender: Gender): EditResult & { id?: string } {
  const parts = { givenNames: names.givenNames, birthSurname: '', marriedSurname: names.surname };
  const { people: withNew, id: newId } = createPerson(people, { name: composeName(parts), ...parts, gender });
  const result = addRelative(withNew, id, kind, newId);
  return result.ok ? { ...result, id: newId } : result;
}

// A child added to one parent is also given the chosen second parent (usually the spouse). If that link is impossible — e.g. the child
// already has two parents — the child keeps just the first parent rather than the whole addition failing.
export function withSecondParent(result: EditResult, childId: string | undefined, secondParentId: string | null | undefined): EditResult {
  if (!result.ok || !childId || !secondParentId) return result;
  const linked = addRelation(result.people, secondParentId, 'children', childId);
  return linked.ok ? linked : result;
}

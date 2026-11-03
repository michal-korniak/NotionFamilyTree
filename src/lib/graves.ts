import type { GraveDetails, PeopleById, Person } from '../types/person';
import { displayName } from './names';
import { dateSortKey } from './dates';
import { relationship } from './kinship';

export function buriedIn(people: PeopleById, graveId: string): Person[] {
  return [...people.values()].filter((person) => person.graveId === graveId);
}

// "Władysław Gębala, Michalina Gębala": everyone buried there, oldest first.
function namesOf(buried: Person[]): string {
  return [...buried].sort((a, b) => (dateSortKey(a.birthDate) ?? Infinity) - (dateSortKey(b.birthDate) ?? Infinity)).map(displayName).join(', ');
}

// A grave is always named after the people buried in it, in the app and as its Notion title; only a grave nobody is in any more
// keeps the name it had.
export function graveTitle(grave: GraveDetails | undefined, buried: Person[]): string {
  return buried.length ? namesOf(buried) : grave?.name?.trim() || 'Grób bez nazwy';
}

export function newGraveId(graves: Record<string, unknown>): string {
  let id: string;
  do id = `grob-${Math.random().toString(36).slice(2, 8)}`; while (graves[id]);
  return id;
}

// How close someone is to the reference person, lower being closer: the degree of kinship as Polish law counts it, a spouse as close as a
// parent or child, an in-law half a step behind a blood relative of the same degree, then distant family, then people not related at all.
export function closenessTo(people: PeopleById, referenceId: string | null): (personId: string) => number {
  const known = new Map<string, number>();
  return (personId) => {
    if (!referenceId) return Infinity;
    if (!known.has(personId)) {
      const rel = relationship(people, referenceId, personId);
      known.set(personId, !rel ? Infinity : rel.kind === 'self' ? 0 : rel.kind === 'spouse' ? 1 : rel.kind === 'blood' ? rel.degree! : rel.kind === 'affinity' ? rel.degree! + 0.5 : 100 + rel.path.length);
    }
    return known.get(personId)!;
  };
}

export interface CemeteryGroup {
  cemetery: string;
  graves: { id: string; grave: GraveDetails; buried: Person[]; closeness: number }[];
  buriedCount: number;
  closeness: number;
}

export const UNKNOWN_CEMETERY = 'Cmentarz nieznany';

// Graves grouped by cemetery. A grave is as close as the closest person buried in it and a cemetery as its closest grave, so the graves of
// the nearest family come first; ties go to the cemetery with more people, then by name. Graves nobody is assigned to, and the cemetery
// that is not known, go last.
export function cemeteryGroups(people: PeopleById, graves: Record<string, GraveDetails>, closeness: (personId: string) => number = () => Infinity): CemeteryGroup[] {
  const groups = new Map<string, CemeteryGroup>();
  const buriedByGrave = new Map<string, Person[]>();
  for (const person of people.values()) if (person.graveId) buriedByGrave.set(person.graveId, [...(buriedByGrave.get(person.graveId) ?? []), person]);
  for (const [id, grave] of Object.entries(graves)) {
    const cemetery = grave.cemetery?.trim() || UNKNOWN_CEMETERY;
    const group = groups.get(cemetery) ?? { cemetery, graves: [], buriedCount: 0, closeness: Infinity };
    const buried = buriedByGrave.get(id) ?? [];
    const graveCloseness = Math.min(Infinity, ...buried.map((person) => closeness(person.id)));
    group.graves.push({ id, grave, buried, closeness: graveCloseness });
    group.buriedCount += buried.length;
    group.closeness = Math.min(group.closeness, graveCloseness);
    groups.set(cemetery, group);
  }
  const collator = new Intl.Collator('pl');
  const byCloseness = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);
  for (const group of groups.values()) group.graves.sort((a, b) => Number(!a.buried.length) - Number(!b.buried.length) || byCloseness(a.closeness, b.closeness) || collator.compare(graveTitle(a.grave, a.buried), graveTitle(b.grave, b.buried)));
  return [...groups.values()].sort((a, b) => Number(a.cemetery === UNKNOWN_CEMETERY) - Number(b.cemetery === UNKNOWN_CEMETERY) || byCloseness(a.closeness, b.closeness) || b.buriedCount - a.buriedCount || collator.compare(a.cemetery, b.cemetery));
}

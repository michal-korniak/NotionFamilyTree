import type { GraveDetails, PeopleById, Person } from '../types/person';
import { displayName } from './names';
import { parseYear } from './dates';
import { siblingIds } from './treeEdits';

export function buriedIn(people: PeopleById, graveId: string): Person[] {
  return [...people.values()].filter((person) => person.graveId === graveId);
}

// "Władysław Gębala, Michalina Gębala": everyone buried there, oldest first.
function namesOf(buried: Person[]): string {
  return [...buried].sort((a, b) => (parseYear(a.birthDate) ?? Infinity) - (parseYear(b.birthDate) ?? Infinity)).map(displayName).join(', ');
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

// Graves of the closest family first (spouses, parents, children, siblings), as people are most often buried with them.
export function familyGraveIds(people: PeopleById, person: Person): string[] {
  const relatives = [...person.spouses, ...person.parents, ...person.children, ...siblingIds(people, person.id)];
  return [...new Set(relatives.map((id) => people.get(id)?.graveId).filter((id): id is string => Boolean(id)))];
}

export interface CemeteryGroup {
  cemetery: string;
  graves: { id: string; grave: GraveDetails; buried: Person[] }[];
  buriedCount: number;
}

export const UNKNOWN_CEMETERY = 'Cmentarz nieznany';

// Graves grouped by cemetery, the largest cemetery first; within a cemetery graves are sorted by title.
export function cemeteryGroups(people: PeopleById, graves: Record<string, GraveDetails>): CemeteryGroup[] {
  const groups = new Map<string, CemeteryGroup>();
  const buriedByGrave = new Map<string, Person[]>();
  for (const person of people.values()) if (person.graveId) buriedByGrave.set(person.graveId, [...(buriedByGrave.get(person.graveId) ?? []), person]);
  for (const [id, grave] of Object.entries(graves)) {
    const cemetery = grave.cemetery?.trim() || UNKNOWN_CEMETERY;
    const group = groups.get(cemetery) ?? { cemetery, graves: [], buriedCount: 0 };
    const buried = buriedByGrave.get(id) ?? [];
    group.graves.push({ id, grave, buried });
    group.buriedCount += buried.length;
    groups.set(cemetery, group);
  }
  const collator = new Intl.Collator('pl');
  for (const group of groups.values()) group.graves.sort((a, b) => collator.compare(graveTitle(a.grave, a.buried), graveTitle(b.grave, b.buried)));
  return [...groups.values()].sort((a, b) => (a.cemetery === UNKNOWN_CEMETERY ? 1 : 0) - (b.cemetery === UNKNOWN_CEMETERY ? 1 : 0) || b.buriedCount - a.buriedCount || collator.compare(a.cemetery, b.cemetery));
}

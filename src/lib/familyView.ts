import type { PeopleById, Person } from '../types/person';

export interface DegreeRange {
  min: number;
  max: number;
  initial: number;
}

export const DEGREE_RANGES = {
  ancestors: { min: 0, max: 8, initial: 2 },
  descendants: { min: 0, max: 8, initial: 2 },
  kinship: { min: 0, max: 6, initial: 2 },
  affinity: { min: 0, max: 6, initial: 1 },
} satisfies Record<string, DegreeRange>;

export type FamilyDegrees = Record<keyof typeof DEGREE_RANGES, number>;

function directLine(people: PeopleById, rootId: string, generations: number, step: (person: Person) => string[]): string[] {
  const found: string[] = [];
  let level = [rootId];
  for (let i = 0; i < generations && level.length; i++) {
    level = [...new Set(level.flatMap((id) => step(people.get(id)!)))].filter((id) => people.has(id));
    found.push(...level);
  }
  return found;
}

// Shortest path over parent–child links, which is how Polish civil law counts degrees: the number of births linking two people
// (parent/child 1, grandparent/sibling 2, uncle/niece 3, first cousin 4).
function relativesWithin(people: PeopleById, starts: string[], degree: number): Set<string> {
  const distance = new Map<string, number>(starts.map((id) => [id, 0]));
  const queue = [...starts];
  while (queue.length) {
    const id = queue.shift()!;
    const d = distance.get(id)!;
    if (d >= degree) continue;
    const person = people.get(id)!;
    for (const next of [...person.parents, ...person.children]) {
      if (!people.has(next) || distance.has(next)) continue;
      distance.set(next, d + 1);
      queue.push(next);
    }
  }
  return new Set(distance.keys());
}

// Each control adds its own group independently and the view shows their union: the direct line up (przodkowie) and down (potomkowie),
// all blood relatives within a degree of consanguinity counted from the focused person (pokrewieństwo), and the spouse's relatives within a
// degree counted from the spouse (powinowactwo). Spouses of everyone shown are added so couples and children's lines stay whole.
export function familyMembers(people: PeopleById, rootId: string, degrees: FamilyDegrees): Set<string> {
  const root = people.get(rootId);
  if (!root) return new Set();
  const spouses = root.spouses.filter((id) => people.has(id));
  const blood = relativesWithin(people, [rootId], degrees.kinship);
  const inLaws = relativesWithin(people, spouses, degrees.affinity);
  const ancestors = directLine(people, rootId, degrees.ancestors, (p) => p.parents);
  const descendants = directLine(people, rootId, degrees.descendants, (p) => p.children);
  const members = new Set([...blood, ...inLaws, ...ancestors, ...descendants]);
  for (const id of [...members]) people.get(id)!.spouses.forEach((spouse) => { if (people.has(spouse)) members.add(spouse); });
  return members;
}

// Relations to people outside the view are dropped so the layout and lines only see what is drawn.
export function restrictTo(people: PeopleById, members: Set<string>): PeopleById {
  const keep = (ids: string[]) => ids.filter((id) => members.has(id));
  const result = new Map<string, Person>();
  for (const id of members) {
    const person = people.get(id)!;
    result.set(id, { ...person, parents: keep(person.parents), children: keep(person.children), spouses: keep(person.spouses) });
  }
  return result;
}

export function hiddenRelativeCounts(people: PeopleById, members: Set<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of members) {
    const person = people.get(id)!;
    const hidden = [...person.parents, ...person.children, ...person.spouses].filter((relative) => people.has(relative) && !members.has(relative)).length;
    if (hidden) counts.set(id, hidden);
  }
  return counts;
}

// Without a remembered focus, start from the person with the most direct relatives: usually the middle of the family rather than an isolated in-law.
export function defaultRoot(people: PeopleById): string | null {
  let best: string | null = null;
  let bestScore = -1;
  for (const person of people.values()) {
    const score = person.parents.length + person.children.length + person.spouses.length * 2;
    if (score > bestScore) { best = person.id; bestScore = score; }
  }
  return best;
}

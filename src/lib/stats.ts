import type { PeopleById, TreeStats } from '../types/person';
import { isDeceased, parseYear } from './dates';

export function computeStats(people: PeopleById, generationCount: number): TreeStats {
  const stats: TreeStats = { total: people.size, generations: generationCount, living: 0, deceased: 0, male: 0, female: 0, unknownGender: 0, isolated: 0 };
  const years: number[] = [];
  for (const person of people.values()) {
    if (isDeceased(person)) stats.deceased++; else stats.living++;
    if (person.gender === 'M') stats.male++; else if (person.gender === 'F') stats.female++; else stats.unknownGender++;
    if (!person.parents.length && !person.children.length && !person.spouses.length) stats.isolated++;
    const birth = parseYear(person.birthDate);
    if (birth !== undefined) years.push(birth);
  }
  if (years.length) { stats.earliestYear = Math.min(...years); stats.latestYear = Math.max(...years); }
  return stats;
}

// Longest chain of parent→child links, the number a genealogist means by "generations"; a visit guard keeps bad data with cycles from looping.
export function generationDepth(people: PeopleById): number {
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const depthBelow = (id: string): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const children = people.get(id)?.children.filter((c) => people.has(c)) ?? [];
    const depth = 1 + (children.length ? Math.max(...children.map(depthBelow)) : 0);
    visiting.delete(id);
    memo.set(id, depth);
    return depth;
  };
  let max = 0;
  for (const person of people.values()) if (!person.parents.some((p) => people.has(p))) max = Math.max(max, depthBelow(person.id));
  return max;
}

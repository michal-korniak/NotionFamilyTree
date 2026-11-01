import type { PeopleById, Person } from '../types/person';
import { displayName } from './names';

export function normalizeForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase();
}

export function searchPeople(people: PeopleById, query: string, limit: number, exclude: ReadonlySet<string> = new Set()): Person[] {
  const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const matches: { person: Person; score: number }[] = [];
  for (const person of people.values()) {
    if (exclude.has(person.id)) continue;
    // The shown name comes first so its first word ranks highest; the stored Notion name is searched too, so either spelling finds the person ("?" included).
    const name = normalizeForSearch(`${displayName(person)} ${person.name}`);
    if (!terms.every((t) => name.includes(t))) continue;
    const score = name.startsWith(terms[0]!) ? 0 : name.split(/\s+/).some((w) => w.startsWith(terms[0]!)) ? 1 : 2;
    matches.push({ person, score });
  }
  return matches.sort((a, b) => a.score - b.score || displayName(a.person).localeCompare(displayName(b.person))).slice(0, limit).map((m) => m.person);
}

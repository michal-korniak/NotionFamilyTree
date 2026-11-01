import type { Person } from '../types/person';

type NameSource = Pick<Person, 'name' | 'givenNames' | 'birthSurname' | 'marriedSurname'>;

export interface NameParts {
  givenNames: string;
  birthSurname: string;
  marriedSurname: string;
}

// Name parts come only from Notion's own columns (Imiona, Nazwisko rodowe, Nazwisko po ślubie); nothing is parsed out of the full
// name, so a wrong or missing part is fixed in Notion, not guessed here.
function hasParts(person: NameSource): boolean {
  return person.givenNames !== undefined || person.birthSurname !== undefined || person.marriedSurname !== undefined;
}

export function nameParts(person: NameSource): NameParts {
  return { givenNames: person.givenNames ?? '', birthSurname: person.birthSurname ?? '', marriedSurname: person.marriedSurname ?? '' };
}

function currentSurname(parts: NameParts): string {
  return parts.marriedSurname.trim() || parts.birthSurname.trim();
}

// Given names and current surname; an unknown first name shows as "?". People without name parts (added before they were imported)
// keep their full name exactly as stored.
export function displayName(person: NameSource): string {
  if (!hasParts(person)) return person.name;
  const parts = nameParts(person);
  const given = parts.givenNames.trim() || '?';
  const surname = currentSurname(parts);
  return surname ? `${given} ${surname}` : given;
}

export function maidenName(person: NameSource): string | undefined {
  const { birthSurname, marriedSurname } = nameParts(person);
  return marriedSurname.trim() && birthSurname.trim() && marriedSurname.trim() !== birthSurname.trim() ? birthSurname.trim() : undefined;
}

// The full name (Notion's title) in the same form as the MyHeritage import: "Imiona Nazwisko", with "(z d. Rodowe)" when the married surname differs.
export function composeName(parts: NameParts): string {
  const base = [parts.givenNames.trim(), currentSurname(parts)].filter(Boolean).join(' ');
  const birth = parts.birthSurname.trim();
  const married = parts.marriedSurname.trim();
  return married && birth && married !== birth ? `${base} (z d. ${birth})` : base;
}

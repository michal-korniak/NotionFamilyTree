import type { Person } from '../types/person';

// Dates may be ISO ("1905-04-12") or free text from genealogy imports ("ok. 20 kwietnia 1875", "styczeń 2001"); the year is the first standalone 3–4 digit number.
const yearPattern = /(?<!\d)(\d{3,4})(?!\d)/;
const approximatePattern = /^(ok\.?|około|abt\.?|about|circa|ca\.?|c\.|~)\s*/i;
const unknownPattern = /^(nieznana|nieznany|unknown|\?)$/i;

export function parseYear(date: string | undefined): number | undefined {
  const match = date?.trim().match(yearPattern);
  return match?.[1] ? Number(match[1]) : undefined;
}

function formatYear(date: string | undefined): string | undefined {
  const year = parseYear(date);
  if (year === undefined) return undefined;
  return approximatePattern.test(date!.trim()) ? `~${year}` : String(year);
}

export function formatLifeYears(person: Person): string {
  const birth = formatYear(person.birthDate);
  const death = formatYear(person.deathDate);
  if (birth === undefined && death === undefined) return '';
  if (death === undefined) return person.deathDate ? `${birth} – ?` : `ur. ${birth}`;
  return `${birth ?? '?'} – ${death}`;
}

export function formatDate(date: string | undefined): string {
  if (!date?.trim()) return '';
  const full = /^\d{4}-\d{2}-\d{2}$/.test(date.trim());
  if (!full) return date.trim();
  const parsed = new Date(`${date.trim()}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date.trim();
  return parsed.toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function computeAge(person: Person, now: Date = new Date()): number | undefined {
  const birth = parseYear(person.birthDate);
  if (birth === undefined) return undefined;
  if (!person.deathDate?.trim() && isDeceased(person, now)) return undefined;
  const end = person.deathDate ? parseYear(person.deathDate) : now.getFullYear();
  if (end === undefined || end < birth) return undefined;
  return end - birth;
}

export function hasKnownDate(value: string | undefined): boolean {
  return Boolean(value?.trim()) && !unknownPattern.test(value!.trim());
}

export function isValidDateText(value: string): boolean {
  return parseYear(value) !== undefined || unknownPattern.test(value.trim());
}

// Old genealogy records often lack a death date; nobody born this long ago is still alive, so they are not counted as living or given an age of 200.
const MAX_LIFESPAN = 110;

export function isDeceased(person: Person, now: Date = new Date()): boolean {
  if (person.deathDate?.trim()) return true;
  const birth = parseYear(person.birthDate);
  return birth !== undefined && now.getFullYear() - birth > MAX_LIFESPAN;
}

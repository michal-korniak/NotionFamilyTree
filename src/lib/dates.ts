import type { Person } from '../types/person';

// Dates are free text in Notion. The form writes them in one of these shapes, which is also how the MyHeritage import spelled them:
// "14 lipca 1870", "lipiec 1870", "1870", each optionally after "ok.", "przed" or "po" ("ok. lipca 1870", "przed lipcem 1870",
// "po lipcu 1870"). Older text in any other shape still yields a year (the first standalone 3–4 digit number) for display and sorting.
const yearPattern = /(?<!\d)(\d{3,4})(?!\d)/;
const unknownPattern = /^(nieznana|nieznany|unknown|\?)$/i;

export type DateQualifier = 'exact' | 'about' | 'before' | 'after';

export interface PartialDate {
  qualifier: DateQualifier;
  year: number;
  month?: number;
  day?: number;
}

// Each month in the four cases dates use: nominative ("lipiec 1870"), genitive ("14 lipca", "ok. lipca"), instrumental ("przed lipcem") and locative ("po lipcu").
const MONTH_FORMS: [string, string, string, string][] = [
  ['styczeń', 'stycznia', 'styczniem', 'styczniu'],
  ['luty', 'lutego', 'lutym', 'lutym'],
  ['marzec', 'marca', 'marcem', 'marcu'],
  ['kwiecień', 'kwietnia', 'kwietniem', 'kwietniu'],
  ['maj', 'maja', 'majem', 'maju'],
  ['czerwiec', 'czerwca', 'czerwcem', 'czerwcu'],
  ['lipiec', 'lipca', 'lipcem', 'lipcu'],
  ['sierpień', 'sierpnia', 'sierpniem', 'sierpniu'],
  ['wrzesień', 'września', 'wrześniem', 'wrześniu'],
  ['październik', 'października', 'październikiem', 'październiku'],
  ['listopad', 'listopada', 'listopadem', 'listopadzie'],
  ['grudzień', 'grudnia', 'grudniem', 'grudniu'],
];

export const MONTH_NAMES = MONTH_FORMS.map(([nominative]) => nominative);

export function polishMonth(word: string): number | undefined {
  const lower = word.toLowerCase();
  const index = MONTH_FORMS.findIndex((forms) => forms.includes(lower));
  return index === -1 ? undefined : index + 1;
}

export const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

const qualifierPattern = /^(ok\.?|około|~|przed|po)\s+/i;

function qualifierOf(word: string): DateQualifier {
  const lower = word.toLowerCase();
  return lower === 'przed' ? 'before' : lower === 'po' ? 'after' : 'about';
}

function validParts(year: number, month?: number, day?: number): boolean {
  if (month !== undefined && (month < 1 || month > 12)) return false;
  return day === undefined || (month !== undefined && day >= 1 && day <= daysInMonth(year, month));
}

export function parsePartialDate(text: string | undefined): PartialDate | null {
  let rest = text?.trim() ?? '';
  if (!rest) return null;
  let qualifier: DateQualifier = 'exact';
  const prefix = qualifierPattern.exec(rest) ?? /^(~)\s*/.exec(rest);
  if (prefix) { qualifier = qualifierOf(prefix[1]!); rest = rest.slice(prefix[0].length); }
  let year: number, month: number | undefined, day: number | undefined;
  const iso = /^(\d{3,4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(rest);
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{3,4})$/.exec(rest);
  const written = /^(?:(\d{1,2})\.?\s+)?([a-ząćęłńóśźż]+)\s+(\d{3,4})$/i.exec(rest);
  if (iso) [year, month, day] = [Number(iso[1]), iso[2] ? Number(iso[2]) : undefined, iso[3] ? Number(iso[3]) : undefined];
  else if (dotted) [year, month, day] = [Number(dotted[3]), Number(dotted[2]), Number(dotted[1])];
  else if (written) {
    month = polishMonth(written[2]!);
    if (month === undefined) return null;
    [year, day] = [Number(written[3]), written[1] ? Number(written[1]) : undefined];
  } else return null;
  return validParts(year, month, day) ? { qualifier, year, month, day } : null;
}

export function formatPartialDate({ qualifier, year, month, day }: PartialDate): string {
  const monthName = month ? MONTH_FORMS[month - 1]! : undefined;
  if (day && monthName) return `${{ exact: '', about: 'ok. ', before: 'przed ', after: 'po ' }[qualifier]}${day} ${monthName[1]} ${year}`;
  if (monthName) return `${{ exact: monthName[0], about: `ok. ${monthName[1]}`, before: `przed ${monthName[2]}`, after: `po ${monthName[3]}` }[qualifier]} ${year}`;
  return `${{ exact: '', about: 'ok. ', before: 'przed ', after: 'po ' }[qualifier]}${year}`;
}

export function parseYear(date: string | undefined): number | undefined {
  const parsed = parsePartialDate(date);
  if (parsed) return parsed.year;
  const match = date?.trim().match(yearPattern);
  return match?.[1] ? Number(match[1]) : undefined;
}

// Orders by year, then month, then day; a missing month or day counts as the start of the year or month.
export function dateSortKey(date: string | undefined): number | undefined {
  const parsed = parsePartialDate(date);
  if (parsed) return parsed.year * 10000 + (parsed.month ?? 0) * 100 + (parsed.day ?? 0);
  const year = parseYear(date);
  return year === undefined ? undefined : year * 10000;
}

const yearMarks: Record<DateQualifier, string> = { exact: '', about: '~', before: '<', after: '>' };

function formatYear(date: string | undefined): string | undefined {
  const parsed = parsePartialDate(date);
  if (parsed) return `${yearMarks[parsed.qualifier]}${parsed.year}`;
  const year = parseYear(date);
  if (year === undefined) return undefined;
  return /^(ok\.?|około|abt\.?|about|circa|ca\.?|c\.|~)\s*/i.test(date!.trim()) ? `~${year}` : String(year);
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
  const parsed = parsePartialDate(date);
  return parsed ? formatPartialDate(parsed) : date.trim();
}

export interface Age {
  years: number;
  // Not every part of both dates is known, or one is "ok.", "przed" or "po", so the real age may differ by a year or more.
  approximate: boolean;
}

export function computeAge(person: Person, now: Date = new Date()): Age | undefined {
  const birth = parsePartialDate(person.birthDate);
  const birthYear = birth?.year ?? parseYear(person.birthDate);
  if (birthYear === undefined) return undefined;
  if (!person.deathDate?.trim() && isDeceased(person, now)) return undefined;
  const death = person.deathDate ? parsePartialDate(person.deathDate) : { qualifier: 'exact' as const, year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  const deathYear = death?.year ?? parseYear(person.deathDate);
  if (deathYear === undefined || deathYear < birthYear) return undefined;
  const complete = (date: PartialDate | null) => date?.qualifier === 'exact' && date.month !== undefined && date.day !== undefined;
  if (complete(birth) && complete(death)) {
    const beforeBirthday = death!.month! < birth!.month! || (death!.month === birth!.month && death!.day! < birth!.day!);
    return { years: deathYear - birthYear - (beforeBirthday ? 1 : 0), approximate: false };
  }
  return { years: deathYear - birthYear, approximate: true };
}

export function hasKnownDate(value: string | undefined): boolean {
  return Boolean(value?.trim()) && !unknownPattern.test(value!.trim());
}

export function isUnknownDate(value: string | undefined): boolean {
  return unknownPattern.test(value?.trim() ?? '');
}

export function isValidDateText(value: string): boolean {
  return parsePartialDate(value) !== null || unknownPattern.test(value.trim());
}

// Old genealogy records often lack a death date; nobody born this long ago is still alive, so they are not counted as living or given an age of 200.
const MAX_LIFESPAN = 110;

export function isDeceased(person: Person, now: Date = new Date()): boolean {
  if (person.deathDate?.trim()) return true;
  const birth = parseYear(person.birthDate);
  return birth !== undefined && now.getFullYear() - birth > MAX_LIFESPAN;
}

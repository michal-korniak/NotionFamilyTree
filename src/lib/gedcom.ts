import { unionKey, type GraveDetails, type PeopleById, type Person, type UnionDetails } from '../types/person';
import { isDeceased } from './dates';

// GEDCOM 5.5.1 (the version MyHeritage, Ancestry, FamilySearch and Gramps all read). Photos are left out: Notion's file links expire
// after an hour, so they would be dead in the file.

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
// Polish months as they appear in dates: genitive after a day ("12 maja 1950"), nominative before a bare year ("styczeń 2001").
const POLISH_MONTHS: Record<string, number> = {
  stycznia: 1, styczeń: 1, lutego: 2, luty: 2, marca: 3, marzec: 3, kwietnia: 4, kwiecień: 4, maja: 5, maj: 5, czerwca: 6, czerwiec: 6,
  lipca: 7, lipiec: 7, sierpnia: 8, sierpień: 8, września: 9, wrzesień: 9, października: 10, październik: 10, listopada: 11, listopad: 11, grudnia: 12, grudzień: 12,
};

function exactDate(text: string): string | null {
  const iso = /^(\d{3,4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(text);
  if (iso) {
    const [, year, month, day] = iso;
    if (month && (Number(month) < 1 || Number(month) > 12)) return null;
    return [day ? String(Number(day)) : '', month ? MONTHS[Number(month) - 1] : '', year].filter(Boolean).join(' ');
  }
  const written = /^(?:(\d{1,2})\.?\s+)?([a-ząćęłńóśźż]+)\s+(\d{3,4})$/i.exec(text);
  if (written) {
    const month = POLISH_MONTHS[written[2]!.toLowerCase()];
    return month ? [written[1] ? String(Number(written[1])) : '', MONTHS[month - 1], written[3]].filter(Boolean).join(' ') : null;
  }
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{3,4})$/.exec(text);
  if (dotted && Number(dotted[2]) >= 1 && Number(dotted[2]) <= 12) return `${Number(dotted[1])} ${MONTHS[Number(dotted[2]) - 1]} ${dotted[3]}`;
  return null;
}

// Free text from imports ("ok. 20 kwietnia 1875", "przed 1900") becomes a GEDCOM date where it can; anything else is kept word for word
// as a date phrase, so no information is lost.
export function gedcomDate(value: string | undefined): string | undefined {
  const text = value?.trim();
  if (!text || /^(nieznana|nieznany|unknown|\?)$/i.test(text)) return undefined;
  const qualified = /^(ok\.?|około|abt\.?|about|circa|ca\.?|c\.|~|przed|po|bef\.?|aft\.?)\s*(.+)$/i.exec(text);
  if (qualified) {
    const word = qualified[1]!.toLowerCase().replace('.', '');
    const date = exactDate(qualified[2]!.trim());
    const prefix = word === 'przed' || word === 'bef' ? 'BEF' : word === 'po' || word === 'aft' ? 'AFT' : 'ABT';
    if (date) return `${prefix} ${date}`;
  }
  const between = /^(?:między|pomiędzy|bet\.?)\s+(.+?)\s+(?:a|i|and)\s+(.+)$/i.exec(text);
  if (between) {
    const [from, to] = [exactDate(between[1]!.trim()), exactDate(between[2]!.trim())];
    if (from && to) return `BET ${from} AND ${to}`;
  }
  return exactDate(text) ?? `(${text.replace(/[()]/g, '')})`;
}

// A GEDCOM line holds at most 255 characters; longer text continues on CONC lines, and line breaks become CONT lines.
function textLines(level: number, tag: string, value: string): string[] {
  const lines: string[] = [];
  value.replace(/\r\n?/g, '\n').split('\n').forEach((paragraph, index) => {
    const chunks = paragraph.match(/[\s\S]{1,200}/g) ?? [''];
    chunks.forEach((chunk, chunkIndex) => {
      const lineTag = index === 0 && chunkIndex === 0 ? `${level} ${tag}` : `${level + 1} ${chunkIndex === 0 ? 'CONT' : 'CONC'}`;
      lines.push(chunk ? `${lineTag} ${chunk}` : lineTag);
    });
  });
  return lines;
}

function nameLine(given: string, surname: string, type?: string): string[] {
  return [`1 NAME ${given ? `${given} ` : ''}/${surname}/`, ...(given ? [`2 GIVN ${given}`] : []), ...(surname ? [`2 SURN ${surname}`] : []), ...(type ? [`2 TYPE ${type}`] : [])];
}

function personNames(person: Person): string[] {
  const given = (person.givenNames ?? '').trim();
  const birth = (person.birthSurname ?? '').trim();
  const married = (person.marriedSurname ?? '').trim();
  // Records without name parts (added before they existed) only have the full name; the last word is taken as the surname.
  if (person.givenNames === undefined && !birth && !married) {
    const words = person.name.trim().split(/\s+/);
    return nameLine(words.length > 1 ? words.slice(0, -1).join(' ') : words[0] ?? '', words.length > 1 ? words.at(-1)! : '');
  }
  if (married && birth && married !== birth) return [...nameLine(given, married, 'married'), ...nameLine(given, birth, 'birth')];
  return nameLine(given, married || birth);
}

function event(tag: string, date: string | undefined, place: string | undefined, extra: string[] = []): string[] {
  const gedDate = gedcomDate(date);
  const placeText = place?.trim();
  if (!gedDate && !placeText && !extra.length) return [];
  return [`1 ${tag}`, ...(gedDate ? [`2 DATE ${gedDate}`] : []), ...(placeText ? [`2 PLAC ${placeText}`] : []), ...extra];
}

interface Family {
  partners: string[];
  children: string[];
  union?: UnionDetails & { ending?: string };
}

// One family per couple (with the children they both parent) and one per other set of parents, e.g. a single known parent.
function families(people: PeopleById, unions: Record<string, UnionDetails & { ending?: string }>): Family[] {
  const byKey = new Map<string, Family>();
  for (const person of people.values()) {
    for (const spouseId of person.spouses) {
      if (!people.has(spouseId)) continue;
      const key = unionKey(person.id, spouseId);
      if (!byKey.has(key)) byKey.set(key, { partners: key.split('|'), children: [], union: unions[key] });
    }
  }
  for (const child of people.values()) {
    const parents = child.parents.filter((id) => people.has(id)).sort();
    if (!parents.length) continue;
    const key = parents.length === 2 ? unionKey(parents[0]!, parents[1]!) : `${parents[0]}|`;
    const family = byKey.get(key) ?? { partners: parents, children: [] };
    family.children.push(child.id);
    byKey.set(key, family);
  }
  return [...byKey.values()];
}

export function toGedcom(people: PeopleById, unions: Record<string, UnionDetails & { ending?: string }>, graves: Record<string, GraveDetails> = {}, now: Date = new Date()): string {
  const personRef = new Map([...people.keys()].map((id, index) => [id, `@I${index + 1}@`]));
  const familyList = families(people, unions);
  const familyRef = (index: number) => `@F${index + 1}@`;
  const lines = ['0 HEAD', '1 SOUR NotionFamilyTree', '2 NAME NotionFamilyTree', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8', `1 DATE ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`, '1 LANG Polish'];

  for (const person of people.values()) {
    lines.push(`0 ${personRef.get(person.id)} INDI`, ...personNames(person), `1 SEX ${person.gender === 'M' ? 'M' : person.gender === 'F' ? 'F' : 'U'}`);
    lines.push(...event('BIRT', person.birthDate, person.birthPlace));
    const death = event('DEAT', person.deathDate, person.deathPlace);
    // A person known to be dead without a death date or place still gets the event, which GEDCOM marks with "Y".
    lines.push(...(death.length ? death : isDeceased(person, now) ? ['1 DEAT Y'] : []));
    const grave = person.graveId ? graves[person.graveId] : undefined;
    lines.push(...event('BURI', undefined, grave?.cemetery, grave?.info?.trim() ? textLines(2, 'NOTE', grave.info.trim()) : []));
    if (person.biography?.trim()) lines.push(...textLines(1, 'NOTE', person.biography.trim()));
    familyList.forEach((family, index) => {
      if (family.partners.includes(person.id)) lines.push(`1 FAMS ${familyRef(index)}`);
      if (family.children.includes(person.id)) lines.push(`1 FAMC ${familyRef(index)}`);
    });
  }

  familyList.forEach((family, index) => {
    // GEDCOM has a husband and a wife slot; a couple whose genders do not settle it keeps the order it was found in.
    const partners = family.partners.map((id) => people.get(id)!);
    const [husband, wife] = partners.length === 1 ? (partners[0]!.gender === 'F' ? [undefined, partners[0]] : [partners[0], undefined]) : partners[1]!.gender === 'M' || partners[0]!.gender === 'F' ? [partners[1], partners[0]] : [partners[0], partners[1]];
    lines.push(`0 ${familyRef(index)} FAM`, ...(husband ? [`1 HUSB ${personRef.get(husband.id)}`] : []), ...(wife ? [`1 WIFE ${personRef.get(wife.id)}`] : []));
    lines.push(...family.children.map((id) => `1 CHIL ${personRef.get(id)}`));
    const union = family.union;
    if (union) {
      const kind = union.kind?.trim();
      if (kind === 'Narzeczeństwo') lines.push(...event('ENGA', union.date, union.place, ['2 TYPE Narzeczeństwo']));
      else if (kind === 'Nieformalny') lines.push(...textLines(1, 'NOTE', 'Związek nieformalny'), ...event('EVEN', union.date, union.place, ['2 TYPE Związek nieformalny']));
      else { const marriage = event('MARR', union.date, union.place); lines.push(...(marriage.length ? marriage : ['1 MARR Y'])); }
      if (union.ending?.trim()) lines.push(...(/rozw/i.test(union.ending) ? ['1 DIV Y'] : textLines(1, 'NOTE', `Zakończenie: ${union.ending.trim()}`)));
      if (union.notes?.trim()) lines.push(...textLines(1, 'NOTE', union.notes.trim()));
    }
  });

  lines.push('0 TRLR');
  return lines.join('\r\n') + '\r\n';
}

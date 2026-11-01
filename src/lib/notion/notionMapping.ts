import { unionKey, type Gender, type NotionLink, type Person, type UnionDetails } from '../../types/person';
import { NotionClient, NotionError, type NotionPage, type NotionPropertyValue } from './notionClient';

// Property names of the "Drzewo" workspace (a MyHeritage import): an "Osoby" database of people and a "Związki" database of couples.
// Ojciec/Matka are two-way relations mirrored by the two "Dzieci" properties, and Osoby.Związki mirrors Związki.Partnerzy, so only one side of each pair is ever written.
export const PEOPLE = {
  name: 'Imię i nazwisko',
  gender: 'Płeć',
  birthDate: 'Data urodzenia',
  birthPlace: 'Miejsce urodzenia',
  deathDate: 'Data śmierci',
  deathPlace: 'Miejsce śmierci',
  notes: 'Notatki',
  father: 'Ojciec',
  mother: 'Matka',
  childrenA: 'Dzieci (po ojcu)',
  childrenB: 'Dzieci (po matce)',
  unions: 'Związki',
  externalId: 'ID',
  givenNames: 'Imiona',
  birthSurname: 'Nazwisko rodowe',
  marriedSurname: 'Nazwisko po ślubie',
} as const;

export const UNIONS = {
  title: 'Związek',
  partners: 'Partnerzy',
  kind: 'Rodzaj',
  date: 'Data',
  place: 'Miejsce',
  ending: 'Zakończenie',
  notes: 'Notatki',
} as const;

const PEOPLE_DATABASE_NAME = 'Osoby';
const REQUIRED_PEOPLE_PROPS = [PEOPLE.name, PEOPLE.father, PEOPLE.mother, PEOPLE.unions];

const genderFromNotion: Record<string, 'M' | 'F'> = { 'Mężczyzna': 'M', 'Kobieta': 'F' };
const genderToNotion: Record<Gender, string | null> = { M: 'Mężczyzna', F: 'Kobieta', U: null };

export interface FamilyRecord {
  id: string;
  name: string;
  gender?: 'M' | 'F';
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
  parents: string[];
  children: string[];
  spouses: string[];
  biography?: string;
  givenNames: string;
  birthSurname: string;
  marriedSurname: string;
}

export interface NotionImport {
  records: FamilyRecord[];
  warnings: string[];
  link: Omit<NotionLink, 'baseline'>;
}

function text(value: NotionPropertyValue | undefined): string | undefined {
  if (!value) return undefined;
  const parts = value.type === 'title' ? (value as { title: { plain_text: string }[] }).title : value.type === 'rich_text' ? (value as { rich_text: { plain_text: string }[] }).rich_text : null;
  const joined = parts?.map((p) => p.plain_text).join('').trim();
  return joined || undefined;
}

function selectName(value: NotionPropertyValue | undefined): string | undefined {
  return value?.type === 'select' ? (value as { select: { name: string } | null }).select?.name : undefined;
}

async function relationIds(client: NotionClient, page: NotionPage, property: string): Promise<string[]> {
  const value = page.properties[property];
  if (value?.type !== 'relation') return [];
  if ((value as { has_more?: boolean }).has_more) return client.retrieveRelation(page.id, value.id);
  return (value as { relation: { id: string }[] }).relation.map((r) => r.id);
}

interface Databases {
  databaseId: string;
  dataSourceId: string;
  unionsDataSourceId: string;
  title: string;
}

// The link may point at the "Drzewo" page or straight at the "Osoby" database; the unions database is then found through the Osoby.Związki relation, so its link is never needed.
async function locateDatabases(client: NotionClient, id: string): Promise<Databases> {
  let databaseId = id;
  let database: { title: string; dataSourceId: string };
  try {
    database = await client.retrieveDatabase(id);
  } catch (error) {
    if (!(error instanceof NotionError) || (error.status !== 400 && error.status !== 404)) throw error;
    const children = await client.listChildDatabases(id).catch(() => { throw error; });
    const people = children.find((c) => c.title.trim() === PEOPLE_DATABASE_NAME);
    if (!people) throw new Error(`Na tej stronie nie ma bazy „${PEOPLE_DATABASE_NAME}”. Wklej link do strony Drzewo albo do bazy Osoby.`);
    databaseId = people.id;
    database = await client.retrieveDatabase(people.id);
  }
  const schema = await client.retrieveDataSourceSchema(database.dataSourceId);
  const missing = REQUIRED_PEOPLE_PROPS.filter((name) => !schema[name]);
  if (missing.length) throw new Error(`To nie wygląda na bazę Osoby: brakuje ${missing.map((m) => `„${m}”`).join(', ')}.`);
  const unionsDataSourceId = schema[PEOPLE.unions]?.relation?.data_source_id;
  if (!unionsDataSourceId) throw new Error(`„${PEOPLE.unions}” w bazie Osoby musi być relacją do bazy Związki.`);
  return { databaseId, dataSourceId: database.dataSourceId, unionsDataSourceId, title: database.title };
}

// The ID property (e.g. "K-I500099") becomes the person id when present and unique, so the stored JSON stays readable and matches MyHeritage; otherwise the Notion page id is used.
function personIds(pages: NotionPage[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const page of pages) { const id = text(page.properties[PEOPLE.externalId]); if (id) counts.set(id, (counts.get(id) ?? 0) + 1); }
  return new Map(pages.map((page) => { const id = text(page.properties[PEOPLE.externalId]); return [page.id, id && counts.get(id) === 1 ? id : page.id]; }));
}

export async function importNotionDatabase(token: string, inputId: string, onProgress?: (message: string) => void): Promise<NotionImport> {
  const client = new NotionClient(token);
  onProgress?.('Szukanie baz danych…');
  const databases = await locateDatabases(client, inputId);
  onProgress?.('Wczytywanie osób…');
  const peoplePages = await client.queryAllPages(databases.dataSourceId, (loaded) => onProgress?.(`Wczytano osób: ${loaded}…`));
  onProgress?.('Wczytywanie związków…');
  const unionPages = await client.queryAllPages(databases.unionsDataSourceId, (loaded) => onProgress?.(`Wczytano związków: ${loaded}…`));

  const idByPage = personIds(peoplePages);
  const toIds = (pageIds: string[]) => [...new Set(pageIds.map((id) => idByPage.get(id)).filter((id): id is string => Boolean(id)))];
  const link: Omit<NotionLink, 'baseline'> = { ...databases, pageIds: {}, externalIds: {}, unions: {}, syncedAt: new Date().toISOString() };
  for (const page of peoplePages) {
    const personId = idByPage.get(page.id)!;
    link.pageIds[personId] = page.id;
    const externalId = text(page.properties[PEOPLE.externalId]);
    if (externalId) link.externalIds[personId] = externalId;
  }

  const spouses = new Map<string, Set<string>>();
  let skippedUnions = 0;
  let duplicateUnions = 0;
  for (const page of unionPages) {
    const partners = toIds(await relationIds(client, page, UNIONS.partners));
    if (partners.length !== 2) { skippedUnions++; continue; }
    const [a, b] = partners as [string, string];
    const key = unionKey(a, b);
    if (link.unions[key]) { duplicateUnions++; continue; }
    const p = page.properties;
    link.unions[key] = { pageId: page.id, kind: selectName(p[UNIONS.kind]), date: text(p[UNIONS.date]), place: text(p[UNIONS.place]), notes: text(p[UNIONS.notes]), ending: selectName(p[UNIONS.ending]) };
    spouses.set(a, (spouses.get(a) ?? new Set()).add(b));
    spouses.set(b, (spouses.get(b) ?? new Set()).add(a));
  }

  const records: FamilyRecord[] = [];
  for (const page of peoplePages) {
    const p = page.properties;
    const personId = idByPage.get(page.id)!;
    records.push({
      id: personId,
      name: text(p[PEOPLE.name]) ?? 'Bez imienia',
      gender: genderFromNotion[selectName(p[PEOPLE.gender]) ?? ''],
      birthDate: text(p[PEOPLE.birthDate]),
      birthPlace: text(p[PEOPLE.birthPlace]),
      deathDate: text(p[PEOPLE.deathDate]),
      deathPlace: text(p[PEOPLE.deathPlace]),
      parents: toIds([...await relationIds(client, page, PEOPLE.father), ...await relationIds(client, page, PEOPLE.mother)]),
      children: toIds([...await relationIds(client, page, PEOPLE.childrenA), ...await relationIds(client, page, PEOPLE.childrenB)]),
      spouses: [...(spouses.get(personId) ?? [])],
      biography: text(p[PEOPLE.notes]),
      givenNames: text(p[PEOPLE.givenNames]) ?? '',
      birthSurname: text(p[PEOPLE.birthSurname]) ?? '',
      marriedSurname: text(p[PEOPLE.marriedSurname]) ?? '',
    });
  }

  const warnings: string[] = [];
  if (skippedUnions) warnings.push(`Pominięto związki, które nie łączą dokładnie dwóch osób z bazy Osoby: ${skippedUnions} (bez zmian w Notion).`);
  if (duplicateUnions) warnings.push(`Zignorowano powtórzone związki tej samej pary: ${duplicateUnions} (bez zmian w Notion).`);
  return { records, warnings, link };
}

const RICH_TEXT_CHUNK = 2000;

function richText(value: string | undefined) {
  if (!value) return [];
  const chunks: { type: 'text'; text: { content: string } }[] = [];
  for (let i = 0; i < value.length; i += RICH_TEXT_CHUNK) chunks.push({ type: 'text', text: { content: value.slice(i, i + RICH_TEXT_CHUNK) } });
  return chunks;
}

export const DETAIL_FIELDS = ['name', 'givenNames', 'birthSurname', 'marriedSurname', 'gender', 'birthDate', 'deathDate', 'birthPlace', 'deathPlace', 'biography'] as const;

export type DetailField = (typeof DETAIL_FIELDS)[number];

// Only the given fields are sent: rewriting an unchanged rich-text property would flatten any formatting, links or mentions it has in Notion.
export function detailProperties(person: Person, fields: readonly DetailField[] = DETAIL_FIELDS): Record<string, unknown> {
  const gender = genderToNotion[person.gender];
  const all: Record<DetailField, [string, unknown]> = {
    name: [PEOPLE.name, { title: richText(person.name) }],
    gender: [PEOPLE.gender, { select: gender ? { name: gender } : null }],
    birthDate: [PEOPLE.birthDate, { rich_text: richText(person.birthDate) }],
    birthPlace: [PEOPLE.birthPlace, { rich_text: richText(person.birthPlace) }],
    deathDate: [PEOPLE.deathDate, { rich_text: richText(person.deathDate) }],
    deathPlace: [PEOPLE.deathPlace, { rich_text: richText(person.deathPlace) }],
    biography: [PEOPLE.notes, { rich_text: richText(person.biography) }],
    givenNames: [PEOPLE.givenNames, { rich_text: richText(person.givenNames) }],
    birthSurname: [PEOPLE.birthSurname, { rich_text: richText(person.birthSurname) }],
    marriedSurname: [PEOPLE.marriedSurname, { rich_text: richText(person.marriedSurname) }],
  };
  return Object.fromEntries(fields.map((field) => all[field]));
}

// Ojciec and Matka hold one parent each: men go to Ojciec, women to Matka, and a parent of unknown gender takes whichever slot is still free.
export function parentProperties(parents: { pageId: string; gender: Gender }[]): Record<string, unknown> {
  const father: string[] = [];
  const mother: string[] = [];
  const unknown: string[] = [];
  for (const { pageId, gender } of parents) {
    if (gender === 'M' && !father.length) father.push(pageId);
    else if (gender === 'F' && !mother.length) mother.push(pageId);
    else unknown.push(pageId);
  }
  for (const id of unknown) (father.length ? mother : father).push(id);
  return { [PEOPLE.father]: { relation: father.map((id) => ({ id })) }, [PEOPLE.mother]: { relation: mother.map((id) => ({ id })) } };
}

export function externalIdProperty(externalId: string): Record<string, unknown> {
  return { [PEOPLE.externalId]: { rich_text: richText(externalId) } };
}

// Matches the import's "Husband & Wife" titles.
export function unionTitle(a: Person, b: Person): string {
  const [first, second] = a.gender === 'F' && b.gender !== 'F' ? [b, a] : [a, b];
  return `${first.name} & ${second.name}`;
}

export function unionDetailProperties(details: UnionDetails): Record<string, unknown> {
  return {
    [UNIONS.kind]: { select: details.kind ? { name: details.kind } : null },
    [UNIONS.date]: { rich_text: richText(details.date) },
    [UNIONS.place]: { rich_text: richText(details.place) },
    [UNIONS.notes]: { rich_text: richText(details.notes) },
  };
}

export function unionProperties(a: Person, b: Person, pageIdA: string, pageIdB: string, details?: UnionDetails): Record<string, unknown> {
  return { [UNIONS.title]: { title: richText(unionTitle(a, b)) }, [UNIONS.partners]: { relation: [{ id: pageIdA }, { id: pageIdB }] }, ...(details ? unionDetailProperties(details) : {}) };
}

export function unionTitleProperty(a: Person, b: Person): Record<string, unknown> {
  return { [UNIONS.title]: { title: richText(unionTitle(a, b)) } };
}

export function describeUnion(union: (UnionDetails & { ending?: string }) | undefined): string | undefined {
  if (!union) return undefined;
  const parts = [union.kind && union.kind !== 'Nieznany' ? union.kind : undefined, union.date, union.place, union.ending ? `zakończone: ${union.ending}` : undefined].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

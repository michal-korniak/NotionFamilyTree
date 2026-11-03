import { unionKey, type DateColumns, type Gender, type GraveDetails, type GraveRecord, type NotionLink, type Person, type StoredPhoto, type UnionDetails, type UnionRecord } from '../../types/person';
import { NotionClient, NotionError, type NotionPage, type NotionPropertyValue } from './notionClient';
import { readPhotoColumns } from './notionPhotos';
import { formatPartialDate, isUnknownDate, parsePartialDate, type DateQualifier } from '../dates';

// Property names of the "Drzewo" workspace (a MyHeritage import): an "Osoby" database of people, a "Związki" database of couples and a "Groby" database of graves.
// Ojciec/Matka are two-way relations mirrored by the two "Dzieci" properties, Osoby.Związki mirrors Związki.Partnerzy and Osoby.Grób mirrors
// Groby.Pochowani, so only one side of each pair is ever written.
export const PEOPLE = {
  name: 'Imię i nazwisko',
  gender: 'Płeć',
  birthDate: 'Data urodzenia',
  birthPrecision: 'Data urodzenia – dokładność',
  birthPlace: 'Miejsce urodzenia',
  deathDate: 'Data śmierci',
  deathPrecision: 'Data śmierci – dokładność',
  deathPlace: 'Miejsce śmierci',
  grave: 'Grób',
  photos: 'Zdjęcie',
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
  datePrecision: 'Data – dokładność',
  place: 'Miejsce',
  ending: 'Zakończenie',
  notes: 'Notatki',
} as const;

export const GRAVES = {
  title: 'Nazwa',
  cemetery: 'Cmentarz',
  info: 'Informacje',
  photos: 'Zdjęcie nagrobka',
  buried: 'Pochowani',
} as const;

// Bump when the import starts reading another column, so the next refresh reads every page again instead of only the edited ones.
export const NOTION_FIELDS_VERSION = 7;

export const PHOTO_PROPERTIES = [PEOPLE.photos] as const;
export const GRAVE_PHOTO_PROPERTIES = [GRAVES.photos] as const;

// The page and photo columns behind a photo owner: a person, or a grave (whose ids never clash with person ids).
export function photoOwnerPage(link: NotionLink, ownerId: string): { pageId: string; properties: readonly string[] } | undefined {
  const personPage = link.pageIds[ownerId];
  if (personPage) return { pageId: personPage, properties: PHOTO_PROPERTIES };
  const gravePage = link.graves?.[ownerId]?.pageId;
  return gravePage ? { pageId: gravePage, properties: GRAVE_PHOTO_PROPERTIES } : undefined;
}

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
  graveId?: string;
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
  gravesDataSourceId?: string;
  title: string;
  dateColumns: DateColumns;
}

const dateColumnsOf = (schema: Record<string, { type: string }>): DateColumns => (schema[PEOPLE.birthDate]?.type === 'date' ? 'date' : 'text');

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
  const gravesDataSourceId = schema[PEOPLE.grave]?.relation?.data_source_id;
  return { databaseId, dataSourceId: database.dataSourceId, unionsDataSourceId, ...(gravesDataSourceId ? { gravesDataSourceId } : {}), title: database.title, dateColumns: dateColumnsOf(schema) };
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
  const gravePages = databases.gravesDataSourceId ? await client.queryAllPages(databases.gravesDataSourceId, (loaded) => onProgress?.(`Wczytano grobów: ${loaded}…`)) : [];

  const idByPage = personIds(peoplePages);
  const toIds = (pageIds: string[]) => [...new Set(pageIds.map((id) => idByPage.get(id)).filter((id): id is string => Boolean(id)))];
  const link: Omit<NotionLink, 'baseline'> = { ...databases, pageIds: {}, externalIds: {}, unions: {}, graves: {}, syncedAt: new Date().toISOString(), fieldsVersion: NOTION_FIELDS_VERSION, photos: {} };
  for (const page of gravePages) {
    link.graves![page.id] = graveRecord(page);
    const photos = readPhotoColumns(page, GRAVE_PHOTO_PROPERTIES);
    if (Object.keys(photos).length) link.photos![page.id] = photos;
  }
  const toGraveId: ToGraveId = (pageId) => (pageId && link.graves![pageId] ? pageId : undefined);
  for (const page of peoplePages) {
    const personId = idByPage.get(page.id)!;
    link.pageIds[personId] = page.id;
    const externalId = text(page.properties[PEOPLE.externalId]);
    if (externalId) link.externalIds[personId] = externalId;
    const photos = readPhotoColumns(page, PHOTO_PROPERTIES);
    if (Object.keys(photos).length) link.photos![personId] = photos;
  }

  const unionCounts = await addUnions(client, unionPages, toIds, link.unions);
  const spouses = spousesOf(link.unions);
  const records: FamilyRecord[] = [];
  for (const page of peoplePages) {
    const personId = idByPage.get(page.id)!;
    records.push({ ...await personRecord(client, page, personId, toIds, toGraveId), spouses: [...(spouses.get(personId) ?? [])] });
  }
  return { records, warnings: unionWarnings(unionCounts), link };
}

type ToPersonIds = (pageIds: string[]) => string[];
type ToGraveId = (pageId: string | undefined) => string | undefined;

function graveRecord(page: NotionPage): GraveRecord {
  const p = page.properties;
  return { pageId: page.id, name: text(p[GRAVES.title]), cemetery: text(p[GRAVES.cemetery]), info: text(p[GRAVES.info]) };
}

async function personRecord(client: NotionClient, page: NotionPage, personId: string, toIds: ToPersonIds, toGraveId: ToGraveId): Promise<FamilyRecord> {
  const p = page.properties;
  return {
    id: personId,
    name: text(p[PEOPLE.name]) ?? 'Bez imienia',
    gender: genderFromNotion[selectName(p[PEOPLE.gender]) ?? ''],
    birthDate: readDate(p, PEOPLE.birthDate, PEOPLE.birthPrecision),
    birthPlace: text(p[PEOPLE.birthPlace]),
    deathDate: readDate(p, PEOPLE.deathDate, PEOPLE.deathPrecision),
    deathPlace: text(p[PEOPLE.deathPlace]),
    graveId: toGraveId((await relationIds(client, page, PEOPLE.grave))[0]),
    parents: toIds([...await relationIds(client, page, PEOPLE.father), ...await relationIds(client, page, PEOPLE.mother)]),
    children: toIds([...await relationIds(client, page, PEOPLE.childrenA), ...await relationIds(client, page, PEOPLE.childrenB)]),
    spouses: [],
    biography: text(p[PEOPLE.notes]),
    givenNames: text(p[PEOPLE.givenNames]) ?? '',
    birthSurname: text(p[PEOPLE.birthSurname]) ?? '',
    marriedSurname: text(p[PEOPLE.marriedSurname]) ?? '',
  };
}

async function addUnions(client: NotionClient, pages: NotionPage[], toIds: ToPersonIds, unions: Record<string, UnionRecord>): Promise<{ skipped: number; duplicates: number }> {
  let skipped = 0;
  let duplicates = 0;
  for (const page of pages) {
    const partners = toIds(await relationIds(client, page, UNIONS.partners));
    if (partners.length !== 2) { skipped++; continue; }
    const key = unionKey(partners[0]!, partners[1]!);
    if (unions[key]) { duplicates++; continue; }
    const p = page.properties;
    unions[key] = { pageId: page.id, kind: selectName(p[UNIONS.kind]), date: readDate(p, UNIONS.date, UNIONS.datePrecision), place: text(p[UNIONS.place]), notes: text(p[UNIONS.notes]), ending: selectName(p[UNIONS.ending]) };
  }
  return { skipped, duplicates };
}

function spousesOf(unions: Record<string, UnionRecord>): Map<string, Set<string>> {
  const spouses = new Map<string, Set<string>>();
  for (const key of Object.keys(unions)) {
    const [a, b] = key.split('|') as [string, string];
    spouses.set(a, (spouses.get(a) ?? new Set()).add(b));
    spouses.set(b, (spouses.get(b) ?? new Set()).add(a));
  }
  return spouses;
}

function unionWarnings({ skipped, duplicates }: { skipped: number; duplicates: number }): string[] {
  const warnings: string[] = [];
  if (skipped) warnings.push(`Pominięto związki, które nie łączą dokładnie dwóch osób z bazy Osoby: ${skipped} (bez zmian w Notion).`);
  if (duplicates) warnings.push(`Zignorowano powtórzone związki tej samej pary: ${duplicates} (bez zmian w Notion).`);
  return warnings;
}

// Notion rounds last_edited_time down to the minute, so the window reaches back a little before the last sync; re-reading a page that did not change is harmless.
const EDIT_TIME_MARGIN_MS = 2 * 60_000;

export interface NotionRefresh extends NotionImport {
  // What differs from the last sync: people, couples (by union key) and graves edited, added or removed in Notion, and photo columns that changed.
  changedPersonIds: string[];
  removedPersonIds: string[];
  changedUnionKeys: string[];
  removedUnionKeys: string[];
  changedGraveIds: string[];
  removedGraveIds: string[];
  changedPhotos: number;
}

// Starts from what Notion had at the last sync (link.baseline and link.unions) and reads only the pages edited since then, plus a title-only
// listing of each database to notice deleted pages. A changed page is authoritative for every parent/child link it takes part in, because
// Notion keeps the two sides of Ojciec/Matka and Dzieci in sync even when only one of the two pages gets a new last_edited_time.
export async function refreshNotionDatabase(token: string, link: NotionLink, onProgress?: (message: string) => void): Promise<NotionRefresh> {
  const client = new NotionClient(token);
  // Groby can be added, or shared with the integration, after the tree was imported; it then needs the full read that finds it.
  const schema = await client.retrieveDataSourceSchema(link.dataSourceId);
  const gravesAppeared = !link.gravesDataSourceId && Boolean(schema[PEOPLE.grave]?.relation?.data_source_id);
  // Dates moved from text to date columns (or back) since the last sync: every page reads differently now.
  const datesMoved = dateColumnsOf(schema) !== (link.dateColumns ?? 'text');
  if (link.fieldsVersion !== NOTION_FIELDS_VERSION || gravesAppeared || datesMoved) {
    const full = await importNotionDatabase(token, link.databaseId, onProgress);
    return { ...full, changedPersonIds: full.records.map((record) => record.id), removedPersonIds: [], changedUnionKeys: Object.keys(full.link.unions), removedUnionKeys: [], changedGraveIds: Object.keys(full.link.graves ?? {}), removedGraveIds: [], changedPhotos: 0 };
  }
  const startedAt = new Date().toISOString();
  const editedSince = { timestamp: 'last_edited_time', last_edited_time: { on_or_after: new Date(Date.parse(link.syncedAt) - EDIT_TIME_MARGIN_MS).toISOString() } };
  onProgress?.('Sprawdzanie zmian w Notion…');
  const changedPeoplePages = await client.queryAllPages(link.dataSourceId, undefined, { filter: editedSince });
  const changedUnionPages = await client.queryAllPages(link.unionsDataSourceId, undefined, { filter: editedSince });
  const livePeoplePages = new Set([...(await client.queryAllPages(link.dataSourceId, undefined, { onlyProperties: ['title'] })).map((p) => p.id), ...changedPeoplePages.map((p) => p.id)]);
  const liveUnionPages = new Set([...(await client.queryAllPages(link.unionsDataSourceId, undefined, { onlyProperties: ['title'] })).map((p) => p.id), ...changedUnionPages.map((p) => p.id)]);
  const changedGravePages = link.gravesDataSourceId ? await client.queryAllPages(link.gravesDataSourceId, undefined, { filter: editedSince }) : [];
  const liveGravePages = new Set(link.gravesDataSourceId ? [...(await client.queryAllPages(link.gravesDataSourceId, undefined, { onlyProperties: ['title'] })).map((p) => p.id), ...changedGravePages.map((p) => p.id)] : []);

  // Graves made in the app keep the id they were given; graves new to this device take their page id, as in a full import.
  const graves: Record<string, GraveRecord> = {};
  const removedGraveIds: string[] = [];
  const graveIdByPage = new Map<string, string>();
  for (const [graveId, grave] of Object.entries(link.graves ?? {})) {
    if (!liveGravePages.has(grave.pageId)) { removedGraveIds.push(graveId); continue; }
    graves[graveId] = grave;
    graveIdByPage.set(grave.pageId, graveId);
  }
  const changedGraveIds: string[] = [];
  for (const page of changedGravePages) {
    const graveId = graveIdByPage.get(page.id) ?? page.id;
    graveIdByPage.set(page.id, graveId);
    const record = graveRecord(page);
    if (!sameGrave(record, graves[graveId])) changedGraveIds.push(graveId);
    graves[graveId] = record;
  }
  const toGraveId: ToGraveId = (pageId) => (pageId ? graveIdByPage.get(pageId) : undefined);

  const pageIds: Record<string, string> = {};
  const externalIds: Record<string, string> = {};
  const removedIds = new Set<string>();
  for (const [personId, pageId] of Object.entries(link.pageIds)) {
    if (!livePeoplePages.has(pageId)) { removedIds.add(personId); continue; }
    pageIds[personId] = pageId;
    if (link.externalIds[personId]) externalIds[personId] = link.externalIds[personId];
  }
  const idByPage = new Map(Object.entries(pageIds).map(([personId, pageId]) => [pageId, personId]));

  // New pages get the same kind of id a full import would give them: their ID property when it is not already taken, otherwise the page id.
  const newPages = changedPeoplePages.filter((page) => !idByPage.has(page.id));
  const takenIds = new Set([...idByPage.values(), ...newPages.map((page) => page.id)]);
  const newExternalCounts = new Map<string, number>();
  for (const page of newPages) { const id = text(page.properties[PEOPLE.externalId]); if (id) newExternalCounts.set(id, (newExternalCounts.get(id) ?? 0) + 1); }
  for (const page of newPages) {
    const externalId = text(page.properties[PEOPLE.externalId]);
    const personId = externalId && newExternalCounts.get(externalId) === 1 && !takenIds.has(externalId) ? externalId : page.id;
    idByPage.set(page.id, personId);
    pageIds[personId] = page.id;
  }
  const toIds: ToPersonIds = (ids) => [...new Set(ids.map((id) => idByPage.get(id)).filter((id): id is string => Boolean(id)))];

  const photos: Record<string, Record<string, StoredPhoto[]>> = Object.fromEntries(Object.entries(link.photos ?? {}).filter(([ownerId]) => !removedIds.has(ownerId) && !removedGraveIds.includes(ownerId)));
  let changedPhotos = 0;
  const notePhotos = (ownerId: string, pagePhotos: Record<string, StoredPhoto[]>) => {
    if (JSON.stringify(pagePhotos) !== JSON.stringify(photos[ownerId] ?? {})) changedPhotos++;
    if (Object.keys(pagePhotos).length) photos[ownerId] = pagePhotos; else delete photos[ownerId];
  };
  for (const page of changedGravePages) notePhotos(graveIdByPage.get(page.id)!, readPhotoColumns(page, GRAVE_PHOTO_PROPERTIES));
  const changedRecords = new Map<string, FamilyRecord>();
  for (const page of changedPeoplePages) {
    const personId = idByPage.get(page.id)!;
    changedRecords.set(personId, await personRecord(client, page, personId, toIds, toGraveId));
    const externalId = text(page.properties[PEOPLE.externalId]);
    if (externalId) externalIds[personId] = externalId; else delete externalIds[personId];
    notePhotos(personId, readPhotoColumns(page, PHOTO_PROPERTIES));
  }

  const changedUnionPageIds = new Set(changedUnionPages.map((page) => page.id));
  const unions: Record<string, UnionRecord> = {};
  const removedUnionKeys: string[] = [];
  for (const [key, union] of Object.entries(link.unions)) {
    const [a, b] = key.split('|') as [string, string];
    if (!liveUnionPages.has(union.pageId) || removedIds.has(a) || removedIds.has(b)) { removedUnionKeys.push(key); continue; }
    if (!changedUnionPageIds.has(union.pageId)) unions[key] = union;
  }
  const unionCounts = await addUnions(client, changedUnionPages, toIds, unions);
  const spouses = spousesOf(unions);

  const unlinkChanged = (ids: string[]) => ids.filter((id) => !changedRecords.has(id) && !removedIds.has(id));
  const records: FamilyRecord[] = [];
  for (const base of link.baseline) {
    if (removedIds.has(base.id) || changedRecords.has(base.id) || !pageIds[base.id]) continue;
    records.push({ ...base, graveId: base.graveId && graves[base.graveId] ? base.graveId : undefined, gender: base.gender === 'U' ? undefined : base.gender, givenNames: base.givenNames ?? '', birthSurname: base.birthSurname ?? '', marriedSurname: base.marriedSurname ?? '', parents: unlinkChanged(base.parents), children: unlinkChanged(base.children), spouses: [...(spouses.get(base.id) ?? [])] });
  }
  for (const record of changedRecords.values()) records.push({ ...record, spouses: [...(spouses.get(record.id) ?? [])] });

  const baseline = new Map(link.baseline.map((person) => [person.id, person]));
  const changedPersonIds = [...changedRecords.values()].filter((record) => { const base = baseline.get(record.id); return !base || !sameRecord(record, base); }).map((record) => record.id);
  const changedUnionKeys = Object.keys(unions).filter((key) => !sameUnion(unions[key]!, link.unions[key]));
  return {
    records,
    warnings: unionWarnings(unionCounts),
    link: { databaseId: link.databaseId, dataSourceId: link.dataSourceId, unionsDataSourceId: link.unionsDataSourceId, ...(link.gravesDataSourceId ? { gravesDataSourceId: link.gravesDataSourceId } : {}), title: link.title, pageIds, externalIds, unions, graves, syncedAt: startedAt, fieldsVersion: NOTION_FIELDS_VERSION, photos, dateColumns: link.dateColumns },
    changedPersonIds,
    changedUnionKeys,
    changedGraveIds,
    removedGraveIds,
    changedPhotos,
    removedPersonIds: [...removedIds],
    removedUnionKeys,
  };
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

function sameRecord(record: FamilyRecord, base: Person): boolean {
  const sameDetails = DETAIL_FIELDS.every((field) => (field === 'gender' ? (record.gender ?? 'U') === base.gender : (record[field] ?? '') === (base[field] ?? '')));
  return sameDetails && (record.graveId ?? '') === (base.graveId ?? '') && sameSet(record.parents, base.parents) && sameSet(record.children, base.children);
}

function sameGrave(a: GraveRecord, b: GraveRecord | undefined): boolean {
  return Boolean(b) && a.pageId === b!.pageId && a.name === b!.name && a.cemetery === b!.cemetery && a.info === b!.info;
}

function sameUnion(a: UnionRecord, b: UnionRecord | undefined): boolean {
  return Boolean(b) && a.pageId === b!.pageId && a.kind === b!.kind && a.date === b!.date && a.place === b!.place && a.notes === b!.notes && a.ending === b!.ending;
}

const RICH_TEXT_CHUNK = 2000;

function richText(value: string | undefined) {
  if (!value) return [];
  const chunks: { type: 'text'; text: { content: string } }[] = [];
  for (let i = 0; i < value.length; i += RICH_TEXT_CHUNK) chunks.push({ type: 'text', text: { content: value.slice(i, i + RICH_TEXT_CHUNK) } });
  return chunks;
}

// A date column holds a whole day, so the "– dokładność" select beside it says which parts are real (YearOnly keeps 1 January) and how
// sure the date is; Unknown, with no date, marks a death whose date nobody knows.
const PRECISIONS = ['YearOnly', 'Month+Year', 'Day+Month+Year'] as const;
const QUALIFIER_WORDS: Record<DateQualifier, string> = { exact: '', about: 'About ', before: 'Before ', after: 'After ' };
export const UNKNOWN_DATE = 'Unknown';
export const DATE_PRECISION_OPTIONS = [...Object.values(QUALIFIER_WORDS).flatMap((word) => PRECISIONS.map((precision) => `${word}${precision}`)), UNKNOWN_DATE];

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

export function toNotionDate(value: string | undefined): { start: string | null; precision: string | null } {
  if (!value?.trim()) return { start: null, precision: null };
  if (isUnknownDate(value)) return { start: null, precision: UNKNOWN_DATE };
  const date = parsePartialDate(value);
  if (!date) return { start: null, precision: null };
  const precision = date.day ? 'Day+Month+Year' : date.month ? 'Month+Year' : 'YearOnly';
  return { start: `${pad(date.year, 4)}-${pad(date.month ?? 1)}-${pad(date.day ?? 1)}`, precision: `${QUALIFIER_WORDS[date.qualifier]}${precision}` };
}

// A date typed straight into Notion without a precision is taken as the whole day it shows.
export function fromNotionDate(start: string | undefined, precision: string | undefined): string | undefined {
  if (precision === UNKNOWN_DATE) return 'nieznana';
  const [year, month, day] = (start ?? '').slice(0, 10).split('-').map(Number);
  if (!year) return undefined;
  const parsed = /^(?:(About|Before|After) )?(YearOnly|Month\+Year|Day\+Month\+Year)$/.exec(precision ?? '');
  const qualifier = (Object.keys(QUALIFIER_WORDS) as DateQualifier[]).find((key) => QUALIFIER_WORDS[key].trim() === (parsed?.[1] ?? '')) ?? 'exact';
  const parts = parsed?.[2] ?? 'Day+Month+Year';
  return formatPartialDate({ qualifier, year, month: parts === 'YearOnly' ? undefined : month, day: parts === 'Day+Month+Year' ? day : undefined });
}

function readDate(properties: Record<string, NotionPropertyValue>, column: string, precisionColumn: string): string | undefined {
  const value = properties[column];
  if (value?.type !== 'date') return text(value);
  return fromNotionDate((value as { date: { start: string } | null }).date?.start, selectName(properties[precisionColumn]));
}

function dateProperties(column: string, precisionColumn: string, value: string | undefined, columns: DateColumns = 'text'): Record<string, unknown> {
  if (columns === 'text') return { [column]: { rich_text: richText(value) } };
  const { start, precision } = toNotionDate(value);
  return { [column]: { date: start ? { start } : null }, [precisionColumn]: { select: precision ? { name: precision } : null } };
}

export const DETAIL_FIELDS = ['name', 'givenNames', 'birthSurname', 'marriedSurname', 'gender', 'birthDate', 'deathDate', 'birthPlace', 'deathPlace', 'biography'] as const;

export type DetailField = (typeof DETAIL_FIELDS)[number];

// Only the given fields are sent: rewriting an unchanged rich-text property would flatten any formatting, links or mentions it has in Notion.
export function detailProperties(person: Person, fields: readonly DetailField[] = DETAIL_FIELDS, dateColumns?: DateColumns): Record<string, unknown> {
  const gender = genderToNotion[person.gender];
  const all: Record<DetailField, Record<string, unknown>> = {
    name: { [PEOPLE.name]: { title: richText(person.name) } },
    gender: { [PEOPLE.gender]: { select: gender ? { name: gender } : null } },
    birthDate: dateProperties(PEOPLE.birthDate, PEOPLE.birthPrecision, person.birthDate, dateColumns),
    birthPlace: { [PEOPLE.birthPlace]: { rich_text: richText(person.birthPlace) } },
    deathDate: dateProperties(PEOPLE.deathDate, PEOPLE.deathPrecision, person.deathDate, dateColumns),
    deathPlace: { [PEOPLE.deathPlace]: { rich_text: richText(person.deathPlace) } },
    biography: { [PEOPLE.notes]: { rich_text: richText(person.biography) } },
    givenNames: { [PEOPLE.givenNames]: { rich_text: richText(person.givenNames) } },
    birthSurname: { [PEOPLE.birthSurname]: { rich_text: richText(person.birthSurname) } },
    marriedSurname: { [PEOPLE.marriedSurname]: { rich_text: richText(person.marriedSurname) } },
  };
  return Object.assign({}, ...fields.map((field) => all[field]));
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

export function graveProperty(gravePageId: string | undefined): Record<string, unknown> {
  return { [PEOPLE.grave]: { relation: gravePageId ? [{ id: gravePageId }] : [] } };
}

export function graveProperties(details: GraveDetails, title: string): Record<string, unknown> {
  return {
    [GRAVES.title]: { title: richText(title) },
    [GRAVES.cemetery]: { rich_text: richText(details.cemetery) },
    [GRAVES.info]: { rich_text: richText(details.info) },
  };
}

export function graveTitleProperty(title: string): Record<string, unknown> {
  return { [GRAVES.title]: { title: richText(title) } };
}

export function externalIdProperty(externalId: string): Record<string, unknown> {
  return { [PEOPLE.externalId]: { rich_text: richText(externalId) } };
}

// Matches the import's "Husband & Wife" titles.
export function unionTitle(a: Person, b: Person): string {
  const [first, second] = a.gender === 'F' && b.gender !== 'F' ? [b, a] : [a, b];
  return `${first.name} & ${second.name}`;
}

export function unionDetailProperties(details: UnionDetails, dateColumns?: DateColumns): Record<string, unknown> {
  return {
    [UNIONS.kind]: { select: details.kind ? { name: details.kind } : null },
    ...dateProperties(UNIONS.date, UNIONS.datePrecision, details.date, dateColumns),
    [UNIONS.place]: { rich_text: richText(details.place) },
    [UNIONS.notes]: { rich_text: richText(details.notes) },
  };
}

export function unionProperties(a: Person, b: Person, pageIdA: string, pageIdB: string, details?: UnionDetails, dateColumns?: DateColumns): Record<string, unknown> {
  return { [UNIONS.title]: { title: richText(unionTitle(a, b)) }, [UNIONS.partners]: { relation: [{ id: pageIdA }, { id: pageIdB }] }, ...(details ? unionDetailProperties(details, dateColumns) : {}) };
}

export function unionTitleProperty(a: Person, b: Person): Record<string, unknown> {
  return { [UNIONS.title]: { title: richText(unionTitle(a, b)) } };
}

export function describeUnion(union: (UnionDetails & { ending?: string }) | undefined): string | undefined {
  if (!union) return undefined;
  const parts = [union.kind && union.kind !== 'Nieznany' ? union.kind : undefined, union.date, union.place, union.ending ? `zakończone: ${union.ending}` : undefined].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

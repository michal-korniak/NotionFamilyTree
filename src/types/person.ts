export type Gender = 'M' | 'F' | 'U';

export interface Person {
  id: string;
  name: string;
  birthDate?: string;
  deathDate?: string;
  birthPlace?: string;
  deathPlace?: string;
  cemetery?: string;
  burialInfo?: string;
  gender: Gender;
  parents: string[];
  children: string[];
  spouses: string[];
  biography?: string;
  // '' means the source says there is no first name; undefined means unknown (e.g. a person added in the app).
  givenNames?: string;
  birthSurname?: string;
  marriedSurname?: string;
}

export type PeopleById = ReadonlyMap<string, Person>;

// What the app lets you edit about a couple; mirrors the Związki columns Rodzaj, Data, Miejsce and Notatki.
export interface UnionDetails {
  kind?: string;
  date?: string;
  place?: string;
  notes?: string;
}

export interface UnionRecord extends UnionDetails {
  pageId: string;
  ending?: string;
}

export interface NotionLink {
  databaseId: string;
  dataSourceId: string;
  unionsDataSourceId: string;
  title: string;
  pageIds: Record<string, string>;
  externalIds: Record<string, string>;
  // Keyed by unionKey(a, b): the two person ids, sorted.
  unions: Record<string, UnionRecord>;
  baseline: Person[];
  syncedAt: string;
  // Which Notion columns the baseline was read with; a refresh reads everything again when it is older than NOTION_FIELDS_VERSION.
  fieldsVersion?: number;
  // What Notion has in each person's photo columns, keyed by person id and then column name; the images themselves are cached in IndexedDB.
  photos?: Record<string, Record<string, StoredPhoto[]>>;
}

export interface StoredPhoto {
  // The file's URL without its expiring signature; stable for as long as the file stays in Notion.
  key: string;
  name: string;
}

export function unionKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface FamilyTree {
  people: PeopleById;
  sourceName: string;
  loadId: number;
  notion?: NotionLink;
  // Current union details keyed by unionKey; for a Notion tree, link.unions holds what Notion last had, to diff against.
  unions: Record<string, UnionDetails>;
}

export interface TreeStats {
  total: number;
  generations: number;
  living: number;
  deceased: number;
  male: number;
  female: number;
  unknownGender: number;
  isolated: number;
  earliestYear?: number;
  latestYear?: number;
}

export type ParseResult = { ok: true; people: Person[]; warnings: string[] } | { ok: false; error: string };

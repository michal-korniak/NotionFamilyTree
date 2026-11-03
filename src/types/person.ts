export type Gender = 'M' | 'F' | 'U';

export interface Person {
  id: string;
  name: string;
  birthDate?: string;
  deathDate?: string;
  birthPlace?: string;
  deathPlace?: string;
  // Key of the grave in FamilyTree.graves; people buried together share one grave.
  graveId?: string;
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

// What the app lets you edit about a grave; mirrors the Groby columns Nazwa, Cmentarz and Informacje.
export interface GraveDetails {
  name?: string;
  cemetery?: string;
  info?: string;
}

export interface GraveRecord extends GraveDetails {
  pageId: string;
}

export type DateColumns = 'text' | 'date';

export interface NotionLink {
  databaseId: string;
  dataSourceId: string;
  unionsDataSourceId: string;
  title: string;
  pageIds: Record<string, string>;
  externalIds: Record<string, string>;
  // Keyed by unionKey(a, b): the two person ids, sorted.
  unions: Record<string, UnionRecord>;
  // The Groby database, found through the Osoby.Grób relation; absent while Osoby has no such column.
  gravesDataSourceId?: string;
  // Keyed by grave id: the page id for graves read from Notion, an app-made id for graves created here.
  graves?: Record<string, GraveRecord>;
  baseline: Person[];
  syncedAt: string;
  // Which Notion columns the baseline was read with; a refresh reads everything again when it is older than NOTION_FIELDS_VERSION.
  fieldsVersion?: number;
  // How Osoby and Związki keep dates: plain text (older databases, and undefined) or a Notion date with a "– dokładność" select beside it.
  dateColumns?: DateColumns;
  // What Notion has in each person's or grave's photo columns, keyed by person or grave id and then column name; the images themselves are cached in IndexedDB.
  photos?: Record<string, Record<string, StoredPhoto[]>>;
}

export interface StoredPhoto {
  // The file's URL without its expiring signature; stable for as long as the file stays in Notion.
  key: string;
  name: string;
  // The matching file in the thumbnail column ("min_" + name), when there is one.
  thumbKey?: string;
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
  // Current grave details keyed by grave id; for a Notion tree, link.graves holds what Notion last had.
  graves: Record<string, GraveDetails>;
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

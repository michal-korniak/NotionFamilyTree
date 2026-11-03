import type { NotionLink } from '../../types/person';
import { NotionClient, type NotionPropertyValue } from './notionClient';
import { thumbnailColumn } from './notionPhotos';
import { DATE_PRECISION_OPTIONS, GRAVES, NOTION_FIELDS_VERSION, PEOPLE, toNotionDate, UNIONS } from './notionMapping';

const richText = { rich_text: {} };
const files = { files: {} };
const date = { date: {} };
const precision = { select: { options: DATE_PRECISION_OPTIONS.map((name) => ({ name })) } };
const select = (names: string[]) => ({ select: { options: names.map((name) => ({ name })) } });
const twoWayRelation = (dataSourceId: string) => ({ relation: { data_source_id: dataSourceId, type: 'dual_property', dual_property: {} } });

// Notion names the far side of a new two-way relation itself ("Related to …"), so it is found by what it mirrors and given the name the import expects.
async function renameMirror(client: NotionClient, dataSourceId: string, targetDataSourceId: string, mirrorOf: string, name: string) {
  const schema = await client.retrieveDataSourceSchema(dataSourceId);
  const mirror = Object.values(schema).find((property) => property.type === 'relation' && property.relation?.data_source_id === targetDataSourceId && property.relation.dual_property?.synced_property_name === mirrorOf);
  if (!mirror) throw new Error(`Notion nie utworzył drugiej strony relacji „${mirrorOf}”.`);
  if (mirror.name !== name) await client.updateDataSource(dataSourceId, { [mirror.id]: { name } });
}

// Creates the Osoby, Związki and Groby databases on the given page, laid out like the imported "Drzewo" workspace, and returns a link to them
// that has nothing in it yet: the first save then sends the whole tree.
export async function createNotionDatabases(token: string, parentPageId: string, onProgress?: (message: string) => void): Promise<NotionLink> {
  const client = new NotionClient(token);
  onProgress?.('Sprawdzanie strony…');
  const existing = await client.listChildDatabases(parentPageId);
  const taken = existing.find((database) => ['Osoby', 'Związki', 'Groby'].includes(database.title.trim()));
  if (taken) throw new Error(`Na tej stronie jest już baza „${taken.title.trim()}”. Wybierz pustą stronę albo zaimportuj to drzewo z Notion.`);

  onProgress?.('Tworzenie bazy Osoby…');
  const people = await client.createDatabase(parentPageId, 'Osoby', {
    [PEOPLE.name]: { title: {} },
    [PEOPLE.givenNames]: richText,
    [PEOPLE.birthSurname]: richText,
    [PEOPLE.marriedSurname]: richText,
    [PEOPLE.gender]: select(['Mężczyzna', 'Kobieta']),
    [PEOPLE.birthDate]: date,
    [PEOPLE.birthPrecision]: precision,
    [PEOPLE.birthPlace]: richText,
    [PEOPLE.deathDate]: date,
    [PEOPLE.deathPrecision]: precision,
    [PEOPLE.deathPlace]: richText,
    [PEOPLE.notes]: richText,
    [PEOPLE.photos]: files,
    [thumbnailColumn(PEOPLE.photos)]: files,
    [PEOPLE.externalId]: richText,
  });
  onProgress?.('Tworzenie relacji rodziców…');
  await client.updateDataSource(people.dataSourceId, { [PEOPLE.father]: twoWayRelation(people.dataSourceId), [PEOPLE.mother]: twoWayRelation(people.dataSourceId) });
  await renameMirror(client, people.dataSourceId, people.dataSourceId, PEOPLE.father, PEOPLE.childrenA);
  await renameMirror(client, people.dataSourceId, people.dataSourceId, PEOPLE.mother, PEOPLE.childrenB);

  onProgress?.('Tworzenie bazy Związki…');
  const unions = await client.createDatabase(parentPageId, 'Związki', {
    [UNIONS.title]: { title: {} },
    [UNIONS.partners]: twoWayRelation(people.dataSourceId),
    [UNIONS.kind]: select(['Małżeństwo', 'Narzeczeństwo', 'Nieformalny']),
    [UNIONS.date]: date,
    [UNIONS.datePrecision]: precision,
    [UNIONS.place]: richText,
    [UNIONS.ending]: select(['Rozwód', 'Śmierć']),
    [UNIONS.notes]: richText,
  });
  await renameMirror(client, people.dataSourceId, unions.dataSourceId, UNIONS.partners, PEOPLE.unions);

  onProgress?.('Tworzenie bazy Groby…');
  const graves = await client.createDatabase(parentPageId, 'Groby', {
    [GRAVES.title]: { title: {} },
    [GRAVES.cemetery]: richText,
    [GRAVES.info]: richText,
    [GRAVES.photos]: files,
    [thumbnailColumn(GRAVES.photos)]: files,
    [GRAVES.buried]: twoWayRelation(people.dataSourceId),
  });
  await renameMirror(client, people.dataSourceId, graves.dataSourceId, GRAVES.buried, PEOPLE.grave);

  return { databaseId: people.databaseId, dataSourceId: people.dataSourceId, unionsDataSourceId: unions.dataSourceId, gravesDataSourceId: graves.dataSourceId, title: 'Osoby', pageIds: {}, externalIds: {}, unions: {}, graves: {}, photos: {}, baseline: [], syncedAt: new Date().toISOString(), fieldsVersion: NOTION_FIELDS_VERSION, dateColumns: 'date' };
}

export interface DateMigration {
  moved: number;
  // Text the app could not read as a date; it stays in the "(tekst)" column for a person to fix by hand.
  unreadable: string[];
}

const textColumnOf = (column: string) => `${column} (tekst)`;
const plainText = (value: NotionPropertyValue | undefined) => (value?.type === 'rich_text' ? (value as { rich_text: { plain_text: string }[] }).rich_text.map((part) => part.plain_text).join('').trim() : '');

// Turns the text dates of Osoby and Związki into date columns with a precision select. The text columns are kept, renamed to "… (tekst)",
// and every step can run again: a column already moved is left as it is, and only pages whose new date is still empty are filled.
export async function moveDatesToDateColumns(token: string, link: NotionLink, onProgress: (message: string) => void): Promise<DateMigration> {
  const client = new NotionClient(token);
  const result: DateMigration = { moved: 0, unreadable: [] };
  const sources: { name: string; dataSourceId: string; columns: [string, string][] }[] = [
    { name: 'Osoby', dataSourceId: link.dataSourceId, columns: [[PEOPLE.birthDate, PEOPLE.birthPrecision], [PEOPLE.deathDate, PEOPLE.deathPrecision]] },
    { name: 'Związki', dataSourceId: link.unionsDataSourceId, columns: [[UNIONS.date, UNIONS.datePrecision]] },
  ];
  for (const { name, dataSourceId, columns } of sources) {
    onProgress(`Zmiana kolumn w bazie ${name}…`);
    const schema = await client.retrieveDataSourceSchema(dataSourceId);
    for (const [column] of columns) if (schema[column]?.type === 'rich_text') await client.updateDataSource(dataSourceId, { [column]: { name: textColumnOf(column) } });
    const missing = Object.fromEntries(columns.flatMap(([column, precisionColumn]) => [...(schema[column]?.type === 'date' ? [] : [[column, date]]), ...(schema[precisionColumn] ? [] : [[precisionColumn, precision]])]));
    if (Object.keys(missing).length) await client.updateDataSource(dataSourceId, missing);

    onProgress(`Wczytywanie bazy ${name}…`);
    const pages = await client.queryAllPages(dataSourceId);
    let done = 0;
    for (const page of pages) {
      const properties: Record<string, unknown> = {};
      for (const [column, precisionColumn] of columns) {
        const current = page.properties[column] as { date?: { start: string } | null } | undefined;
        const text = plainText(page.properties[textColumnOf(column)]);
        if (!text || current?.date || page.properties[precisionColumn]?.type === 'select' && (page.properties[precisionColumn] as { select: unknown }).select) continue;
        const { start, precision: value } = toNotionDate(text);
        if (!value) { result.unreadable.push(text); continue; }
        properties[column] = { date: start ? { start } : null };
        properties[precisionColumn] = { select: { name: value } };
      }
      if (Object.keys(properties).length) { await client.updatePage(page.id, { properties }); result.moved++; }
      onProgress(`Przenoszenie dat w bazie ${name}: ${++done} z ${pages.length}…`);
    }
  }
  return result;
}

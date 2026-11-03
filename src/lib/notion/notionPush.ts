import { unionKey, type GraveDetails, type GraveRecord, type NotionLink, type PeopleById, type Person, type UnionDetails } from '../../types/person';
import { NotionClient } from './notionClient';
import { applyPhotoChanges, makeThumbnail, type PhotoAdd } from './notionPhotos';
import type { PhotoOp } from '../photoQueue';
import { addRelation, deletePerson, removeRelation } from '../treeEdits';
import { buriedIn, graveTitle } from '../graves';
import { DETAIL_FIELDS, detailProperties, externalIdProperty, graveProperties, graveProperty, graveTitleProperty, parentProperties, unionDetailProperties, unionProperties, unionTitleProperty, type DetailField } from './notionMapping';

export type ChangeKind = 'create' | 'restore' | 'update' | 'trash' | 'union-create' | 'union-rename' | 'union-update' | 'union-trash' | 'grave-create' | 'grave-update' | 'grave-trash' | 'photos';

export interface NotionChange {
  kind: ChangeKind;
  key: string;
  label: string;
  detail?: string;
}

export interface PushResult {
  link: NotionLink;
  applied: number;
  error?: string;
}

function changedDetailFields(base: Person, person: Person): DetailField[] {
  return DETAIL_FIELDS.filter((field) => (base[field] ?? '') !== (person[field] ?? ''));
}

function filledDetailFields(person: Person): DetailField[] {
  return DETAIL_FIELDS.filter((field) => (person[field] ?? '') !== '' && !(field === 'gender' && person.gender === 'U'));
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

// Children are not compared: they mirror each child's parents, and Notion fills the "Dzieci" side from Ojciec/Matka.
// A parent's gender decides whether they sit in Ojciec or Matka, so a gender change re-sends the children's parent slots.
function parentsChanged(base: Person, person: Person, baseline: ReadonlyMap<string, Person>, current: PeopleById): boolean {
  return !sameSet(base.parents, person.parents) || person.parents.some((id) => baseline.get(id)?.gender !== current.get(id)?.gender);
}

function pairs(people: Iterable<Person>): Map<string, [string, string]> {
  const result = new Map<string, [string, string]>();
  for (const person of people) for (const spouseId of person.spouses) result.set(unionKey(person.id, spouseId), person.id < spouseId ? [person.id, spouseId] : [spouseId, person.id]);
  return result;
}

interface Plan {
  created: Person[];
  restored: Person[];
  updated: { person: Person; fields: DetailField[]; parents: boolean; grave: boolean }[];
  trashed: Person[];
  unionsCreated: [string, string][];
  unionsRenamed: [string, string][];
  unionsUpdated: { pair: [string, string]; fields: string[] }[];
  unionsTrashed: [string, string][];
  gravesCreated: string[];
  gravesUpdated: { id: string; fields: string[] }[];
  gravesTrashed: string[];
}

// The name is not edited: it follows the people buried in the grave and is rewritten whenever they change.
const graveFieldLabels = { cemetery: 'cmentarz', info: 'informacje' } as const;

function changedGraveFields(before: GraveDetails | undefined, after: GraveDetails | undefined): string[] {
  return (Object.keys(graveFieldLabels) as (keyof typeof graveFieldLabels)[]).filter((field) => (before?.[field] ?? '') !== (after?.[field] ?? '')).map((field) => graveFieldLabels[field]);
}

const unionFieldLabels: Record<keyof UnionDetails, string> = { kind: 'rodzaj', date: 'data', place: 'miejsce', notes: 'notatki' };

function changedUnionFields(before: UnionDetails | undefined, after: UnionDetails | undefined): string[] {
  return (Object.keys(unionFieldLabels) as (keyof UnionDetails)[]).filter((field) => (before?.[field] ?? '') !== (after?.[field] ?? '')).map((field) => unionFieldLabels[field]);
}

function plan(link: NotionLink, current: PeopleById, unions: Record<string, UnionDetails>, graves: Record<string, GraveDetails>): Plan {
  const baseline = new Map(link.baseline.map((p) => [p.id, p]));
  const result: Plan = { created: [], restored: [], updated: [], trashed: [], unionsCreated: [], unionsRenamed: [], unionsUpdated: [], unionsTrashed: [], gravesCreated: [], gravesUpdated: [], gravesTrashed: [] };
  const renamed = new Set<string>();
  for (const person of current.values()) {
    const base = baseline.get(person.id);
    if (!base) { (link.pageIds[person.id] ? result.restored : result.created).push(person); continue; }
    const fields = changedDetailFields(base, person);
    const parents = parentsChanged(base, person, baseline, current);
    const grave = (base.graveId ?? '') !== (person.graveId ?? '');
    if (fields.length || parents || grave) result.updated.push({ person, fields, parents, grave });
    if (fields.includes('name')) renamed.add(person.id);
  }
  for (const base of baseline.values()) if (!current.has(base.id) && link.pageIds[base.id]) result.trashed.push(base);

  const before = pairs(baseline.values());
  const after = pairs(current.values());
  for (const [key, pair] of after) if (!before.has(key) || !link.unions[key]) result.unionsCreated.push(pair);
  for (const [key, pair] of before) if (!after.has(key) && link.unions[key]) result.unionsTrashed.push(pair);
  for (const [key, pair] of after) if (before.has(key) && link.unions[key] && (renamed.has(pair[0]) || renamed.has(pair[1]))) result.unionsRenamed.push(pair);
  for (const [key, pair] of after) {
    const fields = before.has(key) && link.unions[key] ? changedUnionFields(link.unions[key], unions[key]) : [];
    if (fields.length) result.unionsUpdated.push({ pair, fields });
  }

  const notionGraves = link.graves ?? {};
  for (const [id, grave] of Object.entries(graves)) {
    if (!notionGraves[id]) { result.gravesCreated.push(id); continue; }
    const fields = changedGraveFields(notionGraves[id], grave);
    if (fields.length) result.gravesUpdated.push({ id, fields });
  }
  for (const id of Object.keys(notionGraves)) if (!graves[id]) result.gravesTrashed.push(id);
  return result;
}

const fieldLabels: Record<DetailField, string> = { name: 'imię i nazwisko', givenNames: 'imiona', birthSurname: 'nazwisko rodowe', marriedSurname: 'nazwisko', gender: 'płeć', birthDate: 'data urodzenia', deathDate: 'data śmierci', birthPlace: 'miejsce urodzenia', deathPlace: 'miejsce śmierci', biography: 'notatki' };

const graveName = (id: string, graves: Record<string, GraveDetails>, link: NotionLink, current: PeopleById) => graveTitle(graves[id] ?? link.graves?.[id], buriedIn(current, id));

export function diffNotion(link: NotionLink, current: PeopleById, unions: Record<string, UnionDetails>, graves: Record<string, GraveDetails>): NotionChange[] {
  const p = plan(link, current, unions, graves);
  const nameOf = (id: string) => current.get(id)?.name ?? link.baseline.find((b) => b.id === id)?.name ?? id;
  const couple = ([a, b]: [string, string]) => `${nameOf(a)} & ${nameOf(b)}`;
  return [
    ...p.gravesCreated.map((id) => ({ kind: 'grave-create' as const, key: id, label: graveName(id, graves, link, current) })),
    ...p.created.map((person) => ({ kind: 'create' as const, key: person.id, label: person.name })),
    ...p.restored.map((person) => ({ kind: 'restore' as const, key: person.id, label: person.name })),
    ...p.updated.map(({ person, fields, parents, grave }) => ({ kind: 'update' as const, key: person.id, label: person.name, detail: [...fields.map((f) => fieldLabels[f]), ...(parents ? ['rodzice'] : []), ...(grave ? ['grób'] : [])].join(', ') })),
    ...p.unionsCreated.map((pair) => ({ kind: 'union-create' as const, key: unionKey(...pair), label: couple(pair) })),
    ...p.unionsRenamed.map((pair) => ({ kind: 'union-rename' as const, key: unionKey(...pair), label: couple(pair), detail: 'tytuł' })),
    ...p.unionsUpdated.map(({ pair, fields }) => ({ kind: 'union-update' as const, key: `${unionKey(...pair)}:details`, label: couple(pair), detail: fields.join(', ') })),
    ...p.unionsTrashed.map((pair) => ({ kind: 'union-trash' as const, key: unionKey(...pair), label: couple(pair) })),
    ...p.gravesUpdated.map(({ id, fields }) => ({ kind: 'grave-update' as const, key: id, label: graveName(id, graves, link, current), detail: fields.join(', ') })),
    ...p.gravesTrashed.map((id) => ({ kind: 'grave-trash' as const, key: id, label: graveName(id, graves, link, current) })),
    ...p.trashed.map((person) => ({ kind: 'trash' as const, key: person.id, label: person.name })),
  ];
}

export interface NotionEdits {
  changedPersonIds: string[];
  removedPersonIds: string[];
  changedUnionKeys: string[];
  removedUnionKeys: string[];
  changedGraveIds: string[];
  removedGraveIds: string[];
}

// Local changes to a person, couple or grave that someone else changed or removed in Notion since the last sync. New people cannot clash, and
// photo changes are merged with what Notion has when they are saved.
export function conflictingChanges(changes: NotionChange[], notion: NotionEdits): NotionChange[] {
  const people = new Set([...notion.changedPersonIds, ...notion.removedPersonIds]);
  const couples = new Set([...notion.changedUnionKeys, ...notion.removedUnionKeys]);
  const graves = new Set([...notion.changedGraveIds, ...notion.removedGraveIds]);
  return changes.filter((change) => {
    if (change.kind === 'restore' || change.kind === 'update' || change.kind === 'trash') return people.has(change.key);
    if (change.kind.startsWith('union-')) return couples.has(change.key.replace(/:details$/, ''));
    if (change.kind === 'grave-update' || change.kind === 'grave-trash') return graves.has(change.key);
    return false;
  });
}

// A renamed couple's title follows a person's name change and goes away when that change is undone, so it has no undo of its own.
export function canRevert(change: NotionChange): boolean {
  return change.kind !== 'union-rename';
}

// Puts one change back to what Notion has (link.baseline and link.unions), keeping both sides of every link in step. Photo changes live in
// the photo queue and are undone there.
export function revertChange(change: NotionChange, link: NotionLink, current: PeopleById, unions: Record<string, UnionDetails>, graves: Record<string, GraveDetails>): { people: PeopleById; unions: Record<string, UnionDetails>; graves: Record<string, GraveDetails> } {
  const baseline = new Map(link.baseline.map((person) => [person.id, person]));
  let people = current;
  const nextUnions = { ...unions };
  const nextGraves = { ...graves };
  const notionDetails = (key: string): UnionDetails => { const { kind, date, place, notes } = link.unions[key] ?? {}; return { kind, date, place, notes }; };
  const relink = (id: string, kind: 'parents' | 'children' | 'spouses', ids: string[]) => {
    for (const otherId of people.get(id)?.[kind] ?? []) if (!ids.includes(otherId)) people = removeRelation(people, id, kind, otherId);
    for (const otherId of ids) { const added = people.has(otherId) && !people.get(id)?.[kind].includes(otherId) ? addRelation(people, id, kind, otherId) : null; if (added?.ok) people = added.people; }
  };

  switch (change.kind) {
    case 'create':
    case 'restore':
      people = deletePerson(people, change.key);
      break;
    case 'update': {
      const base = baseline.get(change.key);
      const person = people.get(change.key);
      if (!base || !person) break;
      people = new Map(people).set(person.id, { ...person, ...Object.fromEntries(DETAIL_FIELDS.map((field) => [field, base[field]])), graveId: base.graveId });
      relink(person.id, 'parents', base.parents);
      break;
    }
    case 'trash': {
      const base = baseline.get(change.key);
      if (!base) break;
      people = new Map(people).set(base.id, { ...base, parents: [], children: [], spouses: [] });
      relink(base.id, 'parents', base.parents);
      relink(base.id, 'children', base.children);
      relink(base.id, 'spouses', base.spouses);
      for (const spouseId of base.spouses) nextUnions[unionKey(base.id, spouseId)] = notionDetails(unionKey(base.id, spouseId));
      break;
    }
    case 'union-create':
    case 'union-trash': {
      const [a, b] = change.key.split('|') as [string, string];
      if (change.kind === 'union-create') people = removeRelation(people, a, 'spouses', b);
      else { const added = addRelation(people, a, 'spouses', b); if (added.ok) people = added.people; nextUnions[change.key] = notionDetails(change.key); }
      break;
    }
    case 'union-update': {
      const key = change.key.replace(/:details$/, '');
      nextUnions[key] = notionDetails(key);
      break;
    }
    case 'grave-create': {
      delete nextGraves[change.key];
      const buried = buriedIn(people, change.key);
      if (buried.length) { const next = new Map(people); for (const person of buried) next.set(person.id, { ...person, graveId: undefined }); people = next; }
      break;
    }
    case 'grave-update':
    case 'grave-trash': {
      const { name, cemetery, info } = link.graves?.[change.key] ?? {};
      nextGraves[change.key] = { name, cemetery, info };
      break;
    }
  }
  return { people, unions: nextUnions, graves: nextGraves };
}

interface PhotoGroup {
  personId: string;
  property: string;
  ops: PhotoOp[];
}

// Photos of a person or grave that is no longer in the tree are left out: their page is about to go to the trash anyway.
function photoGroups(ops: PhotoOp[], current: PeopleById, graves: Record<string, GraveDetails>): PhotoGroup[] {
  const groups = new Map<string, PhotoGroup>();
  for (const op of ops) {
    if (!current.has(op.personId) && !graves[op.personId]) continue;
    const key = `${op.personId}|${op.property}`;
    const group = groups.get(key) ?? { personId: op.personId, property: op.property, ops: [] };
    group.ops.push(op);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function photoChanges(ops: PhotoOp[], current: PeopleById, graves: Record<string, GraveDetails>): NotionChange[] {
  return photoGroups(ops, current, graves).map(({ personId, property, ops: groupOps }) => {
    const added = groupOps.filter((op) => op.kind === 'add').length;
    const removed = groupOps.length - added;
    const counts = [added ? `+${added}` : '', removed ? `−${removed}` : ''].filter(Boolean).join(' ');
    return { kind: 'photos' as const, key: `${personId}:${property}`, label: current.get(personId)?.name ?? graveTitle(graves[personId], buriedIn(current, personId)), detail: `${property.toLowerCase()} ${counts}` };
  });
}

function newExternalId(taken: Set<string>): string {
  let id: string;
  do id = `APP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`; while (taken.has(id));
  return id;
}

// Each successful request updates the baseline for exactly what it wrote, so after a failure a retry only sends what is still different.
export async function pushToNotion(token: string, link: NotionLink, current: PeopleById, currentUnions: Record<string, UnionDetails>, currentGraves: Record<string, GraveDetails>, photoOps: PhotoOp[], onProgress: (done: number, total: number) => void, onPhotosSaved: (opIds: string[]) => void): Promise<PushResult> {
  const client = new NotionClient(token);
  const p = plan(link, current, currentUnions, currentGraves);
  const photoChangeGroups = photoGroups(photoOps, current, currentGraves);
  const originalBaseline = new Map(link.baseline.map((person) => [person.id, person]));
  const baseline = new Map(originalBaseline);
  const pageIds = { ...link.pageIds };
  const externalIds = { ...link.externalIds };
  const unions = { ...link.unions };
  const photos = { ...link.photos };
  const graves: Record<string, GraveRecord> = { ...link.graves };
  const knownExternalIds = new Set(Object.values(externalIds));
  // Graves whose people change (someone joins, leaves or is renamed) get a new title, like a couple whose partner is renamed.
  const retitled = new Set<string>();
  for (const person of [...p.created, ...p.restored, ...p.trashed]) if (person.graveId) retitled.add(person.graveId);
  for (const { person, fields, grave } of p.updated) {
    const before = originalBaseline.get(person.id)?.graveId;
    if (grave && before) retitled.add(before);
    if (person.graveId && (grave || fields.some((field) => field === 'name' || field === 'givenNames' || field === 'birthSurname' || field === 'marriedSurname'))) retitled.add(person.graveId);
  }
  const titleOnly = [...retitled].filter((id) => link.graves?.[id] && currentGraves[id] && !p.gravesUpdated.some((update) => update.id === id));
  const total = p.gravesCreated.length + p.created.length * 2 + p.restored.length * 2 + p.updated.length + p.unionsCreated.length + p.unionsRenamed.length + p.unionsUpdated.length + p.unionsTrashed.length + p.gravesUpdated.length + titleOnly.length + photoChangeGroups.length + p.gravesTrashed.length + p.trashed.length;
  let applied = 0;
  const step = () => onProgress(++applied, total);
  // syncedAt stays put: only a refresh may move it, or edits others made since the last refresh would fall outside its window.
  const result = (error?: string): PushResult => ({ link: { ...link, pageIds, externalIds, unions, graves, photos, baseline: [...baseline.values()] }, applied, error });
  const titleOf = (id: string) => graveTitle(currentGraves[id], buriedIn(current, id));
  const graveRecordOf = (id: string, pageId = graves[id]!.pageId): GraveRecord => { const { cemetery, info } = currentGraves[id] ?? {}; return { pageId, name: titleOf(id), cemetery, info }; };
  const graveRelation = (person: Person) => graveProperty(person.graveId ? graves[person.graveId]?.pageId : undefined);
  const setSpouses = (id: string, update: (spouses: string[]) => string[]) => { const base = baseline.get(id); if (base) baseline.set(id, { ...base, spouses: update(base.spouses) }); };

  try {
    if ((p.gravesCreated.length || p.gravesUpdated.length || p.gravesTrashed.length) && !link.gravesDataSourceId) throw new Error('W Notion brakuje bazy Groby (relacji „Grób” w bazie Osoby).');
    // Graves come first, so people can point at them.
    for (const id of p.gravesCreated) {
      const page = await client.createPage(link.gravesDataSourceId!, graveProperties(currentGraves[id]!, titleOf(id)));
      graves[id] = graveRecordOf(id, page.id);
      step();
    }

    // Pages are created without relations first, so every person has a page id before any relation points at them.
    for (const person of [...p.created, ...p.restored]) {
      if (pageIds[person.id] && p.restored.includes(person)) await client.updatePage(pageIds[person.id]!, { in_trash: false, properties: detailProperties(person, filledDetailFields(person), link.dateColumns) });
      else {
        const externalId = newExternalId(knownExternalIds);
        const page = await client.createPage(link.dataSourceId, { ...detailProperties(person, filledDetailFields(person), link.dateColumns), ...externalIdProperty(externalId) });
        pageIds[person.id] = page.id;
        externalIds[person.id] = externalId;
        knownExternalIds.add(externalId);
      }
      baseline.set(person.id, { ...person, graveId: undefined, parents: [], spouses: [], children: [] });
      step();
    }

    const parentRelations = (person: Person) => parentProperties(person.parents.filter((id) => pageIds[id]).map((id) => ({ pageId: pageIds[id]!, gender: current.get(id)?.gender ?? 'U' })));
    for (const person of [...p.created, ...p.restored]) {
      if (person.parents.length || person.graveId) await client.updatePage(pageIds[person.id]!, { properties: { ...parentRelations(person), ...(person.graveId ? graveRelation(person) : {}) } });
      baseline.set(person.id, { ...person, spouses: [] });
      step();
    }

    for (const { person, fields, parents, grave } of p.updated) {
      await client.updatePage(pageIds[person.id]!, { properties: { ...detailProperties(person, fields, link.dateColumns), ...(parents ? parentRelations(person) : {}), ...(grave ? graveRelation(person) : {}) } });
      baseline.set(person.id, { ...person, spouses: baseline.get(person.id)?.spouses ?? [] });
      step();
    }

    for (const [a, b] of p.unionsCreated) {
      const key = unionKey(a, b);
      if (!unions[key]) {
        const page = await client.createPage(link.unionsDataSourceId, unionProperties(current.get(a)!, current.get(b)!, pageIds[a]!, pageIds[b]!, currentUnions[key], link.dateColumns));
        unions[key] = { pageId: page.id, ...currentUnions[key] };
      }
      setSpouses(a, (s) => [...new Set([...s, b])]);
      setSpouses(b, (s) => [...new Set([...s, a])]);
      step();
    }

    for (const [a, b] of p.unionsRenamed) {
      await client.updatePage(unions[unionKey(a, b)]!.pageId, { properties: unionTitleProperty(current.get(a)!, current.get(b)!) });
      step();
    }

    for (const { pair: [a, b] } of p.unionsUpdated) {
      const key = unionKey(a, b);
      const details = currentUnions[key] ?? {};
      await client.updatePage(unions[key]!.pageId, { properties: unionDetailProperties(details, link.dateColumns) });
      unions[key] = { ...unions[key]!, kind: details.kind, date: details.date, place: details.place, notes: details.notes };
      step();
    }

    for (const [a, b] of p.unionsTrashed) {
      const key = unionKey(a, b);
      await client.updatePage(unions[key]!.pageId, { in_trash: true });
      delete unions[key];
      setSpouses(a, (s) => s.filter((id) => id !== b));
      setSpouses(b, (s) => s.filter((id) => id !== a));
      step();
    }

    for (const { id } of p.gravesUpdated) {
      await client.updatePage(graves[id]!.pageId, { properties: graveProperties(currentGraves[id]!, titleOf(id)) });
      graves[id] = graveRecordOf(id);
      step();
    }

    for (const id of titleOnly) {
      await client.updatePage(graves[id]!.pageId, { properties: graveTitleProperty(titleOf(id)) });
      graves[id] = { ...graves[id]!, name: titleOf(id) };
      step();
    }

    for (const { personId, property, ops } of photoChangeGroups) {
      const adds: PhotoAdd[] = [];
      for (const op of ops) if (op.kind === 'add') adds.push({ blob: op.blob, thumb: op.thumb ?? await makeThumbnail(op.blob), filename: op.filename });
      const removeKeys = ops.flatMap((op) => (op.kind === 'remove' ? [op.fileKey] : []));
      const listing = await applyPhotoChanges(client, pageIds[personId] ?? graves[personId]!.pageId, property, adds, removeKeys);
      photos[personId] = { ...photos[personId], [property]: listing };
      onPhotosSaved(ops.map((op) => op.id));
      step();
    }

    for (const id of p.gravesTrashed) {
      await client.updatePage(graves[id]!.pageId, { in_trash: true });
      delete graves[id];
      step();
    }

    for (const person of p.trashed) {
      await client.updatePage(pageIds[person.id]!, { in_trash: true });
      baseline.delete(person.id);
      step();
    }
  } catch (error) {
    return result(error instanceof Error ? error.message : String(error));
  }
  return result();
}


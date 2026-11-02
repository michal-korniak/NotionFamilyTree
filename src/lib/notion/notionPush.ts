import { unionKey, type NotionLink, type PeopleById, type Person, type UnionDetails } from '../../types/person';
import { NotionClient } from './notionClient';
import { applyPhotoChanges, makeThumbnail, type PhotoAdd } from './notionPhotos';
import type { PhotoOp } from '../photoQueue';
import { DETAIL_FIELDS, detailProperties, externalIdProperty, parentProperties, unionDetailProperties, unionProperties, unionTitleProperty, type DetailField } from './notionMapping';

export type ChangeKind = 'create' | 'restore' | 'update' | 'trash' | 'union-create' | 'union-rename' | 'union-update' | 'union-trash' | 'photos';

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
  updated: { person: Person; fields: DetailField[]; parents: boolean }[];
  trashed: Person[];
  unionsCreated: [string, string][];
  unionsRenamed: [string, string][];
  unionsUpdated: { pair: [string, string]; fields: string[] }[];
  unionsTrashed: [string, string][];
}

const unionFieldLabels: Record<keyof UnionDetails, string> = { kind: 'rodzaj', date: 'data', place: 'miejsce', notes: 'notatki' };

function changedUnionFields(before: UnionDetails | undefined, after: UnionDetails | undefined): string[] {
  return (Object.keys(unionFieldLabels) as (keyof UnionDetails)[]).filter((field) => (before?.[field] ?? '') !== (after?.[field] ?? '')).map((field) => unionFieldLabels[field]);
}

function plan(link: NotionLink, current: PeopleById, unions: Record<string, UnionDetails>): Plan {
  const baseline = new Map(link.baseline.map((p) => [p.id, p]));
  const result: Plan = { created: [], restored: [], updated: [], trashed: [], unionsCreated: [], unionsRenamed: [], unionsUpdated: [], unionsTrashed: [] };
  const renamed = new Set<string>();
  for (const person of current.values()) {
    const base = baseline.get(person.id);
    if (!base) { (link.pageIds[person.id] ? result.restored : result.created).push(person); continue; }
    const fields = changedDetailFields(base, person);
    const parents = parentsChanged(base, person, baseline, current);
    if (fields.length || parents) result.updated.push({ person, fields, parents });
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
  return result;
}

const fieldLabels: Record<DetailField, string> = { name: 'imię i nazwisko', givenNames: 'imiona', birthSurname: 'nazwisko rodowe', marriedSurname: 'nazwisko', gender: 'płeć', birthDate: 'data urodzenia', deathDate: 'data śmierci', birthPlace: 'miejsce urodzenia', deathPlace: 'miejsce śmierci', cemetery: 'cmentarz', burialInfo: 'informacje o pochówku', biography: 'notatki' };

export function diffNotion(link: NotionLink, current: PeopleById, unions: Record<string, UnionDetails>): NotionChange[] {
  const p = plan(link, current, unions);
  const nameOf = (id: string) => current.get(id)?.name ?? link.baseline.find((b) => b.id === id)?.name ?? id;
  const couple = ([a, b]: [string, string]) => `${nameOf(a)} & ${nameOf(b)}`;
  return [
    ...p.created.map((person) => ({ kind: 'create' as const, key: person.id, label: person.name })),
    ...p.restored.map((person) => ({ kind: 'restore' as const, key: person.id, label: person.name })),
    ...p.updated.map(({ person, fields, parents }) => ({ kind: 'update' as const, key: person.id, label: person.name, detail: [...fields.map((f) => fieldLabels[f]), ...(parents ? ['rodzice'] : [])].join(', ') })),
    ...p.unionsCreated.map((pair) => ({ kind: 'union-create' as const, key: unionKey(...pair), label: couple(pair) })),
    ...p.unionsRenamed.map((pair) => ({ kind: 'union-rename' as const, key: unionKey(...pair), label: couple(pair), detail: 'tytuł' })),
    ...p.unionsUpdated.map(({ pair, fields }) => ({ kind: 'union-update' as const, key: `${unionKey(...pair)}:details`, label: couple(pair), detail: fields.join(', ') })),
    ...p.unionsTrashed.map((pair) => ({ kind: 'union-trash' as const, key: unionKey(...pair), label: couple(pair) })),
    ...p.trashed.map((person) => ({ kind: 'trash' as const, key: person.id, label: person.name })),
  ];
}

interface PhotoGroup {
  personId: string;
  property: string;
  ops: PhotoOp[];
}

// Photos of a person who is no longer in the tree are left out: their page is about to go to the trash anyway.
function photoGroups(ops: PhotoOp[], current: PeopleById): PhotoGroup[] {
  const groups = new Map<string, PhotoGroup>();
  for (const op of ops) {
    if (!current.has(op.personId)) continue;
    const key = `${op.personId}|${op.property}`;
    const group = groups.get(key) ?? { personId: op.personId, property: op.property, ops: [] };
    group.ops.push(op);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function photoChanges(ops: PhotoOp[], current: PeopleById): NotionChange[] {
  return photoGroups(ops, current).map(({ personId, property, ops: groupOps }) => {
    const added = groupOps.filter((op) => op.kind === 'add').length;
    const removed = groupOps.length - added;
    const counts = [added ? `+${added}` : '', removed ? `−${removed}` : ''].filter(Boolean).join(' ');
    return { kind: 'photos' as const, key: `${personId}:${property}`, label: current.get(personId)!.name, detail: `${property.toLowerCase()} ${counts}` };
  });
}

function newExternalId(taken: Set<string>): string {
  let id: string;
  do id = `APP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`; while (taken.has(id));
  return id;
}

// Each successful request updates the baseline for exactly what it wrote, so after a failure a retry only sends what is still different.
export async function pushToNotion(token: string, link: NotionLink, current: PeopleById, currentUnions: Record<string, UnionDetails>, photoOps: PhotoOp[], onProgress: (done: number, total: number) => void, onPhotosSaved: (opIds: string[]) => void): Promise<PushResult> {
  const client = new NotionClient(token);
  const p = plan(link, current, currentUnions);
  const photoChangeGroups = photoGroups(photoOps, current);
  const originalBaseline = new Map(link.baseline.map((person) => [person.id, person]));
  const baseline = new Map(originalBaseline);
  const pageIds = { ...link.pageIds };
  const externalIds = { ...link.externalIds };
  const unions = { ...link.unions };
  const photos = { ...link.photos };
  const knownExternalIds = new Set(Object.values(externalIds));
  const total = p.created.length * 2 + p.restored.length * 2 + p.updated.length + p.unionsCreated.length + p.unionsRenamed.length + p.unionsUpdated.length + p.unionsTrashed.length + p.trashed.length + photoChangeGroups.length;
  let applied = 0;
  const step = () => onProgress(++applied, total);
  const result = (error?: string): PushResult => ({ link: { ...link, pageIds, externalIds, unions, photos, baseline: [...baseline.values()], syncedAt: new Date().toISOString() }, applied, error });
  const setSpouses = (id: string, update: (spouses: string[]) => string[]) => { const base = baseline.get(id); if (base) baseline.set(id, { ...base, spouses: update(base.spouses) }); };

  try {
    // Pages are created without relations first, so every person has a page id before any relation points at them.
    for (const person of [...p.created, ...p.restored]) {
      if (pageIds[person.id] && p.restored.includes(person)) await client.updatePage(pageIds[person.id]!, { in_trash: false, properties: detailProperties(person, filledDetailFields(person)) });
      else {
        const externalId = newExternalId(knownExternalIds);
        const page = await client.createPage(link.dataSourceId, { ...detailProperties(person, filledDetailFields(person)), ...externalIdProperty(externalId) });
        pageIds[person.id] = page.id;
        externalIds[person.id] = externalId;
        knownExternalIds.add(externalId);
      }
      baseline.set(person.id, { ...person, parents: [], spouses: [], children: [] });
      step();
    }

    const parentRelations = (person: Person) => parentProperties(person.parents.filter((id) => pageIds[id]).map((id) => ({ pageId: pageIds[id]!, gender: current.get(id)?.gender ?? 'U' })));
    for (const person of [...p.created, ...p.restored]) {
      if (person.parents.length) await client.updatePage(pageIds[person.id]!, { properties: parentRelations(person) });
      baseline.set(person.id, { ...person, spouses: [] });
      step();
    }

    for (const { person, fields, parents } of p.updated) {
      await client.updatePage(pageIds[person.id]!, { properties: { ...detailProperties(person, fields), ...(parents ? parentRelations(person) : {}) } });
      baseline.set(person.id, { ...person, spouses: baseline.get(person.id)?.spouses ?? [] });
      step();
    }

    for (const [a, b] of p.unionsCreated) {
      const key = unionKey(a, b);
      if (!unions[key]) {
        const page = await client.createPage(link.unionsDataSourceId, unionProperties(current.get(a)!, current.get(b)!, pageIds[a]!, pageIds[b]!, currentUnions[key]));
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
      await client.updatePage(unions[key]!.pageId, { properties: unionDetailProperties(details) });
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

    for (const { personId, property, ops } of photoChangeGroups) {
      const adds: PhotoAdd[] = [];
      for (const op of ops) if (op.kind === 'add') adds.push({ blob: op.blob, thumb: op.thumb ?? await makeThumbnail(op.blob), filename: op.filename });
      const removeKeys = ops.flatMap((op) => (op.kind === 'remove' ? [op.fileKey] : []));
      const listing = await applyPhotoChanges(client, pageIds[personId]!, property, adds, removeKeys);
      photos[personId] = { ...photos[personId], [property]: listing };
      onPhotosSaved(ops.map((op) => op.id));
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


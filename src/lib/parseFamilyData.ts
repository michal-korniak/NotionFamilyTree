import type { Gender, ParseResult, Person } from '../types/person';
import { linkRelationships } from './relationships';

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asId(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

function asText(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asIdList(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  const items = Array.isArray(value) ? value : [value];
  return [...new Set(items.map(asId).filter((id): id is string => id !== undefined))];
}

// "K" covers Polish "kobieta", since the sample data uses Polish names.
function asGender(value: unknown): Gender {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (['M', 'MALE', 'MAN'].includes(normalized)) return 'M';
  if (['F', 'FEMALE', 'WOMAN', 'K'].includes(normalized)) return 'F';
  return 'U';
}

function extractArray(data: unknown): unknown[] | undefined {
  if (Array.isArray(data)) return data;
  if (isRecord(data) && Array.isArray(data.people)) return data.people;
  return undefined;
}

export function parseFamilyData(data: unknown): ParseResult {
  const records = extractArray(data);
  if (!records) return { ok: false, error: 'Oczekiwano listy osób.' };
  if (records.length === 0) return { ok: false, error: 'Brak osób.' };

  const warnings: string[] = [];
  const people: Person[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let duplicates = 0;

  for (const record of records) {
    if (!isRecord(record)) { skipped++; continue; }
    const id = asId(record.id);
    if (!id) { skipped++; continue; }
    if (seen.has(id)) { duplicates++; continue; }
    seen.add(id);
    people.push({ id, name: asText(record.name) ?? `Unnamed (${id})`, birthDate: asText(record.birthDate), deathDate: asText(record.deathDate), birthPlace: asText(record.birthPlace), deathPlace: asText(record.deathPlace), graveId: asText(record.graveId), gender: asGender(record.gender), parents: asIdList(record.parents), children: asIdList(record.children), spouses: asIdList(record.spouses), biography: asText(record.biography), givenNames: typeof record.givenNames === 'string' ? record.givenNames.trim() : undefined, birthSurname: typeof record.birthSurname === 'string' ? record.birthSurname.trim() : undefined, marriedSurname: typeof record.marriedSurname === 'string' ? record.marriedSurname.trim() : undefined });
  }

  if (people.length === 0) return { ok: false, error: 'Nie znaleziono poprawnych osób. Każdy wpis musi mieć co najmniej "id".' };
  if (skipped) warnings.push(`Pominięto wpisy bez poprawnego id: ${skipped}.`);
  if (duplicates) warnings.push(`Zignorowano powtórzone id: ${duplicates} (zachowano pierwsze wystąpienie).`);

  const { people: linked, danglingReferences } = linkRelationships(people);
  if (danglingReferences) warnings.push(`Usunięto odwołania do osób, których nie ma w danych: ${danglingReferences}.`);

  return { ok: true, people: linked, warnings };
}


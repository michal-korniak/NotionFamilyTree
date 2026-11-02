import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { Gender, GraveDetails, PeopleById, Person } from '../types/person';
import type { PersonDetails } from '../lib/treeEdits';
import { isValidDateText, parseYear } from '../lib/dates';
import { composeName, displayName, nameParts } from '../lib/names';
import { GRAVES, PEOPLE } from '../lib/notion/notionMapping';
import { buriedIn, cemeteryGroups, closenessTo, graveTitle, newGraveId } from '../lib/graves';
import { PhotoGallery } from './PhotoGallery';
import { usePhotoDraft } from '../hooks/usePhotoQueue';
import { focusOnOpen, useOpenForm } from '../hooks/useOpenForm';
import { CemeteryInput } from './CemeteryInput';

interface PersonFormProps {
  person: Person;
  // A person being added must get a gender (Mężczyzna or Kobieta) before saving; existing records may stay "Nieznana".
  isNew?: boolean;
  // The grave is saved with the person: it is shared, so its details change for everyone buried in it.
  onSave: (details: PersonDetails, grave?: { id: string; details: GraveDetails }) => void;
  onCancel: () => void;
  // undefined: the tree is not linked to Notion, so there is nowhere to keep photos.
  notionPageId?: string | null;
  people: PeopleById;
  graves: Record<string, GraveDetails>;
  // False for a Notion tree whose Osoby has no "Grób" relation yet.
  gravesEnabled: boolean;
}

type FormValues = Record<'givenNames' | 'birthSurname' | 'marriedSurname' | 'birthDate' | 'deathDate' | 'birthPlace' | 'deathPlace' | 'biography', string> & { gender: Gender | null };

type GraveValues = Record<keyof GraveDetails, string>;

const NEW_GRAVE = '__new';

type FormErrors = Partial<Record<keyof FormValues, string>>;

const inputClass = 'w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 aria-invalid:border-red-400 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-zinc-600 dark:focus:ring-zinc-800';

function toValues(person: Person, isNew: boolean): FormValues {
  return { ...nameParts(person), gender: isNew && person.gender === 'U' ? null : person.gender, birthDate: person.birthDate ?? '', deathDate: person.deathDate ?? '', birthPlace: person.birthPlace ?? '', deathPlace: person.deathPlace ?? '', biography: person.biography ?? '' };
}

function toGraveValues(grave: GraveDetails | undefined): GraveValues {
  return { name: grave?.name ?? '', cemetery: grave?.cemetery ?? '', info: grave?.info ?? '' };
}

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  if (!values.givenNames.trim() && !values.birthSurname.trim() && !values.marriedSurname.trim()) errors.givenNames = 'Podaj imię albo nazwisko.';
  if (!values.gender) errors.gender = 'Wybierz płeć.';
  for (const field of ['birthDate', 'deathDate'] as const) {
    if (values[field].trim() && !isValidDateText(values[field])) errors[field] = 'Podaj rok, np. 1905, 1905-04-12 albo ok. 1820.';
  }
  const birth = parseYear(values.birthDate);
  const death = parseYear(values.deathDate);
  if (!errors.deathDate && birth !== undefined && death !== undefined && death < birth) errors.deathDate = 'Data śmierci nie może być wcześniejsza niż urodzenia.';
  return errors;
}

function optional(value: string): string | undefined {
  return value.trim() || undefined;
}

function Field({ label, hint, error, children, className = '' }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block truncate text-[11px] font-medium tracking-wider text-zinc-500 uppercase">{label}{hint && <span className="ml-1 font-normal tracking-normal text-zinc-400 normal-case">{hint}</span>}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{error}</span>}
    </label>
  );
}

// Not a <label> like Field: a label would forward every click inside it to the gallery's hidden file input.
function PhotoField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium tracking-wider text-zinc-500 uppercase">{label}</span>
      {children}
    </div>
  );
}

export function PersonForm({ person, isNew = false, onSave, onCancel, notionPageId, people, graves, gravesEnabled }: PersonFormProps) {
  const [values, setValues] = useState(() => toValues(person, isNew));
  const [errors, setErrors] = useState<FormErrors>({});
  const fullName = composeName(values);
  const [graveId, setGraveId] = useState(person.graveId && graves[person.graveId] ? person.graveId : '');
  const [graveValues, setGraveValues] = useState(() => toGraveValues(person.graveId ? graves[person.graveId] : undefined));
  const isNewGrave = graveId !== '' && !graves[graveId];
  const photoOwners = graveId ? [person.id, graveId] : [person.id];
  const photoDraft = usePhotoDraft(photoOwners);
  const buriedWith = useMemo(() => (graveId ? buriedIn(people, graveId).filter((other) => other.id !== person.id) : []), [people, graveId, person.id]);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const setGrave = (key: keyof GraveValues, value: string) => setGraveValues((v) => ({ ...v, [key]: value }));
  const chooseGrave = (value: string) => {
    const id = value === NEW_GRAVE ? newGraveId(graves) : value;
    setGraveId(id);
    setGraveValues(toGraveValues(graves[id]));
  };

  const [initial] = useState(() => JSON.stringify({ values, graveId, graveValues }));
  useOpenForm({ isDirty: () => isNew || photoDraft.hasChanges() || JSON.stringify({ values, graveId, graveValues }) !== initial, save: () => submit(), discard: onCancel });

  const submit = (event?: FormEvent): boolean => {
    event?.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length) return false;
    const details: PersonDetails = { name: fullName, givenNames: values.givenNames.trim(), birthSurname: values.birthSurname.trim(), marriedSurname: values.marriedSurname.trim(), gender: values.gender ?? 'U', birthDate: optional(values.birthDate), deathDate: optional(values.deathDate), birthPlace: optional(values.birthPlace), deathPlace: optional(values.deathPlace), graveId: graveId || undefined, biography: optional(values.biography) };
    const grave = graveId ? { id: graveId, details: { name: graveTitle(undefined, [...buriedWith, { ...person, ...details }]), cemetery: optional(graveValues.cemetery), info: optional(graveValues.info) } } : undefined;
    photoDraft.keep(photoOwners);
    onSave(details, grave);
    return true;
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit();
    else if (event.key === 'Escape') { event.stopPropagation(); onCancel(); }
  };

  return (
    <form onSubmit={submit} onKeyDown={handleKeyDown} className="space-y-4" noValidate>
      <Field label="Imiona" error={errors.givenNames}>
        <input autoFocus={focusOnOpen()} value={values.givenNames} onChange={(e) => set('givenNames', e.target.value)} aria-invalid={Boolean(errors.givenNames)} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nazwisko">
          <input value={values.marriedSurname} onChange={(e) => set('marriedSurname', e.target.value)} className={inputClass} />
        </Field>
        <Field label="Nazwisko rodowe">
          <input value={values.birthSurname} onChange={(e) => set('birthSurname', e.target.value)} className={inputClass} />
        </Field>
      </div>
      {fullName && <p className="-mt-1 text-xs text-zinc-500">W Notion jako: <span className="font-medium text-zinc-700 dark:text-zinc-300">{fullName}</span></p>}
      <Field label="Płeć" error={errors.gender}>
        <div className={`grid ${isNew ? 'grid-cols-2' : 'grid-cols-3'} gap-1 rounded-md border p-0.5 ${errors.gender ? 'border-red-400' : 'border-zinc-200 dark:border-zinc-800'}`}>
          {(isNew ? (['M', 'F'] as const) : (['M', 'F', 'U'] as const)).map((g) => (
            <button key={g} type="button" onClick={() => set('gender', g)} className={`rounded px-2 py-1 text-xs font-medium transition-colors ${values.gender === g ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>{g === 'M' ? 'Mężczyzna' : g === 'F' ? 'Kobieta' : 'Nieznana'}</button>
          ))}
        </div>
      </Field>
      {notionPageId !== undefined && <PhotoField label="Zdjęcia"><PhotoGallery personId={person.id} property={PEOPLE.photos} addLabel="Dodaj zdjęcie" /></PhotoField>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data urodzenia" error={errors.birthDate}>
          <input value={values.birthDate} onChange={(e) => set('birthDate', e.target.value)} placeholder="1905-04-12" aria-invalid={Boolean(errors.birthDate)} className={`${inputClass} font-mono`} />
        </Field>
        <Field label="Miejsce urodzenia">
          <input value={values.birthPlace} onChange={(e) => set('birthPlace', e.target.value)} className={inputClass} />
        </Field>
        <Field label="Data śmierci" error={errors.deathDate}>
          <input value={values.deathDate} onChange={(e) => set('deathDate', e.target.value)} aria-invalid={Boolean(errors.deathDate)} className={`${inputClass} font-mono`} />
        </Field>
        <Field label="Miejsce śmierci">
          <input value={values.deathPlace} onChange={(e) => set('deathPlace', e.target.value)} className={inputClass} />
        </Field>
      </div>
      {gravesEnabled && <GraveField person={person} people={people} graves={graves} graveId={graveId} isNewGrave={isNewGrave} values={graveValues} buriedWith={buriedWith} withPhotos={notionPageId !== undefined} onChoose={chooseGrave} onChange={setGrave} />}
      <Field label="Biografia">
        <textarea value={values.biography} onChange={(e) => set('biography', e.target.value)} rows={6} className={`${inputClass} resize-y leading-relaxed`} />
      </Field>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="h-8 rounded-md px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900">Anuluj</button>
        <button type="submit" className="h-8 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">Zapisz</button>
      </div>
    </form>
  );
}

function GraveField({ person, people, graves, graveId, isNewGrave, values, buriedWith, withPhotos, onChoose, onChange }: { person: Person; people: PeopleById; graves: Record<string, GraveDetails>; graveId: string; isNewGrave: boolean; values: GraveValues; buriedWith: Person[]; withPhotos: boolean; onChoose: (value: string) => void; onChange: (key: keyof GraveValues, value: string) => void }) {
  // Ranked by kinship to the person being edited: they are most often buried with a spouse, parent or child.
  const groups = useMemo(() => cemeteryGroups(people, graves, closenessTo(people, person.id)), [people, graves, person.id]);
  const label = (id: string, grave: GraveDetails) => graveTitle(grave, buriedIn(people, id));
  return (
    <fieldset className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <Field label="Grób">
        <select value={isNewGrave ? NEW_GRAVE : graveId} onChange={(e) => onChoose(e.target.value)} className={inputClass}>
          <option value="">— brak —</option>
          {groups.map((group) => <optgroup key={group.cemetery} label={group.cemetery}>{group.graves.map(({ id, grave }) => <option key={id} value={id}>{label(id, grave)}</option>)}</optgroup>)}
          <option value={NEW_GRAVE}>+ Nowy grób…</option>
        </select>
      </Field>
      {graveId && (
        <>
          {buriedWith.length > 0 && <p className="-mt-1 text-xs text-zinc-500">Wspólny z: <span className="font-medium text-zinc-700 dark:text-zinc-300">{buriedWith.map(displayName).join(', ')}</span>. Zmiany poniżej dotyczą wszystkich pochowanych w tym grobie.</p>}
          <Field label="Cmentarz">
            <CemeteryInput value={values.cemetery} onChange={(value) => onChange('cemetery', value)} graves={graves} className={inputClass} />
          </Field>
          <Field label="Informacje">
            <textarea value={values.info} onChange={(e) => onChange('info', e.target.value)} rows={3} className={`${inputClass} resize-y leading-relaxed`} />
          </Field>
          {withPhotos && <PhotoField label="Zdjęcie nagrobka"><PhotoGallery personId={graveId} property={GRAVES.photos} addLabel="Dodaj zdjęcie nagrobka" /></PhotoField>}
        </>
      )}
    </fieldset>
  );
}

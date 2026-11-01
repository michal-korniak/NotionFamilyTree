import { useState, type FormEvent, type ReactNode } from 'react';
import type { Gender, Person } from '../types/person';
import type { PersonDetails } from '../lib/treeEdits';
import { isValidDateText, parseYear } from '../lib/dates';
import { composeName, nameParts } from '../lib/names';

interface PersonFormProps {
  person: Person;
  // A person being added must get a gender (Mężczyzna or Kobieta) before saving; existing records may stay "Nieznana".
  isNew?: boolean;
  onSave: (details: PersonDetails) => void;
  onCancel: () => void;
}

type FormValues = Record<'givenNames' | 'birthSurname' | 'marriedSurname' | 'birthDate' | 'deathDate' | 'birthPlace' | 'deathPlace' | 'biography', string> & { gender: Gender | null };

type FormErrors = Partial<Record<keyof FormValues, string>>;

const inputClass = 'w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 aria-invalid:border-red-400 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-zinc-600 dark:focus:ring-zinc-800';

function toValues(person: Person, isNew: boolean): FormValues {
  return { ...nameParts(person), gender: isNew && person.gender === 'U' ? null : person.gender, birthDate: person.birthDate ?? '', deathDate: person.deathDate ?? '', birthPlace: person.birthPlace ?? '', deathPlace: person.deathPlace ?? '', biography: person.biography ?? '' };
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

export function PersonForm({ person, isNew = false, onSave, onCancel }: PersonFormProps) {
  const [values, setValues] = useState(() => toValues(person, isNew));
  const [errors, setErrors] = useState<FormErrors>({});
  const fullName = composeName(values);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    onSave({ name: fullName, givenNames: values.givenNames.trim(), birthSurname: values.birthSurname.trim(), marriedSurname: values.marriedSurname.trim(), gender: values.gender ?? 'U', birthDate: optional(values.birthDate), deathDate: optional(values.deathDate), birthPlace: optional(values.birthPlace), deathPlace: optional(values.deathPlace), biography: optional(values.biography) });
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit();
    else if (event.key === 'Escape') { event.stopPropagation(); onCancel(); }
  };

  return (
    <form onSubmit={submit} onKeyDown={handleKeyDown} className="space-y-4" noValidate>
      <Field label="Imiona" error={errors.givenNames}>
        <input autoFocus value={values.givenNames} onChange={(e) => set('givenNames', e.target.value)} aria-invalid={Boolean(errors.givenNames)} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nazwisko rodowe">
          <input value={values.birthSurname} onChange={(e) => set('birthSurname', e.target.value)} className={inputClass} />
        </Field>
        <Field label="Nazwisko po ślubie">
          <input value={values.marriedSurname} onChange={(e) => set('marriedSurname', e.target.value)} placeholder="jeśli inne niż rodowe" className={inputClass} />
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data urodzenia" error={errors.birthDate}>
          <input value={values.birthDate} onChange={(e) => set('birthDate', e.target.value)} placeholder="1905-04-12" aria-invalid={Boolean(errors.birthDate)} className={`${inputClass} font-mono`} />
        </Field>
        <Field label="Miejsce urodzenia">
          <input value={values.birthPlace} onChange={(e) => set('birthPlace', e.target.value)} className={inputClass} />
        </Field>
        <Field label="Data śmierci" error={errors.deathDate}>
          <input value={values.deathDate} onChange={(e) => set('deathDate', e.target.value)} placeholder="puste, jeśli żyje" aria-invalid={Boolean(errors.deathDate)} className={`${inputClass} font-mono`} />
        </Field>
        <Field label="Miejsce śmierci">
          <input value={values.deathPlace} onChange={(e) => set('deathPlace', e.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="Biografia">
        <textarea value={values.biography} onChange={(e) => set('biography', e.target.value)} rows={6} className={`${inputClass} resize-y leading-relaxed`} />
      </Field>
      <div className="flex items-center justify-end gap-2 pt-1">
        <span className="mr-auto hidden font-mono text-[10px] text-zinc-400 sm:block">Ctrl+Enter, aby zapisać</span>
        <button type="button" onClick={onCancel} className="h-8 rounded-md px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900">Anuluj</button>
        <button type="submit" className="h-8 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">Zapisz</button>
      </div>
    </form>
  );
}

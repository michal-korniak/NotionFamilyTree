import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Church, Combine, Pencil, Search, Trash2, X } from 'lucide-react';
import type { GraveDetails, PeopleById, Person } from '../types/person';
import { buriedIn, cemeteryGroups, closenessTo, graveTitle } from '../lib/graves';
import { formatLifeYears, isDeceased } from '../lib/dates';
import { displayName } from '../lib/names';
import { countOf } from '../lib/plural';
import { GRAVES } from '../lib/notion/notionMapping';
import { usePhotoDraft, usePhotosContext } from '../hooks/usePhotoQueue';
import { Avatar } from './Avatar';
import { PhotoGallery } from './PhotoGallery';
import { ConfirmDialog } from './ConfirmDialog';
import { CemeteryInput } from './CemeteryInput';
import { LinkedText } from './LinkedText';

interface CemeteriesDialogProps {
  people: PeopleById;
  graves: Record<string, GraveDetails>;
  // Cemeteries and graves are ranked by kinship to this person: the user's own family first.
  meId: string | null;
  // False for a tree without Notion: there is nowhere to keep photos.
  withPhotos: boolean;
  onSelectPerson: (id: string) => void;
  onSaveGrave: (id: string, details: GraveDetails) => void;
  // Everyone in the merged graves moves to the kept one, which takes the given details; the others are removed.
  onMerge: (keepId: string, mergedIds: string[], details: GraveDetails) => void;
  // People buried in a removed grave are left without one.
  onRemoveGrave: (id: string) => void;
  onClose: () => void;
}

type GraveValues = Record<keyof GraveDetails, string>;

const normalize = (text: string) => text.toLocaleLowerCase('pl').normalize('NFD').replace(/\p{Diacritic}/gu, '');
const optional = (value: string) => value.trim() || undefined;
const toValues = (grave: GraveDetails | undefined): GraveValues => ({ name: grave?.name ?? '', cemetery: grave?.cemetery ?? '', info: grave?.info ?? '' });
const toDetails = (values: GraveValues): GraveDetails => ({ name: optional(values.name), cemetery: optional(values.cemetery), info: optional(values.info) });

const inputClass = 'w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-zinc-600 dark:focus:ring-zinc-800';
const primaryButton = 'h-8 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300';
const secondaryButton = 'h-8 rounded-md px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-wider text-zinc-500 uppercase">{label}</span>
      {children}
    </label>
  );
}

function GraveFields({ values, graves, onChange }: { values: GraveValues; graves: Record<string, GraveDetails>; onChange: (values: GraveValues) => void }) {
  const set = (key: keyof GraveValues) => (event: { target: { value: string } }) => onChange({ ...values, [key]: event.target.value });
  return (
    <div className="space-y-2.5">
      <Field label="Cmentarz"><CemeteryInput value={values.cemetery} onChange={(cemetery) => onChange({ ...values, cemetery })} graves={graves} className={inputClass} /></Field>
      <Field label="Informacje"><textarea value={values.info} onChange={set('info')} rows={3} className={`${inputClass} resize-y leading-relaxed`} /></Field>
    </div>
  );
}

function BuriedList({ buried, onSelectPerson }: { buried: Person[]; onSelectPerson?: (id: string) => void }) {
  if (!buried.length) return <p className="mt-1 text-[11px] text-zinc-400">Nikt nie jest tu przypisany.</p>;
  return (
    <ul className="mt-1.5 space-y-0.5">
      {buried.map((person) => {
        const content = (
          <>
            <Avatar name={displayName(person)} gender={person.gender} size="sm" deceased={isDeceased(person)} />
            <span className="min-w-0 flex-1 truncate text-sm">{displayName(person)}</span>
            <span className="font-mono text-[11px] text-zinc-500">{formatLifeYears(person)}</span>
          </>
        );
        return (
          <li key={person.id}>
            {onSelectPerson ? <button type="button" onClick={() => onSelectPerson(person.id)} className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800">{content}</button> : <div className="flex items-center gap-2 py-1">{content}</div>}
          </li>
        );
      })}
    </ul>
  );
}

function GraveEditor({ id, values, graves, withPhotos, shared, onChange, onCancel, onSave }: { id: string; values: GraveValues; graves: Record<string, GraveDetails>; withPhotos: boolean; shared: boolean; onChange: (values: GraveValues) => void; onCancel: () => void; onSave: () => void }) {
  const photoDraft = usePhotoDraft([id]);
  return (
    <li className="space-y-3 rounded-lg border border-zinc-300 px-3 py-3 dark:border-zinc-700">
      <GraveFields values={values} graves={graves} onChange={onChange} />
      {withPhotos && <div><span className="mb-1 block text-[11px] font-medium tracking-wider text-zinc-500 uppercase">Zdjęcie nagrobka</span><PhotoGallery personId={id} property={GRAVES.photos} addLabel="Dodaj zdjęcie nagrobka" /></div>}
      {shared && <p className="text-xs text-zinc-500">Zmiany dotyczą wszystkich pochowanych w tym grobie.</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={secondaryButton}>Anuluj</button>
        <button type="button" onClick={() => { photoDraft.keep([id]); onSave(); }} className={primaryButton}>Zapisz</button>
      </div>
    </li>
  );
}

// Merging keeps one grave's cemetery as a starting point and joins the notes of all of them, so nothing typed is lost.
function MergePanel({ people, graves, ids, onMerge, onCancel }: { people: PeopleById; graves: Record<string, GraveDetails>; ids: string[]; onMerge: (keepId: string, details: GraveDetails) => void; onCancel: () => void }) {
  const { listing } = usePhotosContext();
  const [keepId, setKeepId] = useState(ids[0]!);
  const initialValues = (id: string) => ({ ...toValues(graves[id]), info: [...new Set([graves[id]?.info, ...ids.map((other) => graves[other]?.info)].map((info) => info?.trim()).filter(Boolean))].join('\n\n') });
  const [values, setValues] = useState(() => initialValues(ids[0]!));
  const buried = ids.flatMap((id) => buriedIn(people, id));
  const lostPhotos = ids.filter((id) => id !== keepId).reduce((sum, id) => sum + (listing[id]?.[GRAVES.photos]?.length ?? 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-[11px] font-medium tracking-wider text-zinc-500 uppercase">Zachowaj dane grobu</p>
        <div className="space-y-1">
          {ids.map((id) => (
            <label key={id} className="flex cursor-pointer items-start gap-2 rounded-md border border-zinc-200 px-2.5 py-2 text-sm has-checked:border-zinc-900 dark:border-zinc-800 dark:has-checked:border-zinc-300">
              <input type="radio" name="keep-grave" checked={keepId === id} onChange={() => { setKeepId(id); setValues(initialValues(id)); }} className="mt-1" />
              <span className="min-w-0">
                <span className="block font-medium">{graveTitle(graves[id], buriedIn(people, id))}</span>
                <span className="block text-xs text-zinc-500">{graves[id]?.cemetery || 'bez cmentarza'}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <GraveFields values={values} graves={graves} onChange={setValues} />
      <div>
        <p className="text-[11px] font-medium tracking-wider text-zinc-500 uppercase">Pochowani po połączeniu</p>
        <BuriedList buried={buried} />
      </div>
      {lostPhotos > 0 && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">Zdjęcia nagrobka z pozostałych grobów ({lostPhotos}) zostaną usunięte razem z nimi. Aby je zachować, wybierz grób ze zdjęciami.</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={secondaryButton}>Anuluj</button>
        <button type="button" onClick={() => onMerge(keepId, toDetails(values))} className={primaryButton}>Połącz</button>
      </div>
    </div>
  );
}

export function CemeteriesDialog({ people, graves, meId, withPhotos, onSelectPerson, onSaveGrave, onMerge, onRemoveGrave, onClose }: CemeteriesDialogProps) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ id: string; values: GraveValues } | null>(null);
  // null: not merging; otherwise the graves ticked so far.
  const [selecting, setSelecting] = useState<string[] | null>(null);
  const [merging, setMerging] = useState<string[] | null>(null);
  const [removing, setRemoving] = useState<{ id: string; title: string; buried: Person[] } | null>(null);
  const groups = useMemo(() => cemeteryGroups(people, graves, closenessTo(people, meId)), [people, graves, meId]);
  const shown = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return groups;
    return groups.flatMap((group) => {
      if (normalize(group.cemetery).includes(needle)) return [group];
      const matching = group.graves.filter(({ grave, buried }) => [graveTitle(grave, buried), ...buried.map(displayName)].some((text) => normalize(text).includes(needle)));
      return matching.length ? [{ ...group, graves: matching }] : [];
    });
  }, [groups, query]);
  const graveCount = Object.keys(graves).length;
  const { listing, queue } = usePhotosContext();
  const hasPhotos = (id: string) => withPhotos && (Boolean(listing[id]?.[GRAVES.photos]?.length) || queue.ops.some((op) => op.kind === 'add' && op.personId === id && op.property === GRAVES.photos));
  const buriedCount = groups.reduce((sum, group) => sum + group.buriedCount, 0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (removing) return;
      if (merging) setMerging(null); else if (editing) setEditing(null); else if (selecting) setSelecting(null); else onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, merging, editing, selecting, removing]);

  const toggle = (id: string) => setSelecting((ids) => (ids ? (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]) : ids));

  return (
    <div className="fixed inset-0 z-50 grid grid-cols-1 place-items-center bg-zinc-950/40 p-4 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="cemeteries-title" className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2.5 border-b border-zinc-200 px-5 py-3.5 dark:border-zinc-800">
          <Church className="size-5 text-zinc-500" />
          <div className="min-w-0 flex-1">
            <h2 id="cemeteries-title" className="text-sm font-semibold">{merging ? 'Połącz groby' : 'Groby'}</h2>
            <p className="text-xs text-zinc-500">{merging ? 'Wszyscy pochowani trafią do jednego grobu.' : `${countOf(groups.length, 'cmentarz', 'cmentarze', 'cmentarzy')} · ${countOf(graveCount, 'grób', 'groby', 'grobów')} · ${countOf(buriedCount, 'osoba', 'osoby', 'osób')}`}</p>
          </div>
          {!merging && graveCount > 1 && <button type="button" onClick={() => { setEditing(null); setSelecting((ids) => (ids ? null : [])); }} className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium ${selecting ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}><Combine className="size-3.5" />Połącz groby</button>}
          <button type="button" onClick={onClose} aria-label="Zamknij" className="grid size-7 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"><X className="size-4" /></button>
        </div>

        {merging ? (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <MergePanel people={people} graves={graves} ids={merging} onCancel={() => setMerging(null)} onMerge={(keepId, details) => { onMerge(keepId, merging.filter((id) => id !== keepId), details); setMerging(null); setSelecting(null); }} />
          </div>
        ) : (
          <>
            {graveCount > 0 && (
              <div className="border-b border-zinc-200 p-2 dark:border-zinc-800">
                {selecting && <p className="px-1 pb-2 text-xs text-zinc-500">Zaznacz groby, które są w rzeczywistości jednym grobem.</p>}
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-400" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Szukaj cmentarza lub osoby…" aria-label="Szukaj cmentarza lub osoby" className="h-9 w-full rounded-md border border-zinc-200 bg-transparent pr-2 pl-8 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700" />
                </div>
              </div>
            )}

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {graveCount === 0 && <p className="py-6 text-center text-sm text-zinc-500">Nie ma jeszcze żadnych grobów. Dodasz je w edycji osoby, w sekcji „Grób”.</p>}
              {graveCount > 0 && shown.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">Nic nie znaleziono.</p>}
              {shown.map((group) => (
                <section key={group.cemetery}>
                  <h3 className="mb-1.5 flex items-baseline gap-2 text-sm font-semibold">
                    <span className="min-w-0 flex-1 break-words">{group.cemetery}</span>
                    <span className="shrink-0 text-[11px] font-normal text-zinc-500">{countOf(group.buriedCount, 'osoba', 'osoby', 'osób')}</span>
                  </h3>
                  <ul className="space-y-2">
                    {group.graves.map(({ id, grave, buried }) => {
                      const title = graveTitle(grave, buried);
                      const selected = selecting?.includes(id) ?? false;
                      if (editing?.id === id) return <GraveEditor key={id} id={id} values={editing.values} graves={graves} withPhotos={withPhotos} shared={buried.length > 1} onChange={(values) => setEditing({ id, values })} onCancel={() => setEditing(null)} onSave={() => { onSaveGrave(id, { ...toDetails(editing.values), name: graveTitle(grave, buried) }); setEditing(null); }} />;
                      return (
                        <li key={id} className={`rounded-lg border px-3 py-2 ${selected ? 'border-zinc-900 bg-zinc-50 dark:border-zinc-300 dark:bg-zinc-800/50' : 'border-zinc-200 dark:border-zinc-800'}`}>
                          <div className="flex items-start gap-2">
                            {selecting && <input type="checkbox" checked={selected} onChange={() => toggle(id)} aria-label={`Zaznacz grób: ${title}`} className="mt-0.5 size-4" />}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{title}</p>
                            </div>
                            {!selecting && <button type="button" onClick={() => setEditing({ id, values: toValues(grave) })} aria-label={`Edytuj grób: ${title}`} title="Edytuj grób" className="grid size-6 shrink-0 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"><Pencil className="size-3.5" /></button>}
                            {!selecting && <button type="button" onClick={() => (buried.length ? setRemoving({ id, title, buried }) : onRemoveGrave(id))} aria-label={`Usuń grób: ${title}`} title="Usuń grób" className="grid size-6 shrink-0 place-items-center rounded text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"><Trash2 className="size-3.5" /></button>}
                          </div>
                          {grave.info && <p className="mt-1 text-xs leading-relaxed whitespace-pre-wrap text-zinc-600 dark:text-zinc-400"><LinkedText text={grave.info} /></p>}
                          {hasPhotos(id) && <div className="mt-2"><PhotoGallery personId={id} property={GRAVES.photos} /></div>}
                          <BuriedList buried={buried} onSelectPerson={selecting ? undefined : onSelectPerson} />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>

            {selecting && (
              <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
                <button type="button" onClick={() => setSelecting(null)} className={secondaryButton}>Anuluj</button>
                <button type="button" disabled={selecting.length < 2} onClick={() => setMerging(selecting)} className={primaryButton}>Połącz zaznaczone ({selecting.length})</button>
              </div>
            )}
          </>
        )}
      </div>
      {removing && (
        <ConfirmDialog title={`Usunąć grób: ${removing.title}?`} confirmLabel="Usuń grób" danger onConfirm={() => { onRemoveGrave(removing.id); setRemoving(null); }} onCancel={() => setRemoving(null)}>
          <p>{removing.buried.map(displayName).join(', ')} {removing.buried.length === 1 ? 'nie będzie mieć' : 'nie będą mieć'} przypisanego grobu. Zdjęcia nagrobka zostaną usunięte razem z grobem po użyciu „Zapisz zmiany”.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

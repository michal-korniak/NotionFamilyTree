import { useState } from 'react';
import { daysInMonth, formatPartialDate, MONTH_NAMES, parsePartialDate, type DateQualifier } from '../lib/dates';

interface DateFieldProps {
  value: string;
  // error is set while the parts do not make a date yet; value is then not worth saving.
  onChange: (value: string, error: string | null) => void;
  invalid?: boolean;
}

interface Parts {
  qualifier: DateQualifier;
  day: string;
  month: string;
  year: string;
}

const qualifierLabels: Record<DateQualifier, string> = { exact: '—', about: 'około', before: 'przed', after: 'po' };

const fieldClass = 'rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none transition-colors focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-zinc-600 dark:focus:ring-zinc-800 dark:disabled:bg-zinc-950';

function partsOf(value: string): { parts: Parts; unreadable: string | null } {
  const empty: Parts = { qualifier: 'exact', day: '', month: '', year: '' };
  if (!value.trim()) return { parts: empty, unreadable: null };
  const date = parsePartialDate(value);
  if (!date) return { parts: empty, unreadable: value.trim() };
  return { parts: { qualifier: date.qualifier, day: date.day ? String(date.day) : '', month: date.month ? String(date.month) : '', year: String(date.year) }, unreadable: null };
}

interface Checked {
  value: string;
  error: string | null;
  part?: 'day' | 'year';
}

function valueOf({ qualifier, day, month, year }: Parts): Checked {
  if (!year.trim()) return { value: '', error: null };
  if (!/^\d{3,4}$/.test(year.trim())) return { value: year.trim(), error: 'Rok to 3–4 cyfry, np. 1905.', part: 'year' };
  if (Number(year) > new Date().getFullYear()) return { value: year.trim(), error: 'Ten rok jeszcze nie nastąpił.', part: 'year' };
  const y = Number(year);
  const m = month ? Number(month) : undefined;
  const d = m && day.trim() ? Number(day) : undefined;
  if (m && day.trim() && (!/^\d{1,2}$/.test(day.trim()) || d! < 1 || d! > daysInMonth(y, m))) return { value: '', error: `${MONTH_NAMES[m - 1]!.charAt(0).toUpperCase()}${MONTH_NAMES[m - 1]!.slice(1)} ${y} ma dni od 1 do ${daysInMonth(y, m)}.`, part: 'day' };
  return { value: formatPartialDate({ qualifier, year: y, month: m, day: d }), error: null };
}

// Day, month and year, each optional from the left (a day needs a month, a month a year), plus how sure the date is.
export function DateField({ value, onChange, invalid = false }: DateFieldProps) {
  const [{ parts: initialParts, unreadable }] = useState(() => partsOf(value));
  const [parts, setParts] = useState(initialParts);
  const [keepUnreadable, setKeepUnreadable] = useState(unreadable !== null);
  // A half-typed year ("19") is not an error yet; it becomes one when the year field is left, or when the form is saved.
  const [yearLeft, setYearLeft] = useState(false);
  const checked = valueOf(parts);
  const shownError = checked.part === 'day' || ((yearLeft || invalid) && checked.error) ? checked.error : null;

  const update = (change: Partial<Parts>) => {
    const next = { ...parts, ...change };
    if (!next.year.trim()) next.month = '';
    if (!next.month) next.day = '';
    setParts(next);
    setKeepUnreadable(false);
    const { value: text, error } = valueOf(next);
    onChange(text, error);
  };

  const hasYear = /^\d{3,4}$/.test(parts.year.trim());
  const errorOn = (part: 'day' | 'year') => (shownError && checked.part === part ? 'border-red-400! focus:ring-red-100! dark:focus:ring-red-950!' : '');
  return (
    <div>
      {keepUnreadable && unreadable && (
        <div className="mb-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
          Zapisane jako „{unreadable}” — aplikacja nie umie odczytać tej daty. Zostaje bez zmian, dopóki nie wpiszesz jej poniżej.
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <select value={parts.qualifier} onChange={(e) => update({ qualifier: e.target.value as DateQualifier })} aria-label="Pewność daty" className={`${fieldClass} w-auto min-w-[4.75rem] shrink-0 pr-2 ${parts.qualifier === 'exact' ? 'text-zinc-400 dark:text-zinc-500' : ''}`}>
          {(Object.keys(qualifierLabels) as DateQualifier[]).map((q) => <option key={q} value={q} className="text-zinc-900 dark:text-zinc-100">{qualifierLabels[q]}</option>)}
        </select>
        <input value={parts.day} onChange={(e) => update({ day: e.target.value.replace(/\D/g, '').slice(0, 2) })} disabled={!parts.month} inputMode="numeric" placeholder="dzień" aria-label="Dzień" aria-invalid={Boolean(errorOn('day'))} className={`${fieldClass} ${errorOn('day')} w-0 min-w-12 flex-[2] text-center`} />
        <select value={parts.month} onChange={(e) => update({ month: e.target.value })} disabled={!hasYear} aria-label="Miesiąc" className={`${fieldClass} w-0 min-w-0 flex-[4]`}>
          <option value="">miesiąc</option>
          {MONTH_NAMES.map((name, index) => <option key={name} value={String(index + 1)}>{name}</option>)}
        </select>
        <input value={parts.year} onChange={(e) => update({ year: e.target.value.replace(/\D/g, '').slice(0, 4) })} onBlur={() => setYearLeft(true)} aria-invalid={Boolean(errorOn('year'))} inputMode="numeric" placeholder="rok" aria-label="Rok" className={`${fieldClass} ${errorOn('year')} w-0 min-w-16 flex-[3] text-center`} />
      </div>
      {shownError && <span role="alert" className="mt-1 block text-xs text-red-600 dark:text-red-400">{shownError}</span>}
    </div>
  );
}

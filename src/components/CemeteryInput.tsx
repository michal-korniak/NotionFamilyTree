import { useMemo, useState } from 'react';
import type { GraveDetails } from '../types/person';

const NEW_CEMETERY = '__new';

export function cemeteryNames(graves: Record<string, GraveDetails>): string[] {
  const collator = new Intl.Collator('pl');
  return [...new Set(Object.values(graves).map((grave) => grave.cemetery?.trim()).filter((name): name is string => Boolean(name)))].sort(collator.compare);
}

// Picking a cemetery from the list keeps one spelling per cemetery, so the Cmentarze view groups its graves together; a new one is typed in.
export function CemeteryInput({ value, onChange, graves, className }: { value: string; onChange: (value: string) => void; graves: Record<string, GraveDetails>; className: string }) {
  const names = useMemo(() => cemeteryNames(graves), [graves]);
  const [typing, setTyping] = useState(() => value.trim() !== '' && !names.includes(value.trim()));

  if (typing) return (
    <div className="flex items-center gap-2">
      <input autoFocus value={value} onChange={(e) => onChange(e.target.value)} aria-label="Nowy cmentarz" className={className} />
      {names.length > 0 && <button type="button" onClick={() => { setTyping(false); onChange(names.includes(value.trim()) ? value.trim() : ''); }} className="shrink-0 text-xs font-medium whitespace-nowrap text-zinc-500 underline underline-offset-2 hover:text-zinc-800 dark:hover:text-zinc-200">z listy</button>}
    </div>
  );
  return (
    <select value={value.trim()} onChange={(e) => { if (e.target.value === NEW_CEMETERY) { setTyping(true); onChange(''); } else onChange(e.target.value); }} className={className}>
      <option value="">— brak —</option>
      {names.map((name) => <option key={name} value={name}>{name}</option>)}
      <option value={NEW_CEMETERY}>+ Nowy cmentarz…</option>
    </select>
  );
}

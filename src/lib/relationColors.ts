import type { Gender, PeopleById } from '../types/person';

export type Relation = 'parent' | 'child' | 'spouse';

// Full class strings are spelled out (not built from the colour name) so Tailwind's scanner can find them.
export const relationStyles: Record<Relation, { label: string; dot: string; node: string; badge: string; hex: string }> = {
  parent: { label: 'Rodzic', dot: 'bg-indigo-500', node: 'border-indigo-400 ring-2 ring-indigo-400/25 shadow-sm dark:border-indigo-400/70', badge: 'border-indigo-200 bg-indigo-100 text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-950 dark:text-indigo-300', hex: '#6366f1' },
  spouse: { label: 'Małżonek', dot: 'bg-amber-500', node: 'border-amber-400 ring-2 ring-amber-400/25 shadow-sm dark:border-amber-400/70', badge: 'border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-400/30 dark:bg-amber-950 dark:text-amber-300', hex: '#f59e0b' },
  child: { label: 'Dziecko', dot: 'bg-teal-500', node: 'border-teal-400 ring-2 ring-teal-400/25 shadow-sm dark:border-teal-400/70', badge: 'border-teal-200 bg-teal-100 text-teal-700 dark:border-teal-400/30 dark:bg-teal-950 dark:text-teal-300', hex: '#14b8a6' },
};

const genderedLabels: Record<Relation, Record<Gender, string>> = {
  parent: { M: 'Ojciec', F: 'Matka', U: 'Rodzic' },
  child: { M: 'Syn', F: 'Córka', U: 'Dziecko' },
  spouse: { M: 'Mąż', F: 'Żona', U: 'Małżonek' },
};

// Partners are named after the Notion union type in the partner's grammatical gender (Narzeczeństwo → Narzeczony/Narzeczona,
// Małżeństwo → Mąż/Żona); a union type not listed here is shown as recorded.
const partnerLabels: Record<string, Record<Gender, string>> = {
  'Narzeczeństwo': { M: 'Narzeczony', F: 'Narzeczona', U: 'Narzeczeństwo' },
  'Małżeństwo': { M: 'Mąż', F: 'Żona', U: 'Małżonek' },
  'Nieformalny': { M: 'Partner', F: 'Partnerka', U: 'Partner' },
};

export function relationLabel(relation: Relation, gender: Gender, unionKind?: string): string {
  if (relation === 'spouse' && unionKind && unionKind !== 'Nieznany') return partnerLabels[unionKind]?.[gender] ?? unionKind;
  return genderedLabels[relation][gender];
}

export function relationsTo(people: PeopleById, selectedId: string): Map<string, Relation> {
  const relations = new Map<string, Relation>();
  const selected = people.get(selectedId);
  if (!selected) return relations;
  selected.children.forEach((id) => relations.set(id, 'child'));
  selected.spouses.forEach((id) => relations.set(id, 'spouse'));
  selected.parents.forEach((id) => relations.set(id, 'parent'));
  return relations;
}

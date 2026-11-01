import type { Gender } from '../types/person';

const config: Record<Gender, { label: string; title: string; dot: string }> = {
  M: { label: 'M', title: 'Mężczyzna', dot: 'bg-sky-500' },
  F: { label: 'K', title: 'Kobieta', dot: 'bg-pink-500' },
  U: { label: '?', title: 'Płeć nieznana', dot: 'bg-zinc-400' },
};

export function GenderBadge({ gender, withTitle = false }: { gender: Gender; withTitle?: boolean }) {
  const { label, title, dot } = config[gender];
  return (
    <span title={title} className="inline-flex items-center gap-1 rounded border border-zinc-200 px-1.5 py-px font-mono text-[10px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
      <span className={`size-1.5 rounded-full ${dot}`} />
      {withTitle ? title : label}
    </span>
  );
}

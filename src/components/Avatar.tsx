import type { Gender } from '../types/person';

const sizeClasses = { sm: 'size-7 text-[10px]', md: 'size-10 text-xs', lg: 'size-16 text-lg' } as const;

const genderClasses: Record<Gender, string> = {
  M: 'bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30',
  F: 'bg-pink-100 text-pink-700 ring-pink-200 dark:bg-pink-500/15 dark:text-pink-300 dark:ring-pink-500/30',
  U: 'bg-zinc-100 text-zinc-600 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700',
};

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0]![0], parts[parts.length - 1]![0]] : [parts[0]?.[0]];
  return letters.join('').toUpperCase() || '?';
}

interface AvatarProps {
  name: string;
  gender: Gender;
  size?: keyof typeof sizeClasses;
  deceased?: boolean;
}

export function Avatar({ name, gender, size = 'md', deceased = false }: AvatarProps) {
  return (
    <div className={`relative grid shrink-0 place-items-center rounded-full font-semibold ring-1 ${sizeClasses[size]} ${genderClasses[gender]}`} aria-hidden>
      {initials(name)}
      {deceased && <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-white bg-zinc-400 dark:border-zinc-900 dark:bg-zinc-500" />}
    </div>
  );
}

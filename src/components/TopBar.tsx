import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FileJson, LogOut, Moon, MoreHorizontal, Network, RefreshCw, UserRound, Redo2, Sun, Undo2, UserPlus } from 'lucide-react';
import type { PeopleById, TreeStats } from '../types/person';
import type { Theme } from '../hooks/useTheme';
import { SearchBar } from './SearchBar';
import { StatsBar } from './StatsBar';
import { IconButton } from './IconButton';
import { NotionIcon } from './NotionIcon';
import { countOf } from '../lib/plural';

interface TopBarProps {
  people: PeopleById;
  stats: TreeStats;
  sourceName: string;
  theme: Theme;
  canUndo: boolean;
  canRedo: boolean;
  notionPending?: number;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenNotion: () => void;
  onToggleTheme: () => void;
  onSelect: (id: string) => void;
  onAddPerson: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onGoHome: () => void;
  onChangeMe: () => void;
}

const buttonClass = 'inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900';

export function TopBar({ people, stats, sourceName, theme, canUndo, canRedo, notionPending, refreshing, onRefresh, onOpenNotion, onGoHome, onChangeMe, onToggleTheme, onSelect, onAddPerson, onUndo, onRedo, onReset }: TopBarProps) {
  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white/80 px-3 backdrop-blur sm:gap-4 sm:px-4 dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="flex min-w-0 items-center gap-2">
        <button type="button" onClick={onGoHome} title="Przejdź do mojego drzewa" aria-label="Przejdź do mojego drzewa" className="grid size-7 shrink-0 place-items-center rounded-md bg-zinc-900 text-white transition-opacity hover:opacity-80 dark:bg-zinc-100 dark:text-zinc-900">
          <Network className="size-4" />
        </button>
        <div className="hidden min-w-0 md:block">
          <button type="button" onClick={onGoHome} title="Przejdź do mojego drzewa" className="block text-sm leading-tight font-semibold hover:underline hover:underline-offset-2">NotionFamilyTree</button>
          {notionPending === undefined && (
            <div className="flex items-center gap-1 truncate font-mono text-[11px] leading-tight text-zinc-500" title={sourceName}>
              <FileJson className="size-3 shrink-0" />
              <span className="max-w-40 truncate">{sourceName}</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 justify-center">
        <SearchBar people={people} onSelect={onSelect} />
      </div>
      <div className="hidden sm:block">
        <StatsBar stats={stats} />
      </div>
      <div className="flex items-center gap-1">
        <div className="hidden items-center sm:flex">
          <IconButton label="Cofnij (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}><Undo2 className="size-4" /></IconButton>
          <IconButton label="Ponów (Ctrl+Y)" onClick={onRedo} disabled={!canRedo}><Redo2 className="size-4" /></IconButton>
        </div>
        <IconButton label="Dodaj osobę" onClick={onAddPerson}><UserPlus className="size-4" /></IconButton>
        <div className="hidden items-center gap-1 sm:flex">
          <IconButton label={theme === 'dark' ? 'Tryb jasny' : 'Tryb ciemny'} onClick={onToggleTheme}>
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </IconButton>
          {notionPending !== undefined && (
            <IconButton label={refreshing ? 'Odświeżanie z Notion…' : 'Odśwież z Notion'} onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
            </IconButton>
          )}
        </div>
        {notionPending !== undefined && (
          <button type="button" onClick={onOpenNotion} className={`relative ${buttonClass}`} title={notionPending ? `Zapisz w Notion: ${countOf(notionPending, 'zmiana', 'zmiany', 'zmian')}` : 'Notion jest aktualny'}>
            <NotionIcon className="size-3.5" />
            <span className="hidden lg:inline">Zapisz zmiany</span>
            <span aria-label={`Niewysłane zmiany: ${notionPending}`} className={`grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[10px] leading-none font-semibold tabular-nums ${notionPending > 0 ? 'bg-amber-500 text-white' : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>{notionPending}</span>
          </button>
        )}
        <MoreMenu compactItems={[
          { label: 'Cofnij', icon: <Undo2 className="size-3.5" />, disabled: !canUndo, onSelect: onUndo },
          { label: 'Ponów', icon: <Redo2 className="size-3.5" />, disabled: !canRedo, onSelect: onRedo },
          ...(notionPending !== undefined ? [{ label: refreshing ? 'Odświeżanie z Notion…' : 'Odśwież z Notion', icon: <RefreshCw className="size-3.5" />, disabled: refreshing, onSelect: onRefresh }] : []),
          { label: theme === 'dark' ? 'Tryb jasny' : 'Tryb ciemny', icon: theme === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />, onSelect: onToggleTheme },
        ]} onChangeMe={onChangeMe} onClose={onReset} />
      </div>
    </header>
  );
}

// Close lives behind a menu so closing, which drops the local copy of the tree, is never a single stray click.
interface CompactMenuItem { label: string; icon: ReactNode; disabled?: boolean; onSelect: () => void }

// On narrow screens the top bar has no room for undo/redo, refresh and the theme switch, so they move into this menu.
function MoreMenu({ compactItems, onChangeMe, onClose }: { compactItems: CompactMenuItem[]; onChangeMe: () => void; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('pointerdown', onPointerDown); window.removeEventListener('keydown', onKeyDown); };
  }, [open]);

  const item = 'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors';
  const choose = (action: () => void) => () => { setOpen(false); action(); };
  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Więcej akcji" aria-expanded={open} title="Więcej akcji" className={`relative grid size-8 place-items-center rounded-md transition-colors ${open ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'}`}>
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-50 mt-1 w-64 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <div className="sm:hidden">
            {compactItems.map((entry) => (
              <button key={entry.label} type="button" role="menuitem" disabled={entry.disabled} onClick={choose(entry.onSelect)} className={`${item} text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-zinc-300 dark:hover:bg-zinc-800`}>
                {entry.icon}
                {entry.label}
              </button>
            ))}
            <div className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
          </div>
          <button type="button" role="menuitem" onClick={choose(onChangeMe)} className={`${item} text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800`}>
            <UserRound className="size-3.5" />
            Zmień, kim jestem…
          </button>
          <div className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
          <button type="button" role="menuitem" onClick={choose(onClose)} className={`${item} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40`}>
            <LogOut className="size-3.5" />
            Zamknij drzewo…
          </button>
        </div>
      )}
    </div>
  );
}

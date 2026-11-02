import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Church, Download, FileDown, FileJson, LogOut, Moon, MoreHorizontal, Network, RefreshCw, UserRound, Redo2, Sun, Undo2, UserPlus, X } from 'lucide-react';
import type { PeopleById, TreeStats } from '../types/person';
import type { Theme } from '../hooks/useTheme';
import { SearchBar } from './SearchBar';
import { StatsBar } from './StatsBar';
import { IconButton } from './IconButton';
import { NotionIcon } from './NotionIcon';
import { countOf } from '../lib/plural';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

interface TopBarProps {
  people: PeopleById;
  stats: TreeStats;
  sourceName: string;
  theme: Theme;
  canUndo: boolean;
  canRedo: boolean;
  notionPending?: number;
  // People or couples with unsaved changes that someone has also changed in Notion since the last sync.
  notionConflicts?: string[];
  refreshing: boolean;
  onRefresh: () => void;
  onOpenNotion: () => void;
  onToggleTheme: () => void;
  onSelect: (id: string) => void;
  onAddPerson: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  // Undefined while only "Moje drzewo" is open. On phones tabs have no right-click menu, so the more menu offers this instead.
  onCloseAllTabs?: () => void;
  onExportGedcom: () => void;
  onShowCemeteries: () => void;
  onGoHome: () => void;
  onChangeMe: () => void;
}


export function TopBar({ people, stats, sourceName, theme, canUndo, canRedo, notionPending, notionConflicts = [], refreshing, onRefresh, onOpenNotion, onGoHome, onChangeMe, onToggleTheme, onSelect, onAddPerson, onUndo, onRedo, onReset, onCloseAllTabs, onExportGedcom, onShowCemeteries }: TopBarProps) {
  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white/80 px-3 backdrop-blur sm:gap-4 sm:px-4 dark:border-zinc-800 dark:bg-zinc-950/80">
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
        <div className="hidden sm:block"><IconButton label="Dodaj osobę" onClick={onAddPerson}><UserPlus className="size-4" /></IconButton></div>
        <div className="hidden items-center gap-1 sm:flex">
          <IconButton label={theme === 'dark' ? 'Tryb jasny' : 'Tryb ciemny'} onClick={onToggleTheme}>
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </IconButton>
        </div>
        <div className="flex h-8 items-stretch rounded-md border border-zinc-200 sm:hidden dark:border-zinc-800">
          <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Cofnij" title="Cofnij" className="grid w-8 place-items-center rounded-l-md border-r border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:text-zinc-300 dark:border-zinc-800 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 dark:disabled:text-zinc-700"><Undo2 className="size-3.5" /></button>
          <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Ponów" title="Ponów" className="grid w-8 place-items-center rounded-r-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 dark:disabled:text-zinc-700"><Redo2 className="size-3.5" /></button>
        </div>
        {notionPending !== undefined && (
          <div className="flex h-8 items-stretch rounded-md border border-zinc-200 dark:border-zinc-800">
            <button type="button" onClick={onRefresh} disabled={refreshing} aria-label={refreshing ? 'Odświeżanie z Notion…' : 'Odśwież z Notion'} title={refreshing ? 'Odświeżanie z Notion…' : 'Odśwież z Notion'} className="grid w-8 place-items-center rounded-l-md border-r border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-default dark:border-zinc-800 dark:hover:bg-zinc-900 dark:hover:text-zinc-100">
              <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={onOpenNotion} className="relative inline-flex items-center gap-1.5 rounded-r-md px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900" title={notionConflicts.length ? `Ktoś zmienił w Notion: ${notionConflicts.join(', ')}. Zapis wczyta aktualne dane i odrzuci niezapisane zmiany.` : notionPending ? `Zapisz w Notion: ${countOf(notionPending, 'zmiana', 'zmiany', 'zmian')}` : 'Notion jest aktualny'}>
              <NotionIcon className="size-3.5" />
              <span className="hidden lg:inline">Zapisz zmiany</span>
              {notionConflicts.length > 0 && <span aria-label="Konflikt ze zmianami w Notion" className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-red-600 text-[10px] leading-none font-bold text-white ring-2 ring-white dark:ring-zinc-950">!</span>}
              <span aria-label={`Niewysłane zmiany: ${notionPending}`} className={`grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[10px] leading-none font-semibold tabular-nums ${notionPending > 0 ? 'bg-amber-500 text-white' : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>{notionPending}</span>
            </button>
          </div>
        )}
        <MoreMenu compactItems={[
          { label: 'Dodaj osobę', icon: <UserPlus className="size-3.5" />, onSelect: onAddPerson },
          { label: 'Zarządzaj grobami', icon: <Church className="size-3.5" />, onSelect: onShowCemeteries },
          'separator',
          { label: 'Zamknij wszystkie karty', icon: <X className="size-3.5" />, disabled: !onCloseAllTabs, onSelect: () => onCloseAllTabs?.() },
        ]} themeItem={{ label: theme === 'dark' ? 'Tryb jasny' : 'Tryb ciemny', icon: theme === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />, onSelect: onToggleTheme }} onChangeMe={onChangeMe} onShowCemeteries={onShowCemeteries} onExportGedcom={onExportGedcom} onClose={onReset} />
      </div>
    </header>
  );
}

// Close lives behind a menu so closing, which drops the local copy of the tree, is never a single stray click.
interface CompactMenuItem { label: string; icon: ReactNode; disabled?: boolean; onSelect: () => void }

// On narrow screens the top bar has no room for undo/redo, refresh and the theme switch, so they move into this menu.
function MoreMenu({ compactItems, themeItem, onChangeMe, onShowCemeteries, onExportGedcom, onClose }: { compactItems: (CompactMenuItem | 'separator')[]; themeItem: CompactMenuItem; onChangeMe: () => void; onShowCemeteries: () => void; onExportGedcom: () => void; onClose: () => void }) {
  const install = useInstallPrompt();
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
            {compactItems.map((entry, index) => entry === 'separator' ? <div key={`separator-${index}`} className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" /> : (
              <button key={entry.label} type="button" role="menuitem" disabled={entry.disabled} onClick={choose(entry.onSelect)} className={`${item} text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-zinc-300 dark:hover:bg-zinc-800`}>
                {entry.icon}
                {entry.label}
              </button>
            ))}
          </div>
          <button type="button" role="menuitem" onClick={choose(onShowCemeteries)} className={`${item} max-sm:hidden text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800`}>
            <Church className="size-3.5" />
            Zarządzaj grobami
          </button>
          <button type="button" role="menuitem" onClick={choose(onChangeMe)} className={`${item} text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800`}>
            <UserRound className="size-3.5" />
            Zmień użytkownika
          </button>
          <button type="button" role="menuitem" onClick={choose(themeItem.onSelect)} className={`${item} text-zinc-700 hover:bg-zinc-100 sm:hidden dark:text-zinc-300 dark:hover:bg-zinc-800`}>
            {themeItem.icon}
            {themeItem.label}
          </button>
          <div className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
          <button type="button" role="menuitem" onClick={choose(onExportGedcom)} title="Plik do programów genealogicznych (MyHeritage, Ancestry, Gramps)" className={`${item} max-sm:hidden text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800`}>
            <FileDown className="size-3.5" />
            Eksportuj GEDCOM
          </button>
          {install && (
            <button type="button" role="menuitem" onClick={choose(() => void install())} className={`${item} text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800`}>
              <Download className="size-3.5" />
              Zainstaluj aplikację
            </button>
          )}
          <div className={`my-1 h-px bg-zinc-100 dark:bg-zinc-800 ${install ? '' : 'max-sm:hidden'}`} />
          <button type="button" role="menuitem" onClick={choose(onClose)} className={`${item} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40`}>
            <LogOut className="size-3.5" />
            Zamknij drzewo…
          </button>
        </div>
      )}
    </div>
  );
}

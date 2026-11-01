import { Home, Link2, Users, X } from 'lucide-react';
import type { ReactNode } from 'react';

export interface TabInfo {
  id: string;
  label: string;
  icon: 'home' | 'family' | 'connection';
  closable: boolean;
}

interface TabBarProps {
  tabs: TabInfo[];
  activeId: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onMenu: (id: string, x: number, y: number) => void;
}

const icons: Record<TabInfo['icon'], ReactNode> = {
  home: <Home className="size-3.5" />,
  family: <Users className="size-3.5" />,
  connection: <Link2 className="size-3.5" />,
};

export function TabBar({ tabs, activeId, onActivate, onClose, onMenu }: TabBarProps) {
  return (
    <div role="tablist" aria-label="Otwarte drzewa" className="flex h-9 shrink-0 items-end gap-1 overflow-x-auto border-b border-zinc-200 bg-zinc-100/80 px-2 pt-1 dark:border-zinc-800 dark:bg-zinc-900/60">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div key={tab.id} onContextMenu={(e) => { e.preventDefault(); onMenu(tab.id, e.clientX, e.clientY); }} className={`group flex h-8 max-w-60 shrink-0 items-center rounded-t-lg border border-b-0 text-xs transition-colors ${active ? 'border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100' : 'border-transparent text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-800 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200'}`}>
            <button type="button" role="tab" aria-selected={active} onClick={() => onActivate(tab.id)} onAuxClick={(e) => { if (e.button === 1 && tab.closable) { e.preventDefault(); onClose(tab.id); } }} title={tab.label} className={`flex h-full min-w-0 items-center gap-1.5 pl-3 ${tab.closable ? 'pr-1' : 'pr-3'} ${active ? 'font-medium' : ''}`}>
              <span className="shrink-0 text-zinc-400">{icons[tab.icon]}</span>
              <span className="truncate">{tab.label}</span>
            </button>
            {tab.closable && (
              <button type="button" onClick={() => onClose(tab.id)} aria-label={`Zamknij kartę: ${tab.label}`} title="Zamknij kartę" className={`mr-1.5 grid size-5 shrink-0 place-items-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200 ${active ? '' : '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100'}`}>
                <X className="size-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

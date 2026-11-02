import { Home, Link2, Users, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

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

const FADE = '2rem';
const DRAG_THRESHOLD = 5;
const LONG_PRESS_MS = 500;

function edgeMask(start: boolean, end: boolean): string | undefined {
  if (!start && !end) return undefined;
  return `linear-gradient(to right, ${start ? `transparent, black ${FADE}` : 'black'}, ${end ? `black calc(100% - ${FADE}), transparent` : 'black'})`;
}

export function TabBar({ tabs, activeId, onActivate, onClose, onMenu }: TabBarProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const start = list.scrollLeft > 1;
    const end = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
    setOverflow((o) => (o.start === start && o.end === end ? o : { start, end }));
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // A mouse wheel only scrolls vertically, which a one-row strip ignores; React's onWheel is passive, so the listener is attached by hand to be able to preventDefault.
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || list.scrollWidth <= list.clientWidth) return;
      event.preventDefault();
      list.scrollLeft += event.deltaY;
    };
    // Without a visible scrollbar a mouse can grab the strip and drag it instead; touch screens already scroll it natively.
    let drag: { pointerId: number; startX: number; startScroll: number; moved: boolean } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || list.scrollWidth <= list.clientWidth) return;
      drag = { pointerId: event.pointerId, startX: event.clientX, startScroll: list.scrollLeft, moved: false };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.startX;
      if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
      if (!drag.moved) { drag.moved = true; list.setPointerCapture(event.pointerId); list.style.cursor = 'grabbing'; }
      list.scrollLeft = drag.startScroll - dx;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.moved) {
        list.style.cursor = '';
        const swallowClick = (click: MouseEvent) => { click.stopPropagation(); click.preventDefault(); };
        list.addEventListener('click', swallowClick, { capture: true, once: true });
        setTimeout(() => list.removeEventListener('click', swallowClick, { capture: true }), 0);
      }
      drag = null;
    };
    const resize = new ResizeObserver(measure);
    resize.observe(list);
    list.addEventListener('wheel', onWheel, { passive: false });
    list.addEventListener('pointerdown', onPointerDown);
    list.addEventListener('pointermove', onPointerMove);
    list.addEventListener('pointerup', onPointerUp);
    list.addEventListener('pointercancel', onPointerUp);
    return () => {
      resize.disconnect();
      list.removeEventListener('wheel', onWheel);
      list.removeEventListener('pointerdown', onPointerDown);
      list.removeEventListener('pointermove', onPointerMove);
      list.removeEventListener('pointerup', onPointerUp);
      list.removeEventListener('pointercancel', onPointerUp);
    };
  }, [measure]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    measure();
  }, [activeId, tabs.length, measure]);

  // Touch has no right click: holding a tab opens its menu, as Android's own contextmenu would, which iOS never fires.
  const longPress = useRef<{ timer: number; pointerId: number; x: number; y: number } | null>(null);
  const lastPointerType = useRef('mouse');
  const suppressClick = useRef(false);
  const cancelLongPress = () => { if (longPress.current) clearTimeout(longPress.current.timer); longPress.current = null; };
  const startLongPress = (event: React.PointerEvent<HTMLDivElement>, tabId: string) => {
    lastPointerType.current = event.pointerType;
    suppressClick.current = false;
    cancelLongPress();
    if (event.pointerType === 'mouse') return;
    const tab = event.currentTarget;
    const timer = window.setTimeout(() => {
      longPress.current = null;
      const rect = tab.getBoundingClientRect();
      suppressClick.current = true;
      navigator.vibrate?.(10);
      onMenu(tabId, rect.left, rect.bottom);
    }, LONG_PRESS_MS);
    longPress.current = { timer, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const moveLongPress = (event: React.PointerEvent) => {
    const press = longPress.current;
    if (press && press.pointerId === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_THRESHOLD * 2) cancelLongPress();
  };

  const mask = edgeMask(overflow.start, overflow.end);
  return (
    <div className="h-9 shrink-0 border-b border-zinc-200 bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-900/60">
    <div ref={listRef} role="tablist" aria-label="Otwarte drzewa" onScroll={measure} style={{ maskImage: mask, WebkitMaskImage: mask }} className="flex h-full items-end gap-1 overflow-x-auto px-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div key={tab.id} onContextMenu={(e) => { e.preventDefault(); if (lastPointerType.current === 'mouse') onMenu(tab.id, e.clientX, e.clientY); }} onPointerDown={(e) => startLongPress(e, tab.id)} onPointerMove={moveLongPress} onPointerUp={cancelLongPress} onPointerCancel={cancelLongPress} onClickCapture={(e) => { if (suppressClick.current) { e.stopPropagation(); e.preventDefault(); suppressClick.current = false; } }} className={`group flex h-8 max-w-60 shrink-0 items-center rounded-t-lg select-none [-webkit-touch-callout:none] border border-b-0 text-xs transition-colors ${active ? 'border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100' : 'border-transparent text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-800 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200'}`}>
            <button type="button" role="tab" aria-selected={active} onClick={() => onActivate(tab.id)} onAuxClick={(e) => { if (e.button === 1 && tab.closable) { e.preventDefault(); onClose(tab.id); } }} title={tab.label} className={`flex h-full min-w-0 items-center gap-1.5 pl-3 ${tab.closable ? 'pr-1' : 'pr-3'} ${active ? 'font-medium' : ''}`}>
              <span className="shrink-0 text-zinc-400">{icons[tab.icon]}</span>
              <span className="truncate">{tab.label}</span>
            </button>
            {tab.closable && (
              <button type="button" onClick={() => onClose(tab.id)} aria-label={`Zamknij kartę: ${tab.label}`} title="Zamknij kartę" className={`mr-1.5 grid size-5 shrink-0 place-items-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200 ${active ? '' : 'mouse:opacity-0 mouse:group-hover:opacity-100'}`}>
                <X className="size-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
    </div>
  );
}

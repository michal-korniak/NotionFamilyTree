import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export type ContextMenuItem = { label: string; icon?: ReactNode; danger?: boolean; onSelect: () => void } | 'separator';

interface ContextMenuProps {
  x: number;
  y: number;
  title?: string;
  items: ContextMenuItem[];
  onClose: () => void;
}

const MARGIN = 8;

export function ContextMenu({ x, y, title, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Opened near the right or bottom edge, the menu flips so it stays fully on screen.
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition({ left: Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN)), top: Math.max(MARGIN, y + height > window.innerHeight - MARGIN ? y - height : y) });
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onClose);
    window.addEventListener('wheel', onClose, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('wheel', onClose);
    };
  }, [onClose]);

  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, []);

  const moveFocus = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  };

  return (
    <div ref={ref} role="menu" onKeyDown={moveFocus} onContextMenu={(e) => e.preventDefault()} style={position} className="fixed z-[60] min-w-56 rounded-lg border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
      {title && <div className="truncate px-2.5 pt-1 pb-1.5 text-[11px] font-medium tracking-wider text-zinc-500 uppercase">{title}</div>}
      {items.map((item, index) => item === 'separator'
        ? <div key={`sep-${index}`} className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
        : (
          <button key={item.label} type="button" role="menuitem" onClick={() => { onClose(); item.onSelect(); }} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs outline-none transition-colors ${item.danger ? 'text-red-600 hover:bg-red-50 focus:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 dark:focus:bg-red-950/40' : 'text-zinc-700 hover:bg-zinc-100 focus:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800'}`}>
            <span className="grid size-4 shrink-0 place-items-center text-zinc-400 [&>svg]:size-3.5">{item.icon}</span>
            {item.label}
          </button>
        ))}
    </div>
  );
}

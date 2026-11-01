import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEGREE_RANGES, type DegreeRange, type FamilyDegrees } from '../lib/familyView';

export const HOME_TAB_ID = 'home';

// rootId / fromId null means "me", so those tabs follow whoever is chosen in "Kim jesteś?".
export type ViewTab =
  | { id: string; kind: 'family'; rootId: string | null; degrees: FamilyDegrees }
  | { id: string; kind: 'connection'; fromId: string | null; toId: string | null };

export interface ViewPrefs {
  meId: string | null;
  tabs: ViewTab[];
  activeTabId: string;
}

const STORAGE_KEY = 'nft:view';

// Anything that is not a finite number (missing after an app update, NaN from arithmetic on it) falls back to the default instead of sticking.
const clamp = (value: unknown, range: DegreeRange) => (typeof value === 'number' && Number.isFinite(value) ? Math.min(range.max, Math.max(range.min, Math.round(value))) : range.initial);

const kinds = Object.keys(DEGREE_RANGES) as (keyof FamilyDegrees)[];

function loadDegrees(stored: Partial<FamilyDegrees> | undefined): FamilyDegrees {
  return Object.fromEntries(kinds.map((kind) => [kind, clamp(stored?.[kind], DEGREE_RANGES[kind])])) as FamilyDegrees;
}

const asId = (value: unknown) => (typeof value === 'string' && value ? value : null);

function newTabId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeTab(raw: unknown): ViewTab | null {
  if (!raw || typeof raw !== 'object') return null;
  const tab = raw as Record<string, unknown>;
  const id = asId(tab.id);
  if (!id) return null;
  if (tab.kind === 'connection') return { id, kind: 'connection', fromId: asId(tab.fromId), toId: asId(tab.toId) };
  return { id, kind: 'family', rootId: id === HOME_TAB_ID ? null : asId(tab.rootId), degrees: loadDegrees(tab.degrees as Partial<FamilyDegrees> | undefined) };
}

// The first tab is always "Moje drzewo"; settings saved before tabs existed (a single rootId and degrees) become that tab plus, if the
// view was on someone else, a tab for them.
function normalize(stored: Record<string, unknown>): ViewPrefs {
  const meId = asId(stored.meId);
  const legacyDegrees = loadDegrees(stored.degrees as Partial<FamilyDegrees> | undefined);
  const storedTabs = Array.isArray(stored.tabs) ? stored.tabs.map(normalizeTab).filter((t): t is ViewTab => t !== null) : [];
  const home = storedTabs.find((t) => t.id === HOME_TAB_ID) ?? { id: HOME_TAB_ID, kind: 'family' as const, rootId: null, degrees: legacyDegrees };
  const tabs: ViewTab[] = [home, ...storedTabs.filter((t) => t.id !== HOME_TAB_ID)];
  const legacyRoot = asId(stored.rootId);
  if (!Array.isArray(stored.tabs) && legacyRoot && legacyRoot !== meId) tabs.push({ id: newTabId(), kind: 'family', rootId: legacyRoot, degrees: legacyDegrees });
  const storedActive = asId(stored.activeTabId);
  const activeTabId = storedActive && tabs.some((t) => t.id === storedActive) ? storedActive : tabs[tabs.length - 1]!.id;
  return { meId, tabs, activeTabId };
}

function load(): ViewPrefs {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>);
  } catch {
    return normalize({});
  }
}

export function useViewPrefs() {
  const [prefs, setPrefs] = useState<ViewPrefs>(load);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
  }, [prefs]);

  const activeTab = useMemo(() => prefs.tabs.find((t) => t.id === prefs.activeTabId) ?? prefs.tabs[0]!, [prefs]);

  const setMe = useCallback((meId: string) => setPrefs((p) => ({ ...p, meId, activeTabId: HOME_TAB_ID })), []);
  const activateTab = useCallback((id: string) => setPrefs((p) => (p.tabs.some((t) => t.id === id) ? { ...p, activeTabId: id } : p)), []);

  const closeTab = useCallback((id: string) => setPrefs((p) => {
    if (id === HOME_TAB_ID) return p;
    const index = p.tabs.findIndex((t) => t.id === id);
    if (index < 0) return p;
    const tabs = p.tabs.filter((t) => t.id !== id);
    return { ...p, tabs, activeTabId: p.activeTabId === id ? tabs[Math.max(0, index - 1)]!.id : p.activeTabId };
  }), []);

  // Closing several tabs from a tab's menu leaves that tab active if the active one was among those closed. "Moje drzewo" never closes.
  const closeTabs = useCallback((ids: string[], fallbackId: string) => setPrefs((p) => {
    const closing = new Set(ids.filter((id) => id !== HOME_TAB_ID));
    const tabs = p.tabs.filter((t) => !closing.has(t.id));
    return { ...p, tabs, activeTabId: closing.has(p.activeTabId) ? (tabs.some((t) => t.id === fallbackId) ? fallbackId : HOME_TAB_ID) : p.activeTabId };
  }), []);

  // Opens (or switches to) a tab with this person's family, starting from the default degrees; my own family is always the "Moje drzewo" tab.
  const openFamilyTab = useCallback((personId: string) => setPrefs((p) => {
    if (personId === p.meId) return { ...p, activeTabId: HOME_TAB_ID };
    const existing = p.tabs.find((t) => t.kind === 'family' && t.rootId === personId);
    if (existing) return { ...p, activeTabId: existing.id };
    const tab: ViewTab = { id: newTabId(), kind: 'family', rootId: personId, degrees: loadDegrees(undefined) };
    return { ...p, tabs: [...p.tabs, tab], activeTabId: tab.id };
  }), []);

  // Moving to a relative changes the person in the current tab (degrees back to defaults); "Moje drzewo" and connection tabs keep their content and a tab opens instead.
  const navigateTo = useCallback((personId: string) => setPrefs((p) => {
    const current = p.tabs.find((t) => t.id === p.activeTabId);
    if (personId === p.meId) return { ...p, activeTabId: HOME_TAB_ID };
    const duplicate = p.tabs.find((t) => t.kind === 'family' && t.rootId === personId);
    if (duplicate) return { ...p, activeTabId: duplicate.id };
    if (!current || current.id === HOME_TAB_ID || current.kind !== 'family') {
      const tab: ViewTab = { id: newTabId(), kind: 'family', rootId: personId, degrees: loadDegrees(undefined) };
      return { ...p, tabs: [...p.tabs, tab], activeTabId: tab.id };
    }
    return { ...p, tabs: p.tabs.map((t) => (t.id === current.id ? { ...current, rootId: personId, degrees: loadDegrees(undefined) } : t)) };
  }), []);

  const openConnectionTab = useCallback((fromId: string | null, toId: string | null) => setPrefs((p) => {
    const from = fromId === p.meId ? null : fromId;
    const existing = toId ? p.tabs.find((t) => t.kind === 'connection' && t.fromId === from && t.toId === toId) : undefined;
    if (existing) return { ...p, activeTabId: existing.id };
    const tab: ViewTab = { id: newTabId(), kind: 'connection', fromId: from, toId };
    return { ...p, tabs: [...p.tabs, tab], activeTabId: tab.id };
  }), []);

  const updateConnection = useCallback((tabId: string, fromId: string | null, toId: string | null) => setPrefs((p) => ({ ...p, tabs: p.tabs.map((t) => (t.id === tabId && t.kind === 'connection' ? { ...t, fromId: fromId === p.meId ? null : fromId, toId } : t)) })), []);

  const changeDegree = useCallback((kind: keyof FamilyDegrees, delta: number) => setPrefs((p) => ({
    ...p,
    tabs: p.tabs.map((t) => (t.id === p.activeTabId && t.kind === 'family' ? { ...t, degrees: { ...t.degrees, [kind]: clamp(clamp(t.degrees[kind], DEGREE_RANGES[kind]) + delta, DEGREE_RANGES[kind]) } } : t)),
  })), []);

  return { prefs, activeTab, setMe, activateTab, closeTab, closeTabs, openFamilyTab, navigateTo, openConnectionTab, updateConnection, changeDegree };
}

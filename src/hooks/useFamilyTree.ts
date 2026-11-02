import { useCallback, useEffect, useState } from 'react';
import type { FamilyTree, NotionLink, PeopleById, Person, UnionDetails } from '../types/person';
import { parseFamilyData } from '../lib/parseFamilyData';

const STORAGE_KEY = 'nft:data';
const HISTORY_LIMIT = 100;

interface StoredTree {
  sourceName: string;
  people: Person[];
  dirty?: boolean;
  notion?: NotionLink;
  unions?: Record<string, UnionDetails>;
}

interface TreeState {
  tree: FamilyTree | null;
  past: PeopleById[];
  future: PeopleById[];
  dirty: boolean;
}

const emptyState: TreeState = { tree: null, past: [], future: [], dirty: false };

function unionsFromLink(notion?: NotionLink): Record<string, UnionDetails> {
  return Object.fromEntries(Object.entries(notion?.unions ?? {}).map(([key, { kind, date, place, notes }]) => [key, { kind, date, place, notes }]));
}

function toTree(people: Person[], sourceName: string, notion?: NotionLink, unions?: Record<string, UnionDetails>): FamilyTree {
  return { people: new Map(people.map((p) => [p.id, p])), sourceName, loadId: Date.now(), notion, unions: unions ?? unionsFromLink(notion) };
}

function loadStored(): TreeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState;
    const stored = JSON.parse(raw) as StoredTree;
    if (Array.isArray(stored.people) && stored.people.length === 0) return { ...emptyState, tree: toTree([], stored.sourceName, stored.notion, stored.unions), dirty: Boolean(stored.dirty) };
    const result = parseFamilyData(stored.people);
    return result.ok ? { ...emptyState, tree: toTree(result.people, stored.sourceName, stored.notion, stored.unions), dirty: Boolean(stored.dirty) } : emptyState;
  } catch {
    return emptyState;
  }
}

function persist(tree: FamilyTree, dirty: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sourceName: tree.sourceName, people: [...tree.people.values()], dirty, notion: tree.notion, unions: tree.unions } satisfies StoredTree));
  } catch {
    // Quota exceeded or storage blocked: the tree still works for this session.
  }
}

export function useFamilyTree() {
  const [state, setState] = useState<TreeState>(loadStored);
  const [warnings, setWarnings] = useState<string[]>([]);
  const { tree, dirty } = state;

  useEffect(() => {
    if (tree) persist(tree, dirty);
  }, [tree, dirty]);

  // The Notion baseline is taken from the parsed people (after links are made two-way), so the first diff against it is empty.
  // keepView reloads the same tree (a refresh from Notion) without remounting the explorer, so the open tab and person stay as they are.
  const loadImported = useCallback((records: unknown[], sourceName: string, warnings: string[], notion?: Omit<NotionLink, 'baseline'>, keepView = false): string | null => {
    const result = parseFamilyData(records);
    if (!result.ok) return result.error;
    setState((s) => { const tree = toTree(result.people, sourceName, notion ? { ...notion, baseline: result.people } : undefined); return { ...emptyState, tree: keepView && s.tree ? { ...tree, loadId: s.tree.loadId } : tree }; });
    setWarnings([...warnings, ...result.warnings]);
    return null;
  }, []);

  const setNotionLink = useCallback((notion: NotionLink) => {
    setState((s) => (s.tree ? { ...s, tree: { ...s.tree, notion } } : s));
  }, []);

  const updateNotionLink = useCallback((update: (notion: NotionLink) => NotionLink) => {
    setState((s) => (s.tree?.notion ? { ...s, tree: { ...s.tree, notion: update(s.tree.notion) } } : s));
  }, []);

  // Union details are edited through a form with its own Anuluj, so they are saved directly rather than through the undo history.
  const updateUnion = useCallback((key: string, details: UnionDetails) => {
    setState((s) => (s.tree ? { ...s, tree: { ...s.tree, unions: { ...s.tree.unions, [key]: details } }, dirty: true } : s));
  }, []);

  const startEmpty = useCallback(() => {
    setState({ ...emptyState, tree: toTree([], 'nowe-drzewo.json') });
    setWarnings([]);
  }, []);

  const reset = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
    setState(emptyState);
    setWarnings([]);
  }, []);

  const commit = useCallback((people: PeopleById) => {
    setState((s) => (s.tree && s.tree.people !== people ? { tree: { ...s.tree, people }, past: [...s.past, s.tree.people].slice(-HISTORY_LIMIT), future: [], dirty: true } : s));
  }, []);

  const undo = useCallback(() => {
    setState((s) => {
      const previous = s.past.at(-1);
      if (!s.tree || !previous) return s;
      return { tree: { ...s.tree, people: previous }, past: s.past.slice(0, -1), future: [s.tree.people, ...s.future], dirty: true };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      const [next, ...rest] = s.future;
      if (!s.tree || !next) return s;
      return { tree: { ...s.tree, people: next }, past: [...s.past, s.tree.people], future: rest, dirty: true };
    });
  }, []);

  const dismissWarnings = useCallback(() => setWarnings([]), []);

  return { tree, warnings, dirty, canUndo: state.past.length > 0, canRedo: state.future.length > 0, loadImported, setNotionLink, updateNotionLink, updateUnion, startEmpty, reset, commit, undo, redo, dismissWarnings };
}

export type FamilyTreeController = ReturnType<typeof useFamilyTree>;

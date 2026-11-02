import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFamilyTree, type FamilyTreeController } from './hooks/useFamilyTree';
import { useTheme, type Theme } from './hooks/useTheme';
import { computeLayout } from './lib/layout';
import { computeStats } from './lib/stats';
import { addRelative, createPerson, createRelative, deletePerson, removeRelative, updatePersonDetails, withSecondParent, type EditResult } from './lib/treeEdits';
import { StartScreen } from './components/StartScreen';
import { WhoAreYouDialog } from './components/WhoAreYouDialog';
import { ContextMenu, type ContextMenuItem } from './components/ContextMenu';
import { Home, Link2, Pencil, Trash2, UserPlus, Users, Waypoints, X } from 'lucide-react';
import { describeRelationship, describeRelationshipToMe, relationship, type Relationship } from './lib/kinship';
import { composeName, displayName } from './lib/names';
import { TopBar } from './components/TopBar';
import { PersonPickDialog } from './components/PersonPickDialog';
import { notionSettings } from './lib/notion/notionSettings';
import { FamilyGraph, type FocusRequest } from './components/FamilyGraph';
import { PersonDrawer, type PersonEditActions } from './components/PersonDrawer';
import { WarningBanner } from './components/WarningBanner';
import { EmptyTree } from './components/EmptyTree';
import { ViewControls } from './components/ViewControls';
import { HOME_TAB_ID, useViewPrefs, type ViewTab } from './hooks/useViewPrefs';
import { TabBar, type TabInfo } from './components/TabBar';
import { defaultRoot, familyMembers, isPhoneLayout, restrictTo } from './lib/familyView';
import { generationDepth } from './lib/stats';
import { NotionPushDialog } from './components/NotionPushDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { conflictingChanges, diffNotion, photoChanges, revertChange, type NotionChange, type NotionEdits } from './lib/notion/notionPush';
import { PhotosContext, usePhotoQueue } from './hooks/usePhotoQueue';
import { usePhotoCache } from './hooks/usePhotoCache';
import { describeUnion, PHOTO_PROPERTIES, refreshNotionDatabase, type NotionImport, type NotionRefresh } from './lib/notion/notionMapping';
import { fullPhotoUrl } from './lib/notion/notionPhotos';
import { NotionClient } from './lib/notion/notionClient';
import { unionKey, type Gender, type UnionDetails } from './types/person';

const AUTO_REFRESH_MS = 5 * 60_000;
const AUTO_REFRESH_CHECK_MS = 30_000;

interface ExplorerProps {
  controller: FamilyTreeController & { tree: NonNullable<FamilyTreeController['tree']> };
  theme: Theme;
  onToggleTheme: () => void;
}

function describeToMeOrNull(rel: Relationship | null): string | undefined {
  return rel ? describeRelationshipToMe(rel) : undefined;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
}

function useUndoShortcuts(undo: () => void, redo: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
      else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);
}

function Explorer({ controller, theme, onToggleTheme }: ExplorerProps) {
  const { tree, warnings, dirty, canUndo, canRedo, commit, undo, redo, reset, dismissWarnings, setNotionLink, updateUnion } = controller;
  const { people } = tree;
  const { prefs: view, activeTab, setMe, activateTab, closeTab, closeTabs, openFamilyTab, navigateTo, openConnectionTab, changeDegree } = useViewPrefs();
  const meId = view.meId && people.has(view.meId) ? view.meId : null;
  const [changingMe, setChangingMe] = useState(false);
  const familyTab = activeTab.kind === 'family' ? activeTab : null;
  const rootId = familyTab ? (familyTab.rootId && people.has(familyTab.rootId) ? familyTab.rootId : meId ?? defaultRoot(people)) : null;
  // In a connection tab the left side of "Powiązanie: A ↔ B" is me unless another person was picked.
  const connectFromId = activeTab.kind === 'connection' ? (activeTab.fromId && people.has(activeTab.fromId) ? activeTab.fromId : meId) : meId;
  const connectWithId = activeTab.kind === 'connection' && activeTab.toId && people.has(activeTab.toId) ? activeTab.toId : null;
  const degrees = familyTab?.degrees;
  const notionLink = tree.notion;
  const unionKindOf = useCallback((a: string, b: string) => tree.unions[unionKey(a, b)]?.kind, [tree.unions]);
  const connection = useMemo(() => (connectFromId && connectWithId && people.has(connectWithId) ? relationship(people, connectFromId, connectWithId, unionKindOf) : null), [people, connectFromId, connectWithId, unionKindOf]);
  // With both sides of "Powiązanie" chosen, only the chain of people linking them is drawn.
  const visible = useMemo(() => (connection ? restrictTo(people, new Set(connection.path)) : rootId && degrees ? restrictTo(people, familyMembers(people, rootId, degrees)) : activeTab.kind === 'connection' ? restrictTo(people, new Set([connectFromId, connectWithId].filter((id): id is string => Boolean(id)))) : people), [connection, people, rootId, degrees, activeTab.kind, connectFromId, connectWithId]);
  const layout = useMemo(() => computeLayout(visible), [visible]);
  const stats = useMemo(() => computeStats(people, generationDepth(people)), [people]);
  const viewKey = activeTab.kind === 'connection' ? `${activeTab.id}:${connectFromId}:${connectWithId}` : `${activeTab.id}:${rootId}:${Object.values(degrees ?? {}).join(':')}`;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [notionDialogOpen, setNotionDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const describeSpouseUnion = useCallback((personId: string, spouseId: string) => describeUnion({ ...tree.unions[unionKey(personId, spouseId)], ending: notionLink?.unions[unionKey(personId, spouseId)]?.ending }), [tree.unions, notionLink]);
  const unionAccess = useMemo(() => ({ get: (a: string, b: string) => tree.unions[unionKey(a, b)], save: (a: string, b: string, details: UnionDetails) => updateUnion(unionKey(a, b), details) }), [tree.unions, updateUnion]);
  const photos = usePhotoQueue();
  const recordThumbnails = useCallback((personId: string, property: string, thumbKeyByName: Record<string, string>) => controller.updateNotionLink((link) => ({ ...link, photos: { ...link.photos, [personId]: { ...link.photos?.[personId], [property]: (link.photos?.[personId]?.[property] ?? []).map((photo) => (thumbKeyByName[photo.name] ? { ...photo, thumbKey: thumbKeyByName[photo.name] } : photo)) } } })), [controller]);
  const photoCacheState = usePhotoCache(tree.notion, recordThumbnails);
  const openFullPhoto = useCallback(async (personId: string, key: string) => {
    const token = notionSettings.token();
    const pageId = tree.notion?.pageIds[personId];
    if (!token || !pageId) throw new Error('Aby otworzyć zdjęcie, potrzebny jest token Notion.');
    return fullPhotoUrl(new NotionClient(token), pageId, key, PHOTO_PROPERTIES);
  }, [tree.notion]);
  const photosContext = useMemo(() => ({ queue: photos, cache: photoCacheState, listing: tree.notion?.photos ?? {}, openFull: openFullPhoto }), [photos, photoCacheState, tree.notion?.photos, openFullPhoto]);
  const notionPending = useMemo(() => (tree.notion ? diffNotion(tree.notion, people, tree.unions).length + photoChanges(photos.ops, people).length : undefined), [tree.notion, people, tree.unions, photos.ops]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshConfirmOpen, setRefreshConfirmOpen] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  // With nothing new in Notion only the sync time moves on, so local edits and the undo history survive; otherwise the tree is reloaded
  // in place, keeping the open tab and person.
  const applyRefresh = useCallback((result: NotionRefresh, { warnings: extraWarnings = [], discardLocal = false }: { warnings?: string[]; discardLocal?: boolean } = {}): string | null => {
    if (!tree.notion) return null;
    const changed = result.changedPersonIds.length || result.removedPersonIds.length || result.changedUnionKeys.length || result.removedUnionKeys.length || result.changedPhotos;
    if (!changed && !extraWarnings.length && !discardLocal) { controller.setNotionLink({ ...tree.notion, syncedAt: result.link.syncedAt }); return null; }
    setNotionEdits(null);
    return controller.loadImported(result.records, result.link.title, [...extraWarnings, ...result.warnings], result.link, true);
  }, [tree.notion, controller]);
  const refreshFromNotion = useCallback(async ({ silent = false, discardLocal = false } = {}) => {
    if (!tree.notion) return;
    const token = notionSettings.token();
    if (!token) { if (!silent) setRefreshError('Brak zapisanego tokenu Notion. Podaj go w oknie „Zapisz zmiany”.'); return; }
    setRefreshing(true);
    try {
      const failure = applyRefresh(await refreshNotionDatabase(token, tree.notion), { discardLocal });
      if (failure && !silent) setRefreshError(failure);
    } catch (error) {
      if (!silent) setRefreshError(error instanceof Error ? error.message : String(error));
    } finally {
      setRefreshing(false);
    }
  }, [tree.notion, applyRefresh]);

  // What Notion changed since the last sync, as last seen by a background check made while there were unsaved changes; any overlap with
  // those changes marks the save button. Recomputed from the current changes, so undoing the clashing one clears the mark.
  const [notionEdits, setNotionEdits] = useState<NotionEdits | null>(null);
  const notionConflicts = useMemo(() => (tree.notion && notionEdits ? [...new Set(conflictingChanges(diffNotion(tree.notion, people, tree.unions), notionEdits).map((change) => change.label))] : []), [tree.notion, notionEdits, people, tree.unions]);
  const checkNotion = useCallback(async () => {
    const token = notionSettings.token();
    if (!tree.notion || !token) return;
    try { setNotionEdits(await refreshNotionDatabase(token, tree.notion)); } catch { /* the next check, or the save itself, tries again */ }
  }, [tree.notion]);
  useEffect(() => { if (!notionPending) setNotionEdits(null); }, [notionPending]);

  // Pulls others' changes from Notion in the background and never saves. With unsaved changes a reload would drop them, so it only checks
  // whether Notion changed the same people; the save itself checks again before writing anything.
  const lastRefresh = useRef(Date.now());
  const periodicRefresh = useRef<() => void>(() => undefined);
  periodicRefresh.current = () => {
    if (refreshing || notionDialogOpen || document.visibilityState !== 'visible' || Date.now() - lastRefresh.current < AUTO_REFRESH_MS) return;
    lastRefresh.current = Date.now();
    if (notionPending) void checkNotion(); else void refreshFromNotion({ silent: true });
  };
  useEffect(() => {
    if (!tree.notion) return;
    const timer = window.setInterval(() => periodicRefresh.current(), AUTO_REFRESH_CHECK_MS);
    const onVisible = () => periodicRefresh.current();
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [tree.notion !== undefined]);

  useUndoShortcuts(undo, redo);

  // Undo/redo or a delete can remove the selected person, so selection is only honoured while they still exist.
  const activeSelectedId = selectedId && people.has(selectedId) ? selectedId : null;
  const drawerPerson = drawerId ? people.get(drawerId) ?? null : null;

  const focus = useCallback((id: string) => setFocusRequest((previous) => ({ id, nonce: (previous?.nonce ?? 0) + 1 })), []);
  const select = useCallback((id: string | null) => { setSelectedId(id); setEditingId(null); if (id) setDrawerId(id); }, []);
  // Going to a person (search, relative lists, double-click) shows their family in this tab; "Moje drzewo" and connection tabs open a new tab instead.
  const selectAndFocus = useCallback((id: string) => { select(id); navigateTo(id); }, [select, navigateTo]);
  // "Drzewo tej osoby" always gives the person a tab of their own (or switches to it).
  const openFamily = useCallback((id: string) => { select(id); openFamilyTab(id); }, [select, openFamilyTab]);
  const close = useCallback(() => { setSelectedId(null); setEditingId(null); }, []);
  const [menu, setMenu] = useState<{ x: number; y: number; personId: string | null } | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const [connectionFromId, setConnectionFromId] = useState<string | null>(null);
  const [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const tabMenuItems = (tabId: string): ContextMenuItem[] => {
    const index = tabInfos.findIndex((tab) => tab.id === tabId);
    const closable = (tab: TabInfo) => tab.closable;
    const others = tabInfos.filter((tab) => tab.id !== tabId && closable(tab)).map((tab) => tab.id);
    const left = tabInfos.slice(0, index).filter(closable).map((tab) => tab.id);
    const right = tabInfos.slice(index + 1).filter(closable).map((tab) => tab.id);
    return [
      ...(tabInfos[index]?.closable ? [{ label: 'Zamknij', icon: <X />, onSelect: () => closeTab(tabId) }] : []),
      ...(others.length ? [{ label: 'Zamknij inne', onSelect: () => closeTabs(others, tabId) }] : []),
      ...(left.length ? [{ label: 'Zamknij po lewej', onSelect: () => closeTabs(left, tabId) }] : []),
      ...(right.length ? [{ label: 'Zamknij po prawej', onSelect: () => closeTabs(right, tabId) }] : []),
    ];
  };
  const closeMenu = useCallback(() => setMenu(null), []);

  // Set while the person just added is being filled in; cancelling that form removes them again.
  const [newPersonId, setNewPersonId] = useState<string | null>(null);
  const addPerson = useCallback(() => {
    const { people: next, id } = createPerson(people, { name: 'Nowa osoba', gender: 'U' });
    commit(next);
    selectAndFocus(id);
    setEditingId(id);
    setNewPersonId(id);
  }, [people, commit, selectAndFocus]);

  // A tree loaded from Notion always asks first: closing drops the local copy, and getting it back means importing again.
  const goHome = useCallback(() => { activateTab(HOME_TAB_ID); close(); }, [activateTab, close]);
  const chooseMe = useCallback((id: string) => { setMe(id); setChangingMe(false); close(); }, [setMe, close]);
  const createMe = useCallback((givenNames: string, surname: string, gender: Gender) => {
    const { people: next, id } = createPerson(people, { name: composeName({ givenNames, birthSurname: surname, marriedSurname: '' }), givenNames, birthSurname: surname, marriedSurname: '', gender });
    commit(next);
    setMe(id);
    setChangingMe(false);
  }, [people, commit, setMe]);

  const menuItems = (personId: string | null): ContextMenuItem[] => {
    if (!personId || !people.has(personId)) return [
      ...(meId ? [{ label: 'Moje drzewo', icon: <Home />, onSelect: goHome }] : []),
      { label: 'Dodaj osobę', icon: <UserPlus />, onSelect: addPerson },
    ];
    const isMe = personId === meId;
    return [
      { label: 'Drzewo tej osoby', icon: <Users />, onSelect: () => openFamily(personId) },
      ...(meId && !isMe ? [{ label: 'Powiązanie ze mną', icon: <Link2 />, onSelect: () => openConnectionTab(null, personId) }] : []),
      { label: 'Powiązanie z inną osobą', icon: <Waypoints />, onSelect: () => setConnectionFromId(personId) },
      'separator',
      { label: 'Edytuj dane', icon: <Pencil />, onSelect: () => { select(personId); setEditingId(personId); } },
      'separator',
      { label: 'Usuń…', icon: <Trash2 />, danger: true, onSelect: () => setDeleteCandidate(personId) },
    ];
  };


  const nameOf = (id: string | null) => (id && people.has(id) ? displayName(people.get(id)!) : '…');
  const tabInfos: TabInfo[] = view.tabs.map((tab: ViewTab) => {
    if (tab.id === HOME_TAB_ID) return { id: tab.id, label: 'Moje drzewo', icon: 'home', closable: false };
    if (tab.kind === 'family') return { id: tab.id, label: nameOf(tab.rootId), icon: 'family', closable: true };
    return { id: tab.id, label: `${tab.fromId ? nameOf(tab.fromId) : 'Ja'} ↔ ${nameOf(tab.toId)}`, icon: 'connection', closable: true };
  });

  const revertNotionChange = useCallback((change: NotionChange) => {
    if (!tree.notion) return;
    if (change.kind === 'photos') {
      const [personId, property] = [change.key.slice(0, change.key.indexOf(':')), change.key.slice(change.key.indexOf(':') + 1)];
      void photos.drop(photos.ops.filter((op) => op.personId === personId && op.property === property).map((op) => op.id));
      return;
    }
    const reverted = revertChange(change, tree.notion, people, tree.unions);
    if (reverted.people !== people) commit(reverted.people);
    for (const [key, details] of Object.entries(reverted.unions)) if (details !== tree.unions[key]) updateUnion(key, details);
  }, [tree.notion, tree.unions, people, photos, commit, updateUnion]);

  const reloadAfterConflict = useCallback((notion: NotionRefresh, conflicts: NotionChange[]) => {
    setNotionDialogOpen(false);
    const names = [...new Set(conflicts.map((change) => change.label))].join(', ');
    const failure = applyRefresh(notion, { discardLocal: true, warnings: [`Od ostatniej synchronizacji ktoś zmienił w Notion: ${names}. Wczytano aktualne dane z Notion, a niezapisane zmiany zostały odrzucone (zdjęcia czekają dalej) — wprowadź je ponownie.`] });
    if (failure) setRefreshError(failure);
  }, [applyRefresh]);

  const handleReset = useCallback(() => {
    if (notionPending !== undefined || dirty) setCloseDialogOpen(true); else reset();
  }, [dirty, notionPending, reset]);

  const actions = useMemo<PersonEditActions>(() => {
    const id = drawerId ?? '';
    const apply = (result: EditResult) => { if (!result.ok) return result.error; commit(result.people); return null; };
    return {
      onStartEdit: () => setEditingId(id),
      onCancelEdit: () => { setEditingId(null); if (id === newPersonId) { commit(deletePerson(people, id)); setNewPersonId(null); close(); } },
      onSaveDetails: (details) => { commit(updatePersonDetails(people, id, details)); setEditingId(null); if (id === newPersonId) setNewPersonId(null); },
      onDelete: () => { commit(deletePerson(people, id)); close(); },
      onAddRelation: (kind, otherId, secondParentId) => apply(withSecondParent(addRelative(people, id, kind, otherId), otherId, kind === 'children' ? secondParentId : null)),
      onCreateRelative: (kind, names, gender, secondParentId) => { const created = createRelative(people, id, kind, names, gender); return apply(withSecondParent(created, created.ok ? created.id : undefined, kind === 'children' ? secondParentId : null)); },
      onRemoveRelation: (kind, otherId) => commit(removeRelative(people, id, kind, otherId)),
    };
  }, [drawerId, people, commit, close, newPersonId]);

  return (
    <PhotosContext.Provider value={photosContext}>
    <div className="flex h-full flex-col">
      <TopBar people={people} stats={stats} sourceName={tree.sourceName} theme={theme} canUndo={canUndo} canRedo={canRedo} notionPending={notionPending} notionConflicts={notionConflicts} refreshing={refreshing} onRefresh={() => (notionPending ? setRefreshConfirmOpen(true) : void refreshFromNotion())} onOpenNotion={() => setNotionDialogOpen(true)} onGoHome={goHome} onChangeMe={() => setChangingMe(true)} onToggleTheme={onToggleTheme} onSelect={selectAndFocus} onAddPerson={addPerson} onUndo={undo} onRedo={redo} onReset={handleReset} />
      <TabBar tabs={tabInfos} activeId={activeTab.id} onActivate={(id) => { activateTab(id); close(); }} onClose={closeTab} onMenu={(id, x, y) => { if (!isPhoneLayout()) setTabMenu({ id, x, y }); }} />
      <main className="relative flex-1 overflow-hidden">
        <FamilyGraph people={visible} layout={layout} selectedId={activeSelectedId && visible.has(activeSelectedId) ? activeSelectedId : null} focusRequest={focusRequest} theme={theme} viewKey={viewKey} unionKindOf={unionKindOf} onSelect={select} onOpenFamily={selectAndFocus} onNodeMenu={(personId, x, y) => { if (isPhoneLayout()) return; select(personId); setMenu({ x, y, personId }); }} onPaneMenu={(x, y) => { if (!isPhoneLayout()) setMenu({ x, y, personId: null }); }} />
        {people.size > 0 && <ViewControls connection={connection && connectWithId && connectFromId ? { fromName: connectFromId === meId ? 'Ja' : displayName(people.get(connectFromId)!), fromIsMe: connectFromId === meId, name: displayName(people.get(connectWithId)!), description: describeRelationship(connection) } : undefined} degrees={degrees} isMine={activeTab.id === HOME_TAB_ID} rootName={rootId && people.has(rootId) ? displayName(people.get(rootId)!) : undefined} shownCount={visible.size} totalCount={people.size} onDegreeChange={changeDegree} />}
        {people.size === 0 && <EmptyTree onAddPerson={addPerson} />}
        <WarningBanner warnings={warnings} onDismiss={dismissWarnings} />
        <PersonDrawer isNew={drawerId !== null && drawerId === newPersonId} onConnectWith={setConnectionFromId} notionPageId={tree.notion ? (drawerId && tree.notion.pageIds[drawerId]) || null : undefined} relationToMe={drawerId && meId && drawerId !== meId ? describeToMeOrNull(relationship(people, meId, drawerId, unionKindOf)) : undefined} onShowConnection={meId ? (id) => { if (id === meId) return; openConnectionTab(null, id); if (isPhoneLayout()) close(); } : undefined} person={drawerPerson} open={activeSelectedId !== null} editing={editingId !== null && editingId === drawerId} people={people} describeUnion={describeSpouseUnion} unions={unionAccess} actions={actions} onSelect={selectAndFocus} onFocus={focus} onShowFamily={(id) => { openFamily(id); if (isPhoneLayout()) close(); }} onClose={close} />
      </main>
      {(meId === null || changingMe) && <WhoAreYouDialog people={people} currentMeId={meId} onChoose={chooseMe} onCreate={createMe} onCancel={meId !== null ? () => setChangingMe(false) : undefined} />}
      {tabMenu && tabMenuItems(tabMenu.id).length > 0 && <ContextMenu x={tabMenu.x} y={tabMenu.y} items={tabMenuItems(tabMenu.id)} onClose={() => setTabMenu(null)} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} title={menu.personId && people.has(menu.personId) ? displayName(people.get(menu.personId)!) : undefined} items={menuItems(menu.personId)} onClose={closeMenu} />}
      {connectionFromId && people.has(connectionFromId) && <PersonPickDialog title={`Powiązanie: ${displayName(people.get(connectionFromId)!)} ↔ …`} people={people} exclude={new Set([connectionFromId])} onPick={(toId) => { openConnectionTab(connectionFromId, toId); setConnectionFromId(null); if (isPhoneLayout()) close(); }} onClose={() => setConnectionFromId(null)} />}
      {deleteCandidate && people.has(deleteCandidate) && (
        <ConfirmDialog title={`Usunąć: ${displayName(people.get(deleteCandidate)!)}?`} confirmLabel="Usuń" danger onConfirm={() => { commit(deletePerson(people, deleteCandidate)); if (selectedId === deleteCandidate) close(); setDeleteCandidate(null); }} onCancel={() => setDeleteCandidate(null)}>
          <p>Osoba i jej powiązania zostaną usunięte. Możesz cofnąć przez Ctrl+Z.</p>
        </ConfirmDialog>
      )}
      {refreshConfirmOpen && (
        <ConfirmDialog title="Odświeżyć z Notion?" confirmLabel="Odrzuć zmiany i odśwież" danger onConfirm={() => { setRefreshConfirmOpen(false); void photos.clear(); void refreshFromNotion({ discardLocal: true }); }} onCancel={() => setRefreshConfirmOpen(false)}>
          <p>Masz niewysłane zmiany ({notionPending}). Odświeżenie wczyta dane z Notion od nowa i te zmiany zostaną utracone. Aby je zachować, najpierw użyj „Zapisz zmiany”.</p>
        </ConfirmDialog>
      )}
      {refreshError && (
        <ConfirmDialog title="Nie udało się odświeżyć" confirmLabel="OK" onConfirm={() => setRefreshError(null)} onCancel={() => setRefreshError(null)}>
          <p>{refreshError}</p>
        </ConfirmDialog>
      )}
      {closeDialogOpen && (
        <ConfirmDialog title="Zamknąć to drzewo?" confirmLabel={notionPending || (notionPending === undefined && dirty) ? 'Odrzuć zmiany i zamknij' : 'Zamknij drzewo'} danger onConfirm={() => { setCloseDialogOpen(false); void photos.clear(); reset(); }} onCancel={() => setCloseDialogOpen(false)}>
          {notionPending ? <p className="font-medium text-red-600 dark:text-red-400">Niewysłane do Notion zmiany ({notionPending}) zostaną utracone. Aby je zachować, najpierw użyj „Zapisz zmiany”.</p> : null}
          {tree.notion ? <p>Lokalna kopia „{tree.sourceName}” zostanie usunięta z tej przeglądarki. Dane w Notion pozostaną bez zmian i w każdej chwili możesz je zaimportować ponownie.</p> : <p>Drzewo zostanie usunięte z tej przeglądarki.</p>}
        </ConfirmDialog>
      )}
      {notionDialogOpen && tree.notion && <NotionPushDialog link={tree.notion} people={people} unions={tree.unions} notionEdits={notionEdits} photoOps={photos.ops} onPhotosSaved={(ids) => void photos.drop(ids)} onRevert={revertNotionChange} onConflict={reloadAfterConflict} onPushed={setNotionLink} onClose={() => setNotionDialogOpen(false)} />}
    </div>
    </PhotosContext.Provider>
  );
}

export default function App() {
  const controller = useFamilyTree();
  const { theme, toggle } = useTheme();
  const { tree } = controller;

  const importNotion = (result: NotionImport) => controller.loadImported(result.records, result.link.title, result.warnings, result.link);

  if (!tree) return <StartScreen onStartEmpty={controller.startEmpty} onNotionImported={importNotion} />;
  return <Explorer key={tree.loadId} controller={{ ...controller, tree }} theme={theme} onToggleTheme={toggle} />;
}

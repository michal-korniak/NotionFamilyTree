import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type NodeMouseHandler } from '@xyflow/react';
import type { PeopleById } from '../types/person';
import type { TreeLayout } from '../lib/layout';
import { NODE_HEIGHT, NODE_WIDTH } from '../lib/layout';
import type { Theme } from '../hooks/useTheme';
import { relationsTo, relationStyles, type Relation } from '../lib/relationColors';
import { computeFamilyRoutes, familySegments, type FamilyRoute } from '../lib/familyRoutes';
import { FamilyEdge } from './FamilyEdge';
import { PersonNode, type HighlightState, type PersonFlowNode } from './PersonNode';

export interface FocusRequest {
  id: string;
  nonce: number;
}

interface FamilyGraphProps {
  people: PeopleById;
  layout: TreeLayout;
  selectedId: string | null;
  focusRequest: FocusRequest | null;
  theme: Theme;
  viewKey: string;
  unionKindOf?: (a: string, b: string) => string | undefined;
  onSelect: (id: string | null) => void;
  onOpenFamily?: (id: string) => void;
  onNodeMenu?: (id: string, x: number, y: number) => void;
  onPaneMenu?: (x: number, y: number) => void;
}

const nodeTypes = { person: PersonNode };
const edgeTypes = { family: FamilyEdge };
// React Flow's built-in controls and screen-reader texts default to English.
const POLISH_ARIA_LABELS = {
  'node.a11yDescription.default': 'Naciśnij Enter lub spację, aby wybrać osobę.',
  'node.a11yDescription.keyboardDisabled': 'Naciśnij Enter lub spację, aby wybrać osobę.',
  'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }: { direction: string; x: number; y: number }) => `Przesunięto: ${direction}. Nowa pozycja x: ${x}, y: ${y}`,
  'edge.a11yDescription.default': 'Linia powiązania rodzinnego.',
  'controls.ariaLabel': 'Panel sterowania',
  'controls.zoomIn.ariaLabel': 'Powiększ',
  'controls.zoomOut.ariaLabel': 'Pomniejsz',
  'controls.fitView.ariaLabel': 'Dopasuj widok',
  'controls.interactive.ariaLabel': 'Przełącz interaktywność',
  'minimap.ariaLabel': 'Minimapa',
  'handle.ariaLabel': 'Uchwyt',
};
// Above every edge layer (edges use z-index 0–3 to order colours), so lines never draw over a card.
const NODE_Z_INDEX = 10;
const FOCUS_ZOOM = 1.1;
const DRAWER_WIDTH = 400;
// Clamped so a tiny tree isn't blown up and a wide tree on a phone stays readable (the minimap and panning cover the rest).
const FIT_VIEW_OPTIONS = { padding: 0.15, minZoom: 0.4, maxZoom: 1, duration: 300 };

function familyEdgeRelation(route: FamilyRoute, childId: string, selectedId: string): Relation | null {
  if (childId === selectedId) return 'parent';
  if (route.parentIds.includes(selectedId)) return 'child';
  return null;
}

// The line between the selected person's two parents is where their drop line starts, so it is highlighted as part of the parent relationship.
function spouseEdgeRelation(left: string, right: string, selectedId: string | null, selectedParents: Set<string>): Relation | null {
  if (!selectedId) return null;
  if (left === selectedId || right === selectedId) return 'spouse';
  if (selectedParents.has(left) && selectedParents.has(right)) return 'parent';
  return null;
}

function buildEdges(people: PeopleById, layout: TreeLayout, routes: FamilyRoute[], selectedId: string | null): Edge[] {
  const edges: Edge[] = [];
  const edgeClass = (base: string, relation: Relation | null) => (!selectedId ? base : `${base} ${relation ? `edge-highlight edge-rel-${relation}` : 'edge-dimmed'}`);
  // Edges of one family share drop and bar segments; the stacking order decides which colour shows on a shared segment (parent line over the others, any highlight over faded lines).
  const zIndexFor = (relation: Relation | null) => (relation === 'parent' ? 3 : relation === 'child' || relation === 'spouse' ? 2 : relation ? 1 : 0);

  for (const route of routes) {
    for (const segment of familySegments(route)) {
      const relations = selectedId ? segment.childIds.map((childId) => familyEdgeRelation(route, childId, selectedId)) : [];
      const relation = relations.reduce<Relation | null>((best, r) => (zIndexFor(r) > zIndexFor(best) ? r : best), null);
      edges.push({ id: `fam:${route.key}:${segment.key}`, source: route.parentIds[0]!, target: segment.childIds[0]!, type: 'family', data: { path: segment.path }, className: edgeClass('edge-child', relation), selectable: false, zIndex: zIndexFor(relation) });
    }
  }
  const selectedParents = new Set(selectedId ? people.get(selectedId)?.parents ?? [] : []);
  for (const person of people.values()) {
    for (const spouseId of person.spouses) {
      if (person.id > spouseId) continue;
      const [left, right] = (layout.positions.get(person.id)?.x ?? 0) <= (layout.positions.get(spouseId)?.x ?? 0) ? [person.id, spouseId] : [spouseId, person.id];
      const relation = spouseEdgeRelation(left, right, selectedId, selectedParents);
      edges.push({ id: `sp:${person.id}:${spouseId}`, source: left, sourceHandle: 'right', target: right, targetHandle: 'left', type: 'straight', className: edgeClass('edge-spouse', relation), selectable: false, zIndex: zIndexFor(relation) });
    }
  }
  return edges;
}

function highlightFor(id: string, selectedId: string | null, relations: Map<string, Relation>): HighlightState {
  if (!selectedId) return 'normal';
  if (id === selectedId) return 'selected';
  return relations.get(id) ?? 'dimmed';
}

function Graph({ people, layout, selectedId, focusRequest, theme, viewKey, unionKindOf, onSelect, onOpenFamily, onNodeMenu, onPaneMenu }: FamilyGraphProps) {
  const { setCenter, fitView } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportPinnedRef = useRef(false);

  const relations = useMemo(() => (selectedId ? relationsTo(people, selectedId) : new Map<string, Relation>()), [people, selectedId]);

  const nodes = useMemo<PersonFlowNode[]>(() => [...people.values()].map((person) => ({ id: person.id, type: 'person', position: layout.positions.get(person.id) ?? { x: 0, y: 0 }, data: { person, highlight: highlightFor(person.id, selectedId, relations), unionKind: selectedId && relations.get(person.id) === 'spouse' ? unionKindOf?.(selectedId, person.id) : undefined }, draggable: false, connectable: false, width: NODE_WIDTH, height: NODE_HEIGHT, zIndex: NODE_Z_INDEX })), [people, layout, selectedId, relations, unionKindOf]);

  const routes = useMemo(() => computeFamilyRoutes(people, layout), [people, layout]);
  const edges = useMemo(() => buildEdges(people, layout, routes, selectedId), [people, layout, routes, selectedId]);

  // Edits recompute the layout; only a new focus request (not a layout change) should move the camera.
  const handledFocusRef = useRef<FocusRequest | null>(null);
  useEffect(() => {
    if (!focusRequest || handledFocusRef.current === focusRequest) return;
    handledFocusRef.current = focusRequest;
    const position = layout.positions.get(focusRequest.id);
    if (!position) return;
    // Focus always opens the 400px drawer on wider screens, so center within the area left of it.
    const drawerOffset = window.matchMedia('(min-width: 640px)').matches ? DRAWER_WIDTH / 2 / FOCUS_ZOOM : 0;
    viewportPinnedRef.current = true;
    void setCenter(position.x + NODE_WIDTH / 2 + drawerOffset, position.y + NODE_HEIGHT / 2, { zoom: FOCUS_ZOOM, duration: 600 });
  }, [focusRequest, layout, setCenter]);

  // Keep the whole tree in view when the window resizes, until the user pans/zooms or focuses someone; "fit view" in the controls re-enables it.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let timer: number | undefined;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { if (!viewportPinnedRef.current) void fitView(FIT_VIEW_OPTIONS); }, 120);
    });
    observer.observe(container);
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  }, [fitView]);

  // Switching focus or mode replaces the whole picture, so it is framed again from scratch.
  const lastViewKey = useRef(viewKey);
  useEffect(() => {
    if (lastViewKey.current === viewKey) return;
    lastViewKey.current = viewKey;
    viewportPinnedRef.current = false;
    const timer = window.setTimeout(() => void fitView(FIT_VIEW_OPTIONS), 30);
    return () => window.clearTimeout(timer);
  }, [viewKey, fitView]);

  const handleMoveStart = useCallback((event: MouseEvent | TouchEvent | null) => { if (event) viewportPinnedRef.current = true; }, []);
  const handleFitView = useCallback(() => { viewportPinnedRef.current = false; }, []);

  const handleNodeClick = useCallback<NodeMouseHandler<PersonFlowNode>>((_, node) => onSelect(node.id), [onSelect]);
  const handlePaneClick = useCallback(() => onSelect(null), [onSelect]);
  const handleNodeDoubleClick = useCallback<NodeMouseHandler<PersonFlowNode>>((_, node) => onOpenFamily?.(node.id), [onOpenFamily]);
  const handleNodeContextMenu = useCallback<NodeMouseHandler<PersonFlowNode>>((event, node) => { event.preventDefault(); onNodeMenu?.(node.id, event.clientX, event.clientY); }, [onNodeMenu]);
  const handlePaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => { event.preventDefault(); onPaneMenu?.(event.clientX, event.clientY); }, [onPaneMenu]);
  const miniMapColor = useCallback((node: PersonFlowNode) => {
    const { highlight } = node.data;
    if (highlight === 'selected') return theme === 'dark' ? '#fafafa' : '#18181b';
    if (highlight !== 'normal' && highlight !== 'dimmed') return relationStyles[highlight].hex;
    return node.data.person.gender === 'F' ? '#f472b6' : node.data.person.gender === 'M' ? '#38bdf8' : '#a1a1aa';
  }, [theme]);

  return (
    <div ref={containerRef} className="size-full">
      <ReactFlow<PersonFlowNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} colorMode={theme} onNodeClick={handleNodeClick} onNodeDoubleClick={handleNodeDoubleClick} onNodeContextMenu={handleNodeContextMenu} onPaneContextMenu={handlePaneContextMenu} zoomOnDoubleClick={false} onPaneClick={handlePaneClick} onMoveStart={handleMoveStart} ariaLabelConfig={POLISH_ARIA_LABELS} nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} minZoom={0.1} maxZoom={2} fitView fitViewOptions={FIT_VIEW_OPTIONS}>
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="text-zinc-300 dark:text-zinc-800" color="currentColor" />
        <Controls showInteractive={false} position="bottom-left" fitViewOptions={FIT_VIEW_OPTIONS} onFitView={handleFitView} />
        <MiniMap<PersonFlowNode> pannable zoomable nodeColor={miniMapColor} nodeBorderRadius={6} maskColor={theme === 'dark' ? 'rgb(9 9 11 / 0.7)' : 'rgb(250 250 250 / 0.7)'} className="hidden! md:block!" />
      </ReactFlow>
    </div>
  );
}

export function FamilyGraph(props: FamilyGraphProps) {
  return (
    <ReactFlowProvider>
      <Graph {...props} />
    </ReactFlowProvider>
  );
}

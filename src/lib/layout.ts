import { Graph, layout as dagreLayout } from '@dagrejs/dagre';
import type { PeopleById } from '../types/person';
import { parseYear } from './dates';

export const NODE_WIDTH = 224;
export const NODE_HEIGHT = 76;
export const SPOUSE_GAP = 28;
export const ROW_GAP = 120;
const ROW_HEIGHT = NODE_HEIGHT + ROW_GAP;
const UNIT_GAP = 40;
const COMPONENT_GAP = 160;
// Packed families are laid out in rows about this many times wider than tall, which suits landscape screens.
const PACKING_ASPECT = 2;

export interface Point {
  x: number;
  y: number;
}

export interface TreeLayout {
  positions: Map<string, Point>;
  generations: Map<string, number>;
  generationCount: number;
}

interface ComponentLayout {
  positions: Map<string, Point>;
  generations: Map<string, number>;
  width: number;
  height: number;
  depth: number;
  size: number;
}

function findComponents(people: PeopleById): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const id of people.keys()) {
    if (visited.has(id)) continue;
    const component: string[] = [];
    const queue = [id];
    visited.add(id);
    while (queue.length) {
      const current = queue.shift()!;
      component.push(current);
      const person = people.get(current)!;
      for (const next of [...person.parents, ...person.children, ...person.spouses]) {
        if (people.has(next) && !visited.has(next)) { visited.add(next); queue.push(next); }
      }
    }
    components.push(component);
  }
  return components;
}

function byBirth(people: PeopleById) {
  return (a: string, b: string) => (parseYear(people.get(a)!.birthDate) ?? 9999) - (parseYear(people.get(b)!.birthDate) ?? 9999) || a.localeCompare(b);
}

// A unit is everyone joined by marriages: drawn as one block so spouses always sit side by side.
function buildUnits(component: string[], people: PeopleById): string[][] {
  const assigned = new Set<string>();
  const units: string[][] = [];
  for (const id of [...component].sort(byBirth(people))) {
    if (assigned.has(id)) continue;
    const members: string[] = [];
    const stack = [id];
    assigned.add(id);
    while (stack.length) {
      const current = stack.pop()!;
      members.push(current);
      for (const spouse of people.get(current)!.spouses) if (people.has(spouse) && !assigned.has(spouse)) { assigned.add(spouse); stack.push(spouse); }
    }
    units.push(orderMembers(members, people));
  }
  return units;
}

// Keeps every married pair adjacent: a chain of remarriages is laid out along the chain, and someone with several spouses sits in the middle of them.
function orderMembers(members: string[], people: PeopleById): string[] {
  if (members.length === 1) return members;
  const inUnit = new Set(members);
  const spousesIn = (id: string) => people.get(id)!.spouses.filter((s) => inUnit.has(s));
  if (members.length === 2) return [...members].sort((a, b) => Number(people.get(b)!.gender === 'M') - Number(people.get(a)!.gender === 'M'));
  const isChain = members.every((id) => spousesIn(id).length <= 2);
  if (isChain) {
    const start = members.find((id) => spousesIn(id).length === 1) ?? members[0]!;
    const order = [start];
    const seen = new Set(order);
    for (let current = start; ;) {
      const next = spousesIn(current).find((s) => !seen.has(s));
      if (!next) break;
      order.push(next);
      seen.add(next);
      current = next;
    }
    return order.length === members.length ? order : members;
  }
  const hub = [...members].sort((a, b) => spousesIn(b).length - spousesIn(a).length)[0]!;
  const others = members.filter((m) => m !== hub);
  const half = Math.ceil(others.length / 2);
  return [...others.slice(0, half), hub, ...others.slice(half)];
}

function unitWidth(size: number): number {
  return size * NODE_WIDTH + (size - 1) * SPOUSE_GAP;
}

interface SiblingGroup {
  units: Set<string>;
  rankOf: Map<string, { year: number; index: number }>;
}

// For each family, its children's blocks with the key they are ordered by: birth year, unknown years last in their original order.
function siblingGroups(units: string[][], unitOf: Map<string, number>, people: PeopleById): SiblingGroup[] {
  const groups: SiblingGroup[] = [];
  units.forEach((members, parentUnit) => {
    const rankOf = new Map<string, { year: number; index: number }>();
    for (const id of members) for (const childId of people.get(id)!.children) {
      const unit = unitOf.get(childId);
      if (unit === undefined || unit === parentUnit || rankOf.has(String(unit))) continue;
      rankOf.set(String(unit), { year: parseYear(people.get(childId)!.birthDate) ?? Number.POSITIVE_INFINITY, index: rankOf.size });
    }
    if (rankOf.size > 1) groups.push({ units: new Set(rankOf.keys()), rankOf });
  });
  return groups;
}

type OrderGraph = { nodes(): string[]; node(v: string): { rank?: number; order?: number }; predecessors(v: string): string[] | undefined | void };

// Dagre only treats ordering constraints as hints, so siblings are put oldest-to-youngest after its crossing reduction:
// row by row, each sibling group is permuted within the slots it already occupies, and the row below is re-sorted under the new
// order (by the average position of each block's parents) so children follow their parents and lines do not cross.
function enforceSiblingOrder(graph: OrderGraph, groups: SiblingGroup[]) {
  const rows: string[][] = [];
  for (const v of graph.nodes()) {
    const label = graph.node(v);
    if (label.rank === undefined) continue;
    (rows[label.rank] ??= []).push(v);
  }
  rows.forEach((row, rank) => {
    if (!row) return;
    row.sort((a, b) => graph.node(a).order! - graph.node(b).order!);
    if (rank > 0) {
      const barycenter = new Map<string, number>();
      for (const v of row) {
        const parents = (graph.predecessors(v) || []).map((p) => graph.node(p).order!);
        if (parents.length) barycenter.set(v, parents.reduce((a, b) => a + b, 0) / parents.length);
      }
      const movable = row.filter((v) => barycenter.has(v));
      const sorted = [...movable].sort((a, b) => barycenter.get(a)! - barycenter.get(b)! || graph.node(a).order! - graph.node(b).order!);
      let next = 0;
      for (let i = 0; i < row.length; i++) if (barycenter.has(row[i]!)) row[i] = sorted[next++]!;
    }
    for (const group of groups) {
      const slots = row.map((v, i) => (group.units.has(v) ? i : -1)).filter((i) => i >= 0);
      if (slots.length < 2) continue;
      const ordered = slots.map((i) => row[i]!).sort((a, b) => { const ra = group.rankOf.get(a)!; const rb = group.rankOf.get(b)!; return ra.year - rb.year || ra.index - rb.index; });
      slots.forEach((slot, i) => { row[slot] = ordered[i]!; });
    }
    row.forEach((v, i) => { graph.node(v).order = i; });
  });
}

function layoutComponent(component: string[], people: PeopleById): ComponentLayout {
  const units = buildUnits(component, people);
  const unitOf = new Map<string, number>();
  units.forEach((members, index) => members.forEach((id) => unitOf.set(id, index)));

  const graph = new Graph();
  graph.setGraph({ rankdir: 'TB', nodesep: UNIT_GAP, edgesep: 20, ranksep: ROW_GAP, ranker: 'network-simplex' });
  graph.setDefaultEdgeLabel(() => ({}));
  units.forEach((members, index) => graph.setNode(String(index), { width: unitWidth(members.length), height: NODE_HEIGHT }));
  units.forEach((members, index) => {
    for (const id of members) for (const childId of people.get(id)!.children) {
      const childUnit = unitOf.get(childId);
      if (childUnit === undefined || childUnit === index) continue;
      graph.setEdge(String(index), String(childUnit), { minlen: 1, weight: 1 });
    }
  });
  const groups = siblingGroups(units, unitOf, people);
  dagreLayout(graph, { customOrder: (layered, order) => { order(layered); enforceSiblingOrder(layered as unknown as OrderGraph, groups); } });

  const positions = new Map<string, Point>();
  units.forEach((members, index) => {
    const node = graph.node(String(index)) as { x: number; y: number };
    const left = node.x - unitWidth(members.length) / 2;
    members.forEach((id, i) => positions.set(id, { x: left + i * (NODE_WIDTH + SPOUSE_GAP), y: node.y - NODE_HEIGHT / 2 }));
  });
  sideSpousesTowardTheirParents(units, positions, people);

  const xs = [...positions.values()].map((p) => p.x);
  const ys = [...positions.values()].map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const generations = new Map<string, number>();
  for (const [id, point] of positions) {
    positions.set(id, { x: point.x - minX, y: point.y - minY });
    generations.set(id, Math.round((point.y - minY) / ROW_HEIGHT));
  }
  const depth = Math.max(...generations.values()) + 1;
  return { positions, generations, width: Math.max(...xs) - minX + NODE_WIDTH, height: (depth - 1) * ROW_HEIGHT + NODE_HEIGHT, depth, size: component.length };
}

// In a couple, the partner whose parents are drawn to the left should stand on the left, so both parent lines stay short and do not cross.
function sideSpousesTowardTheirParents(units: string[][], positions: Map<string, Point>, people: PeopleById) {
  const parentsX = (id: string) => {
    const xs = people.get(id)!.parents.map((p) => positions.get(p)?.x).filter((x): x is number => x !== undefined);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
  };
  for (const members of units) {
    if (members.length !== 2) continue;
    const [a, b] = members as [string, string];
    const pa = parentsX(a);
    const pb = parentsX(b);
    const center = (positions.get(a)!.x + positions.get(b)!.x) / 2;
    const swap = pa !== undefined && pb !== undefined ? pa > pb : pa !== undefined ? pa > center : pb !== undefined ? pb < center : false;
    if (!swap) continue;
    const pointA = positions.get(a)!;
    positions.set(a, positions.get(b)!);
    positions.set(b, pointA);
    members.reverse();
  }
}

// Shelf packing: largest families first, filling rows up to a target width so many small families do not stretch into one endless line.
function packComponents(layouts: ComponentLayout[]): { offsets: Point[]; generationCount: number } {
  const order = layouts.map((_, i) => i).sort((a, b) => layouts[b]!.size - layouts[a]!.size);
  const area = layouts.reduce((sum, l) => sum + (l.width + COMPONENT_GAP) * (l.height + COMPONENT_GAP), 0);
  const targetWidth = Math.max(...layouts.map((l) => l.width), Math.sqrt(area * PACKING_ASPECT));
  const offsets: Point[] = new Array(layouts.length);
  let x = 0;
  let y = 0;
  let shelfHeight = 0;
  for (const index of order) {
    const l = layouts[index]!;
    if (x > 0 && x + l.width > targetWidth) { x = 0; y += shelfHeight + COMPONENT_GAP; shelfHeight = 0; }
    offsets[index] = { x, y };
    x += l.width + COMPONENT_GAP;
    shelfHeight = Math.max(shelfHeight, l.height);
  }
  return { offsets, generationCount: Math.max(0, ...layouts.map((l) => l.depth)) };
}

export function computeLayout(people: PeopleById): TreeLayout {
  const layouts = findComponents(people).map((component) => layoutComponent(component, people));
  const { offsets, generationCount } = packComponents(layouts);
  const positions = new Map<string, Point>();
  const generations = new Map<string, number>();
  layouts.forEach((l, index) => {
    const offset = offsets[index]!;
    for (const [id, point] of l.positions) positions.set(id, { x: point.x + offset.x, y: point.y + offset.y });
    for (const [id, gen] of l.generations) generations.set(id, gen);
  });
  return { positions, generations, generationCount };
}


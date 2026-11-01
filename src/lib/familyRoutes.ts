import type { PeopleById } from '../types/person';
import { NODE_HEIGHT, NODE_WIDTH, ROW_GAP, SPOUSE_GAP, type Point, type TreeLayout } from './layout';

export interface FamilyRoute {
  key: string;
  parentIds: string[];
  childIds: string[];
  tops: Point[];
  barY: number;
  childTops: Map<string, Point>;
}

const LANE_MARGIN = 16;

function familyKey(parentIds: string[]): string {
  return [...parentIds].sort().join('+');
}

function bottomCenter(point: Point): Point {
  return { x: point.x + NODE_WIDTH / 2, y: point.y + NODE_HEIGHT };
}

// Two parents standing side by side as a couple share one drop line from the middle of their spouse line; otherwise each parent gets its own drop to the family bar.
function familyTops(parentIds: string[], people: PeopleById, layout: TreeLayout): Point[] {
  const positions = parentIds.map((id) => layout.positions.get(id)!);
  if (positions.length === 2) {
    const [a, b] = positions as [Point, Point];
    const adjacentCouple = a.y === b.y && Math.abs(a.x - b.x) === NODE_WIDTH + SPOUSE_GAP && people.get(parentIds[0]!)!.spouses.includes(parentIds[1]!);
    if (adjacentCouple) return [{ x: (a.x + b.x) / 2 + NODE_WIDTH / 2, y: a.y + NODE_HEIGHT / 2 }];
  }
  return positions.map(bottomCenter);
}

export function computeFamilyRoutes(people: PeopleById, layout: TreeLayout): FamilyRoute[] {
  const families = new Map<string, { parentIds: string[]; childIds: string[] }>();
  for (const child of people.values()) {
    const parentIds = child.parents.filter((id) => layout.positions.has(id));
    if (!parentIds.length || !layout.positions.has(child.id)) continue;
    const key = familyKey(parentIds);
    const family = families.get(key) ?? { parentIds, childIds: [] };
    family.childIds.push(child.id);
    families.set(key, family);
  }

  const routes: (Omit<FamilyRoute, 'barY'> & { gapTop: number; minX: number; maxX: number })[] = [];
  for (const [key, { parentIds, childIds }] of families) {
    const tops = familyTops(parentIds, people, layout);
    const childTops = new Map(childIds.map((id) => { const p = layout.positions.get(id)!; return [id, { x: p.x + NODE_WIDTH / 2, y: p.y }] as const; }));
    const xs = [...tops.map((t) => t.x), ...[...childTops.values()].map((c) => c.x)];
    const gapTop = Math.max(...parentIds.map((id) => layout.positions.get(id)!.y)) + NODE_HEIGHT;
    routes.push({ key, parentIds, childIds, tops, childTops, gapTop, minX: Math.min(...xs), maxX: Math.max(...xs) });
  }

  // Families whose horizontal bars would overlap in the same row gap are put on separate lanes (interval colouring), so no two families share a line.
  const byGap = new Map<number, typeof routes>();
  for (const route of routes) byGap.set(route.gapTop, [...(byGap.get(route.gapTop) ?? []), route]);

  const result: FamilyRoute[] = [];
  for (const [gapTop, group] of byGap) {
    group.sort((a, b) => a.minX - b.minX || a.maxX - b.maxX);
    const laneEnds: number[] = [];
    const lanes = group.map((route) => {
      let lane = laneEnds.findIndex((end) => end + LANE_MARGIN < route.minX);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(route.maxX); } else laneEnds[lane] = route.maxX;
      return lane;
    });
    const step = ROW_GAP / (laneEnds.length + 1);
    group.forEach((route, index) => result.push({ key: route.key, parentIds: route.parentIds, childIds: route.childIds, tops: route.tops, childTops: route.childTops, barY: gapTop + step * (lanes[index]! + 1) }));
  }
  return result;
}

export interface FamilySegment {
  key: string;
  path: string;
  // Children whose line runs along this piece; it is drawn once, in the colour of the most important of them.
  childIds: string[];
}

// A family's lines cut into pieces that are each drawn once: overlapping copies of the same stroke make shared lines look thicker.
export function familySegments(route: FamilyRoute): FamilySegment[] {
  const topXs = route.tops.map((t) => t.x);
  const spanOf = (childId: string) => { const xs = [...topXs, route.childTops.get(childId)!.x]; return [Math.min(...xs), Math.max(...xs)] as const; };
  const segments: FamilySegment[] = route.tops.map((t, i) => ({ key: `drop:${i}`, path: `M ${t.x} ${t.y} V ${route.barY}`, childIds: route.childIds }));
  const stops = [...new Set([...topXs, ...[...route.childTops.values()].map((c) => c.x)])].sort((a, b) => a - b);
  for (let i = 1; i < stops.length; i++) {
    const [x1, x2] = [stops[i - 1]!, stops[i]!];
    const users = route.childIds.filter((id) => { const [from, to] = spanOf(id); return from <= x1 && to >= x2; });
    if (users.length) segments.push({ key: `bar:${x1}`, path: `M ${x1} ${route.barY} H ${x2}`, childIds: users });
  }
  for (const [childId, top] of route.childTops) segments.push({ key: `child:${childId}`, path: `M ${top.x} ${route.barY} V ${top.y}`, childIds: [childId] });
  return segments;
}

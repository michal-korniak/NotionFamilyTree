interface Branch { d: string; width: number }
interface Leaf { x: number; y: number; r: number }

// Seeded so the tree has the same shape on every visit instead of reshuffling on each render.
function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function growTree(): { branches: Branch[]; leaves: Leaf[] } {
  const random = seededRandom(1923);
  const branches: Branch[] = [];
  const leaves: Leaf[] = [];
  const grow = (x: number, y: number, angle: number, length: number, depth: number) => {
    const endX = x + Math.cos(angle) * length;
    const endY = y + Math.sin(angle) * length;
    const bend = (random() - 0.5) * length * 0.35;
    const controlX = (x + endX) / 2 + Math.cos(angle + Math.PI / 2) * bend;
    const controlY = (y + endY) / 2 + Math.sin(angle + Math.PI / 2) * bend;
    branches.push({ d: `M${x.toFixed(1)} ${y.toFixed(1)}Q${controlX.toFixed(1)} ${controlY.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`, width: Math.max(0.6, depth * depth * 0.22) });
    if (depth === 0) { leaves.push({ x: endX, y: endY, r: 2.5 + random() * 3.5 }); return; }
    const children = depth > 5 ? 2 : 2 + (random() < 0.35 ? 1 : 0);
    for (let i = 0; i < children; i++) {
      const spread = 0.42 + random() * 0.3;
      const offset = children === 1 ? 0 : (i / (children - 1) - 0.5) * 2 * spread;
      grow(endX, endY, angle + offset + (random() - 0.5) * 0.25, length * (0.7 + random() * 0.12), depth - 1);
    }
  };
  grow(500, 1000, -Math.PI / 2, 190, 8);
  return { branches, leaves };
}

const tree = growTree();

export function TreeBackdrop() {
  return (
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMax meet" aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[95vh] w-full text-zinc-300/70 [mask-image:radial-gradient(ellipse_at_50%_60%,black_35%,transparent_75%)] dark:text-zinc-700/50">
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        {tree.branches.map((branch, i) => <path key={i} d={branch.d} strokeWidth={branch.width} />)}
      </g>
      <g fill="currentColor">
        {tree.leaves.map((leaf, i) => <circle key={i} cx={leaf.x} cy={leaf.y} r={leaf.r} opacity={0.55} />)}
      </g>
    </svg>
  );
}

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { Person } from '../types/person';
import { formatLifeYears, isDeceased } from '../lib/dates';
import { NODE_HEIGHT, NODE_WIDTH } from '../lib/layout';
import { Avatar } from './Avatar';
import { displayName } from '../lib/names';
import { relationLabel, relationStyles, type Relation } from '../lib/relationColors';

export type HighlightState = 'selected' | Relation | 'dimmed' | 'normal';

export type PersonNodeData = { person: Person; highlight: HighlightState; hiddenRelatives?: number; unionKind?: string };

export type PersonFlowNode = Node<PersonNodeData, 'person'>;

// The background tells gender at a glance; the border (and ring) carries selection and relation. Border colours live only in the
// state classes, because a shared base border colour on the card would override the relation colour.
const genderBackground: Record<Person['gender'], string> = {
  M: 'bg-sky-50 dark:bg-sky-950/60',
  F: 'bg-pink-50 dark:bg-pink-950/50',
  U: 'bg-white dark:bg-zinc-900',
};

const restingBorder: Record<Person['gender'], string> = {
  M: 'border-sky-200 dark:border-sky-900',
  F: 'border-pink-200 dark:border-pink-900',
  U: 'border-zinc-200 dark:border-zinc-800',
};

function stateClasses(highlight: HighlightState, gender: Person['gender']): string {
  if (highlight === 'selected') return 'border-zinc-900 shadow-md ring-4 ring-zinc-900/5 dark:border-zinc-100 dark:ring-zinc-100/10';
  if (highlight === 'dimmed') return `${restingBorder[gender]} opacity-35`;
  if (highlight === 'normal') return `${restingBorder[gender]} shadow-xs hover:border-zinc-400 hover:shadow-md dark:hover:border-zinc-600`;
  return relationStyles[highlight].node;
}

function isRelation(highlight: HighlightState): highlight is Relation {
  return highlight in relationStyles;
}

const hiddenHandle = 'size-1! min-h-0! min-w-0! border-0! bg-transparent!';

function PersonNodeComponent({ data }: NodeProps<PersonFlowNode>) {
  const { person, highlight, hiddenRelatives, unionKind } = data;
  return (
    <div style={{ width: NODE_WIDTH, height: NODE_HEIGHT }} className={`group relative flex cursor-pointer items-center gap-3 rounded-lg border px-3 transition-all duration-150 ${genderBackground[person.gender]} ${stateClasses(highlight, person.gender)}`}>
      <Handle type="target" position={Position.Top} id="top" className={hiddenHandle} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={hiddenHandle} isConnectable={false} />
      <Handle type="target" position={Position.Left} id="left" className={hiddenHandle} isConnectable={false} />
      <Handle type="source" position={Position.Right} id="right" className={hiddenHandle} isConnectable={false} />
      {isRelation(highlight) && <span className={`pointer-events-none absolute -top-2.5 left-3 rounded-full border px-2 py-px text-[10px] leading-4 font-medium ${relationStyles[highlight].badge}`}>{relationLabel(highlight, person.gender, unionKind)}</span>}
      {hiddenRelatives ? <span title={`Niewidoczni krewni: ${hiddenRelatives} — kliknij dwukrotnie, aby pokazać rodzinę tej osoby`} className="pointer-events-auto absolute -right-2 -bottom-2 rounded-full border border-zinc-200 bg-white px-1.5 font-mono text-[10px] leading-4 text-zinc-500 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">+{hiddenRelatives}</span> : null}
      <Avatar name={displayName(person)} gender={person.gender} deceased={isDeceased(person)} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100" title={displayName(person)}>{displayName(person)}</div>
        {formatLifeYears(person) && <div className="mt-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">{formatLifeYears(person)}</div>}
      </div>
    </div>
  );
}

export const PersonNode = memo(PersonNodeComponent);

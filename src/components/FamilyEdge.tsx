import { memo } from 'react';
import { BaseEdge, type Edge, type EdgeProps } from '@xyflow/react';

export type FamilyEdgeData = { path: string };

export type FamilyFlowEdge = Edge<FamilyEdgeData, 'family'>;

// React Flow routes edges between handles; family lines need a shared drop from the couple and a per-family bar, so the path is precomputed in familyRoutes and only drawn here.
function FamilyEdgeComponent({ id, data, style }: EdgeProps<FamilyFlowEdge>) {
  return <BaseEdge id={id} path={data?.path ?? ''} style={style} />;
}

export const FamilyEdge = memo(FamilyEdgeComponent);

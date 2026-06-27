import type { Quaternion, Vector3Tuple } from 'three';

export type FrameId = string;
export type AxisName = 'X' | 'Y' | 'Z';

export type CubieType = 'outer' | 'hole' | 'corner' | 'edge' | 'innerWall';

export type TwistAngle = 90 | -90 | 180;

export type InteractionTier = 'competitive-manual' | 'assisted-manual' | 'research-evaluation';
export type TurnTargetKind = 'frame' | 'extension';
export type ExtensionTargetFamily = 'block' | 'slab';

export interface Move {
  frameId: FrameId;
  angle: TwistAngle;
  notation: string;
  timestamp: number;
  targetId?: string;
  targetKind?: TurnTargetKind;
  // cubie rotation fields — when cubieId is set, this is an in-place cubie rotation
  cubieId?: string;
  cubieAxis?: Vector3Tuple;
  extensionTargetId?: string;
}

export interface Cubie {
  id: string;
  homePosition: Vector3Tuple;
  currentPosition: Vector3Tuple;
  orientation: Quaternion;
  type: CubieType;
}

export interface RotationFrame {
  id: FrameId;
  name: string;
  axisName: AxisName;
  axis: Vector3Tuple;
  layer: number;       // center coordinate of this frame's layers
  scale: number;       // 1 = single layer, 3 = 3-layer block, 9 = 9-layer block, etc.
  groupIndex: number;  // 0-based index within same axis+scale
  extent: number;
  kind: 'slice' | 'core';
  selector: (position: Vector3Tuple) => boolean;
  color: string;
  radius: number;
}

export interface TurnTarget {
  id: string;
  kind: TurnTargetKind;
  family?: ExtensionTargetFamily;
  name: string;
  axisName: AxisName;
  axis: Vector3Tuple;
  scale: number;
  depth: number;
  pivot: Vector3Tuple;
  selector: (position: Vector3Tuple) => boolean;
  affectedCountEstimate: number;
}

/**
 * The pure puzzle-mechanics state: positions, orientations, and the turn
 * targets that can be applied to them. Deliberately excludes any
 * interaction/UI concept (selection, history, animation) so it can be
 * shared by the Play app, the solver, and the benchmark CLI without any of
 * them depending on the others.
 */
export interface MengerPuzzleState {
  level: number;
  interactionTier: InteractionTier;
  frames: RotationFrame[];
  frameById: Map<FrameId, RotationFrame>;
  turnTargets: TurnTarget[];
  turnTargetById: Map<string, TurnTarget>;
  cubies: Cubie[];
}

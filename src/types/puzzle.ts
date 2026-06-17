import type { Quaternion, Vector3Tuple } from 'three';

export type FrameId = string;
export type AxisName = 'X' | 'Y' | 'Z';

export type CubieType = 'outer' | 'hole' | 'corner' | 'edge' | 'innerWall';

export type TwistAngle = 90 | -90 | 180;

export type InteractionMode = 'slice' | 'cubie';

export interface Move {
  frameId: FrameId;
  angle: TwistAngle;
  notation: string;
  timestamp: number;
  // cubie rotation fields — when cubieId is set, this is an in-place cubie rotation
  cubieId?: string;
  cubieAxis?: Vector3Tuple;
}

export interface Cubie {
  id: string;
  homePosition: Vector3Tuple;
  currentPosition: Vector3Tuple;
  orientation: Quaternion;
  type: CubieType;
}

export interface PuzzleState {
  level: number;
  frames: RotationFrame[];
  frameById: Map<FrameId, RotationFrame>;
  cubies: Cubie[];
  moveHistory: Move[];
  redoStack: Move[];
  selectedFrame: FrameId | null;
  selectedCubie: string | null;
  isAnimating: boolean;
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

export interface DragPreview {
  frameId?: FrameId;
  cubieId?: string;
  cubieAxis?: Vector3Tuple;
  angle: number;
}

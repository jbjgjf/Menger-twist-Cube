import type { Quaternion, Vector3Tuple } from 'three';

export type FrameId = string;
export type AxisName = 'X' | 'Y' | 'Z';

export type CubieType = 'outer' | 'hole' | 'corner' | 'edge' | 'innerWall';

export type TwistAngle = 90 | -90 | 180;

export interface Move {
  frameId: FrameId;
  angle: TwistAngle;
  notation: string;
  timestamp: number;
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
  isAnimating: boolean;
}

export interface RotationFrame {
  id: FrameId;
  name: string;
  axisName: AxisName;
  axis: Vector3Tuple;
  layer: number;
  extent: number;
  kind: 'slice' | 'core';
  selector: (position: Vector3Tuple) => boolean;
  color: string;
  radius: number;
}

export interface DragPreview {
  frameId: FrameId;
  angle: number;
}

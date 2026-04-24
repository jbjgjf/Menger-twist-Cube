import type { Quaternion, Vector3Tuple } from 'three';

export type FrameId =
  | 'X_PLUS'
  | 'X_MINUS'
  | 'Y_PLUS'
  | 'Y_MINUS'
  | 'Z_PLUS'
  | 'Z_MINUS'
  | 'H_X'
  | 'H_Y'
  | 'H_Z';

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
  cubies: Cubie[];
  moveHistory: Move[];
  redoStack: Move[];
  selectedFrame: FrameId | null;
  isAnimating: boolean;
}

export interface RotationFrame {
  id: FrameId;
  name: string;
  axis: Vector3Tuple;
  selector: (position: Vector3Tuple) => boolean;
  color: string;
  radius: number;
}

export interface DragPreview {
  frameId: FrameId;
  angle: number;
}

// Play-app-only types layered on top of the shared, UI-agnostic puzzle
// mechanics in `@menger/engine`. `MengerPuzzleState` (positions, frames,
// turn targets) lives in the engine package because the solver needs it
// too; `PuzzleState` below adds the interaction/history/animation fields
// that only this app cares about, so the solver package never sees them.
export type {
  AxisName,
  Cubie,
  CubieType,
  ExtensionTargetFamily,
  FrameId,
  InteractionTier,
  MengerPuzzleState,
  Move,
  RotationFrame,
  TurnTarget,
  TurnTargetKind,
  TwistAngle,
} from '@menger/engine';

import type { FrameId, MengerPuzzleState, Move } from '@menger/engine';
import type { Vector3Tuple } from 'three';

export type InteractionMode = 'slice' | 'cubie';

export interface DragPreview {
  frameId?: FrameId;
  cubieId?: string;
  cubieAxis?: Vector3Tuple;
  extensionTargetId?: string;
  angle: number;
}

export interface PuzzleState extends MengerPuzzleState {
  moveHistory: Move[];
  redoStack: Move[];
  selectedFrame: FrameId | null;
  selectedCubie: string | null;
  selectedExtension: string | null;
  isAnimating: boolean;
}

import type { FrameId, TurnTargetKind, TwistAngle } from '@menger/engine';
import type { PuzzleModel } from '../model/puzzleModel';

export interface SolverMove {
  targetKind: TurnTargetKind;
  targetId: string;
  frameId?: FrameId;
  extensionTargetId?: string;
  angle: TwistAngle;
  notation: string;
  reason: string;
}

export interface SolverProgress {
  solvedCubies: number;
  positionSolved: number;
  cornerOrientationSolved: number;
  edgeFrameSolved: number;
  extensionSolved: number;
  totalCubies: number;
  totalCorners: number;
  totalEdges: number;
}

export interface SolverInputState {
  level: number;
  cubieCount: number;
  stateKey: string;
  progress: SolverProgress;
}

export interface SolverExplanationStep {
  phase: string;
  objective: string;
  observation: string;
  selectedMove?: string;
  reason?: string;
  progress: SolverProgress;
}

export interface SolverRunResult {
  name: string;
  version: string;
  level_supported: number[];
  input_state: SolverInputState;
  output_moves: SolverMove[];
  runtime_ms: number;
  move_count: number;
  success: boolean;
  explanation: SolverExplanationStep[];
  final_strategy: string;
  complexity_estimate: string;
  notes: string;
}

/**
 * The contract every solver implementation registers under. An algorithm is
 * given a `PuzzleModel` plus a concrete state and must return a structured
 * `SolverRunResult` — it never reaches into Play-app/React state, and the
 * registry/benchmark runner never need to know an algorithm's internals.
 *
 * `TState`/`TMove` are intentionally generic: today only one model
 * (`mengerPuzzleModel`) exists, but the registry and benchmark runner do not
 * hardcode that — a future puzzle model can register its own algorithms
 * against this same interface.
 */
export interface SolverAlgorithm<TState = unknown, TMove = unknown> {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly levelsSupported: readonly number[];
  solve(model: PuzzleModel<TState, TMove>, state: TState): Promise<SolverRunResult>;
}

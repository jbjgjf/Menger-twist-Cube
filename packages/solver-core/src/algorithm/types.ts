import type { FrameId, TurnTargetKind, TwistAngle } from '../types/puzzle';

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

export interface SolverBenchmarkRecord {
  id: string;
  timestamp: string;
  level: number;
  algorithm: string;
  runtime_ms: number;
  move_count: number;
  success: boolean;
  complexity_estimate: string;
  notes: string;
  determinism: 'deterministic' | 'non-deterministic';
  explainability: 'structured' | 'partial' | 'none';
  scalability: string;
}

export interface SolverAlgorithm {
  name: string;
  version: string;
  level_supported: number[];
  solve: () => SolverRunResult | Promise<SolverRunResult>;
}

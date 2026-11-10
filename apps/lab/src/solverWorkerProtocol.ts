import type { MoveSystem } from '@menger/engine';
import type { BenchmarkRunResult, BenchmarkRunSpec, SolverDebugEvent, SolverRunResult } from '@menger/solver-core';

export interface SerializedCubieState {
  id: string;
  currentPosition: [number, number, number];
  orientation: [number, number, number, number];
}

/**
 * A moves-vs-compute comparison: every listed solver solves the identical
 * scramble of every seed, so their points on the trade-off chart are paired.
 */
export interface CompareSpec {
  level: number;
  algorithmIds: string[];
  /** Whose generator set scrambles the shared inputs (the level's reference solver). */
  scrambleAlgorithmId: string;
  seeds: number[];
  length: number;
}

export interface CompareRun {
  algorithmId: string;
  seed: number;
  /** Wall-clock time of one `solve` call in the worker, after a warm-up solve. */
  wallMs: number;
  moveCount: number;
  success: boolean;
  notes: string;
}

export type SolverWorkerRequest =
  | {
      kind: 'scramble';
      algorithmId: string;
      moveSystem: MoveSystem;
      level: number;
      seed: number;
      length: number;
    }
  | {
      kind: 'solve';
      algorithmId: string;
      moveSystem: MoveSystem;
      level: number;
      cubies: SerializedCubieState[];
    }
  | {
      kind: 'benchmark';
      algorithmId: string;
      moveSystem: MoveSystem;
      spec: BenchmarkRunSpec;
    }
  | {
      kind: 'compare';
      moveSystem: MoveSystem;
      spec: CompareSpec;
    };

export type SolverWorkerResponse =
  | { kind: 'debug'; event: SolverDebugEvent }
  | { kind: 'scramble-result'; result: { cubies: SerializedCubieState[]; moveCount: number } }
  | { kind: 'solve-result'; result: SolverRunResult }
  | { kind: 'benchmark-result'; result: BenchmarkRunResult }
  | { kind: 'compare-run'; run: CompareRun }
  | { kind: 'compare-done' }
  | { kind: 'error'; message: string; stack?: string };

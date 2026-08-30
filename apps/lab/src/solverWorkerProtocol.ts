import type { BenchmarkRunResult, BenchmarkRunSpec, SolverDebugEvent, SolverRunResult } from '@menger/solver-core';

export interface SerializedCubieState {
  id: string;
  currentPosition: [number, number, number];
  orientation: [number, number, number, number];
}

export type SolverWorkerRequest =
  | {
      kind: 'solve';
      algorithmId: string;
      level: number;
      cubies: SerializedCubieState[];
    }
  | {
      kind: 'benchmark';
      algorithmId: string;
      spec: BenchmarkRunSpec;
    };

export type SolverWorkerResponse =
  | { kind: 'debug'; event: SolverDebugEvent }
  | { kind: 'solve-result'; result: SolverRunResult }
  | { kind: 'benchmark-result'; result: BenchmarkRunResult }
  | { kind: 'error'; message: string; stack?: string };

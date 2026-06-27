// Registers built-in algorithms (currently just `level1-quotient`) as a
// side effect of importing this package's entry point.
import './algorithms/register';

export type { PuzzleModel } from './model/puzzleModel';
export { mengerPuzzleModel } from './model/mengerPuzzleModel';

export type {
  SolverAlgorithm,
  SolverExplanationStep,
  SolverInputState,
  SolverMove,
  SolverProgress,
  SolverRunResult,
} from './algorithm/types';
export { registerAlgorithm, getAlgorithm, listAlgorithms } from './algorithm/registry';

export { level1QuotientAlgorithm, warmLevel1Solver } from './algorithms/level1QuotientSolver';

export type { BenchmarkRunContext } from './benchmark/recordFromRun';
export type { BenchmarkRunResult, BenchmarkRunSpec } from './benchmark/runner';
export type { BenchmarkSummary, SolverBenchmarkRecord } from './benchmark/types';
export { runBenchmark } from './benchmark/runner';
export { summarizeBenchmarkRecords } from './benchmark/summarize';
export { createSeededRng, scrambleState } from './benchmark/scramble';
export { createLocalStorageBenchmarkStore } from './benchmark/storage/localStorageStore';
export type { BenchmarkStore } from './benchmark/storage/localStorageStore';

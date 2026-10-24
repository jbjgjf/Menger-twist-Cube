// Registers built-in algorithms (`level1-quotient`, `level2-block-quotient`,
// `level2-slice-reduction`, `level3-block-quotient`, `level3-slice-reduction`,
// `level4-slice-reduction`) as a side effect of
// importing this package's entry point.
import './algorithms/register';

export type { PuzzleModel } from './model/puzzleModel';
export { createMengerPuzzleModel, innerSquareMengerPuzzleModel, mengerPuzzleModel } from './model/mengerPuzzleModel';

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
export { level2BlockQuotientAlgorithm, warmLevel2Solver } from './algorithms/level2BlockQuotientSolver';
export { level2SliceReductionAlgorithm, warmLevel2SliceReductionSolver } from './algorithms/level2SliceReductionSolver';
export { level2InnerSquareCosetAlgorithm, innerSquareCosetOf } from './algorithms/level2InnerSquareCosetSolver';
export { level2CertifiedAlgorithm, warmLevel2CertifiedSolver } from './algorithms/level2CertifiedSolver';
export { level3BlockQuotientAlgorithm, warmLevel3BlockQuotientSolver } from './algorithms/level3BlockQuotientSolver';
export { level3SliceReductionAlgorithm, warmLevel3SliceReductionSolver } from './algorithms/level3SliceReductionSolver';
export { level4SliceReductionAlgorithm, warmLevel4SliceReductionSolver } from './algorithms/level4SliceReductionSolver';
export { onSolverDebug, emitSolverDebug } from './debug';
export type { SolverDebugEvent } from './debug';

export type { BenchmarkRunContext } from './benchmark/recordFromRun';
export type { BenchmarkRunResult, BenchmarkRunSpec } from './benchmark/runner';
export type { BenchmarkSummary, SolverBenchmarkRecord } from './benchmark/types';
export { runBenchmark } from './benchmark/runner';
export { summarizeBenchmarkRecords } from './benchmark/summarize';
export { createSeededRng, scrambleState } from './benchmark/scramble';
export { createLocalStorageBenchmarkStore } from './benchmark/storage/localStorageStore';
export type { BenchmarkStore } from './benchmark/storage/localStorageStore';

export { level2BlockRestorationAlgorithm } from './algorithms/level2BlockRestorationSolver';

export { level3BlockRestorationAlgorithm, level4BlockRestorationAlgorithm } from './algorithms/higherBlockRestorationSolver';

export { level3InnerSquareCertifiedAlgorithm, level4InnerSquareCertifiedAlgorithm } from './algorithms/innerSquareCertifiedSolver';

export { shareCommutatorSetup } from './algorithms/mengerSharedCorrection';

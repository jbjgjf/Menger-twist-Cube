// All solving logic, algorithm selection, and benchmark persistence live in
// `@menger/solver-core`. This module is intentionally thin: it just knows
// which registered algorithm id Play uses for which level and wires the
// generic solver-core API to the app's localStorage-backed benchmark panel.
import {
  createLocalStorageBenchmarkStore,
  getAlgorithm,
  mengerPuzzleModel,
  warmLevel1Solver,
  warmLevel2Solver,
  type SolverRunResult,
} from '@menger/solver-core';
import type { MengerPuzzleState } from '@menger/engine';

const algorithmIdByLevel: Record<number, string> = {
  1: 'level1-quotient',
  2: 'level2-block-quotient',
};
const benchmarkStore = createLocalStorageBenchmarkStore('menger.solver.benchmarks.v2');

export const algorithmIdForLevel = (level: number): string | null =>
  algorithmIdByLevel[level] ?? null;

export const isSolverAvailableForLevel = (level: number): boolean => {
  const algorithmId = algorithmIdForLevel(level);
  if (!algorithmId) return false;
  return getAlgorithm(algorithmId)?.levelsSupported.includes(level) ?? false;
};

export const runAndRecordSolve = async (state: MengerPuzzleState): Promise<SolverRunResult> => {
  const algorithmId = algorithmIdForLevel(state.level);
  const algorithm = algorithmId ? getAlgorithm(algorithmId) : undefined;
  if (!algorithm) {
    throw new Error(`No registered solver algorithm supports level ${state.level}.`);
  }

  const result = await algorithm.solve(mengerPuzzleModel, state);
  benchmarkStore.record(result, { algorithmId: algorithm.id, modelId: mengerPuzzleModel.id });
  return result;
};

export const warmSolverForLevel = (state: MengerPuzzleState): void => {
  if (state.level === 1) warmLevel1Solver(state);
  if (state.level === 2) warmLevel2Solver(state);
};

export const loadBenchmarkRecords = benchmarkStore.load;
export const clearBenchmarkRecords = benchmarkStore.clear;

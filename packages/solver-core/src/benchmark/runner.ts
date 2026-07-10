import type { PuzzleModel } from '../model/puzzleModel';
import type { SolverAlgorithm } from '../algorithm/types';
import type { BenchmarkSummary, SolverBenchmarkRecord } from './types';
import { benchmarkRecordFromRun } from './recordFromRun';
import { summarizeBenchmarkRecords } from './summarize';
import { createSeededRng, scrambleState } from './scramble';

export interface BenchmarkRunSpec {
  level: number;
  /** One run per seed. Reusing the same seed list reproduces the same scrambles. */
  scrambleSeeds: number[];
  scrambleLength?: number;
}

export interface BenchmarkRunResult {
  modelId: string;
  algorithmId: string;
  level: number;
  scrambleLength: number;
  generatedAt: string;
  records: SolverBenchmarkRecord[];
  summary: BenchmarkSummary;
}

const defaultScrambleLength = 20;

/**
 * Runs one algorithm against one model over a list of scramble seeds and
 * returns a fully reproducible, JSON-serializable result: same model +
 * algorithm + seed list always scrambles and solves the same way, which is
 * what makes the CLI's output diffable across commits and comparable across
 * algorithms.
 */
export const runBenchmark = async <TState, TMove>(
  model: PuzzleModel<TState, TMove>,
  algorithm: SolverAlgorithm<TState, TMove>,
  spec: BenchmarkRunSpec,
): Promise<BenchmarkRunResult> => {
  const scrambleLength = spec.scrambleLength ?? defaultScrambleLength;
  const records: SolverBenchmarkRecord[] = [];
  // Scramble within the algorithm's declared generator set when it has one,
  // so benchmark success measures the algorithm against its documented scope.
  const movePool = algorithm.scrambleMovePool
    ? (state: TState) => algorithm.scrambleMovePool!(model, state)
    : undefined;

  for (const seed of spec.scrambleSeeds) {
    const rng = createSeededRng(seed);
    const solvedState = model.createState(spec.level);
    const { state: scrambledState } = scrambleState(model, solvedState, rng, scrambleLength, movePool);
    const result = await algorithm.solve(model, scrambledState);
    records.push(
      benchmarkRecordFromRun(result, {
        algorithmId: algorithm.id,
        modelId: model.id,
        scrambleSeed: String(seed),
      }),
    );
  }

  return {
    modelId: model.id,
    algorithmId: algorithm.id,
    level: spec.level,
    scrambleLength,
    generatedAt: new Date().toISOString(),
    records,
    summary: summarizeBenchmarkRecords(records),
  };
};

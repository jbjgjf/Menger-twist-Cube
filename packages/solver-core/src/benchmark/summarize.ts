import type { BenchmarkSummary, SolverBenchmarkRecord } from './types';

export const summarizeBenchmarkRecords = (records: SolverBenchmarkRecord[]): BenchmarkSummary => {
  if (records.length === 0) {
    return {
      runs: 0,
      successRate: 0,
      averageRuntime: 0,
      averageMoveCount: 0,
    };
  }

  const successes = records.filter((record) => record.success);
  const runtimeTotal = records.reduce((total, record) => total + record.runtime_ms, 0);
  const moveTotal = successes.reduce((total, record) => total + record.move_count, 0);

  return {
    runs: records.length,
    successRate: successes.length / records.length,
    averageRuntime: runtimeTotal / records.length,
    averageMoveCount: successes.length === 0 ? 0 : moveTotal / successes.length,
  };
};

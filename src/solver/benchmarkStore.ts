import type { SolverBenchmarkRecord, SolverRunResult } from './types';

const storageKey = 'menger.solver.benchmarks.v1';
const maxRecords = 100;

const canUseLocalStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export const benchmarkRecordFromRun = (run: SolverRunResult): SolverBenchmarkRecord => ({
  id: `${Date.now()}-${run.name}-${run.move_count}`,
  timestamp: new Date().toISOString(),
  level: run.input_state.level,
  algorithm: `${run.name}@${run.version}`,
  runtime_ms: run.runtime_ms,
  move_count: run.move_count,
  success: run.success,
  complexity_estimate: run.complexity_estimate,
  notes: run.notes,
  determinism: 'deterministic',
  explainability: 'structured',
  scalability: run.input_state.level === 1
    ? 'Level 1 baseline; future algorithms can reuse the solver interface and benchmark schema for deeper levels.'
    : 'Unsupported level.',
});

export const loadBenchmarkRecords = (): SolverBenchmarkRecord[] => {
  if (!canUseLocalStorage()) return [];
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SolverBenchmarkRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveBenchmarkRecords = (records: SolverBenchmarkRecord[]) => {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(storageKey, JSON.stringify(records.slice(0, maxRecords)));
};

export const recordSolverRun = (run: SolverRunResult): SolverBenchmarkRecord[] => {
  const records = [benchmarkRecordFromRun(run), ...loadBenchmarkRecords()].slice(0, maxRecords);
  saveBenchmarkRecords(records);
  return records;
};

export const clearBenchmarkRecords = () => {
  if (!canUseLocalStorage()) return;
  window.localStorage.removeItem(storageKey);
};

export const summarizeBenchmarkRecords = (records: SolverBenchmarkRecord[]) => {
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

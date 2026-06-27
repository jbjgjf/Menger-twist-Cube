import type { SolverRunResult } from '../algorithm/types';
import type { SolverBenchmarkRecord } from './types';

export interface BenchmarkRunContext {
  algorithmId: string;
  modelId: string;
  scrambleSeed?: string | null;
}

export const benchmarkRecordFromRun = (
  run: SolverRunResult,
  context: BenchmarkRunContext,
): SolverBenchmarkRecord => ({
  id: `${Date.now()}-${run.name}-${run.move_count}-${Math.random().toString(36).slice(2, 8)}`,
  timestamp: new Date().toISOString(),
  level: run.input_state.level,
  algorithm: `${run.name}@${run.version}`,
  algorithm_id: context.algorithmId,
  model_id: context.modelId,
  scramble_seed: context.scrambleSeed ?? null,
  runtime_ms: run.runtime_ms,
  move_count: run.move_count,
  success: run.success,
  complexity_estimate: run.complexity_estimate,
  notes: run.notes,
  determinism: 'deterministic',
  explainability: 'structured',
  scalability: `Supports level(s): ${run.level_supported.join(', ')}.`,
});

export interface SolverBenchmarkRecord {
  id: string;
  timestamp: string;
  level: number;
  algorithm: string;
  algorithm_id: string;
  model_id: string;
  scramble_seed: string | null;
  runtime_ms: number;
  move_count: number;
  success: boolean;
  complexity_estimate: string;
  notes: string;
  determinism: 'deterministic' | 'non-deterministic';
  explainability: 'structured' | 'partial' | 'none';
  scalability: string;
}

export interface BenchmarkSummary {
  runs: number;
  successRate: number;
  averageRuntime: number;
  averageMoveCount: number;
}

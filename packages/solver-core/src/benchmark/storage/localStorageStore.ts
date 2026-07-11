import type { SolverRunResult } from '../../algorithm/types';
import { benchmarkRecordFromRun, type BenchmarkRunContext } from '../recordFromRun';
import type { SolverBenchmarkRecord } from '../types';

export interface BenchmarkStore {
  load(): SolverBenchmarkRecord[];
  record(run: SolverRunResult, context: BenchmarkRunContext): SolverBenchmarkRecord[];
  clear(): void;
}

const canUseLocalStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

/**
 * Browser-only persistence for the Play app's "Solver Lab" panel history.
 * This is intentionally the *only* place in the package that touches
 * `localStorage` — the benchmark runner and CLI are storage-agnostic and
 * just return records, so a future caller could swap this for a different
 * store (a file, IndexedDB, a backend) without touching solving logic.
 */
export const createLocalStorageBenchmarkStore = (storageKey: string, maxRecords = 100): BenchmarkStore => {
  const load = (): SolverBenchmarkRecord[] => {
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

  const save = (records: SolverBenchmarkRecord[]) => {
    if (!canUseLocalStorage()) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(records.slice(0, maxRecords)));
    } catch {
      // Quota exceeded or storage blocked (e.g. private browsing). Persisting
      // a benchmark record must never fail the solve that produced it.
    }
  };

  return {
    load,
    record: (run, context) => {
      const records = [benchmarkRecordFromRun(run, context), ...load()].slice(0, maxRecords);
      save(records);
      return records;
    },
    clear: () => {
      if (!canUseLocalStorage()) return;
      window.localStorage.removeItem(storageKey);
    },
  };
};

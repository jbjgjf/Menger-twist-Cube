import type { Cubie, MoveSystem } from '@menger/engine';
import type { BenchmarkRunResult, BenchmarkRunSpec, SolverRunResult } from '@menger/solver-core';
import type {
  CompareRun,
  CompareSpec,
  SerializedCubieState,
  SolverWorkerRequest,
  SolverWorkerResponse,
} from './solverWorkerProtocol';

const serializeCubies = (cubies: Cubie[]): SerializedCubieState[] => cubies.map((cubie) => ({
  id: cubie.id,
  currentPosition: [...cubie.currentPosition],
  orientation: [cubie.orientation.x, cubie.orientation.y, cubie.orientation.z, cubie.orientation.w],
}));

const runWorker = <T>(
  request: SolverWorkerRequest,
  expected: SolverWorkerResponse['kind'],
  onDebug?: (message: string) => void,
): Promise<T> => new Promise<T>((resolve, reject) => {
  const worker = new Worker(new URL('./solverWorker.ts', import.meta.url), { type: 'module' });
  const finish = (): void => worker.terminate();
  worker.onerror = (event) => {
    finish();
    reject(new Error(event.message || 'Solver worker crashed.'));
  };
  worker.onmessage = (event: MessageEvent<SolverWorkerResponse>) => {
    const response = event.data;
    if (response.kind === 'debug') {
      onDebug?.(`[${response.event.source}] ${response.event.message}`);
      return;
    }
    if (response.kind === 'error') {
      finish();
      reject(new Error(response.message));
      return;
    }
    if (response.kind !== expected) return;
    finish();
    resolve(('result' in response ? response.result : undefined) as T);
  };
  worker.postMessage(request);
});

export const solveInWorker = (
  algorithmId: string,
  level: number,
  cubies: Cubie[],
  onDebug?: (message: string) => void,
  moveSystem: MoveSystem = 'standard',
): Promise<SolverRunResult> => runWorker<SolverRunResult>(
  { kind: 'solve', algorithmId, moveSystem, level, cubies: serializeCubies(cubies) },
  'solve-result',
  onDebug,
);

export const benchmarkInWorker = (
  algorithmId: string,
  spec: BenchmarkRunSpec,
  onDebug?: (message: string) => void,
  moveSystem: MoveSystem = 'standard',
): Promise<BenchmarkRunResult> => runWorker<BenchmarkRunResult>(
  { kind: 'benchmark', algorithmId, moveSystem, spec },
  'benchmark-result',
  onDebug,
);

export interface RunningComparison {
  done: Promise<void>;
  /** Terminates the worker; `done` rejects with a cancellation error. */
  cancel(): void;
}

/** Streams one `CompareRun` per (seed, solver) as soon as it finishes. */
export const compareInWorker = (
  spec: CompareSpec,
  moveSystem: MoveSystem,
  onRun: (run: CompareRun) => void,
  onDebug?: (message: string) => void,
): RunningComparison => {
  const worker = new Worker(new URL('./solverWorker.ts', import.meta.url), { type: 'module' });
  let fail: (error: Error) => void = () => {};
  const done = new Promise<void>((resolve, reject) => {
    fail = (error) => {
      worker.terminate();
      reject(error);
    };
    worker.onerror = (event) => fail(new Error(event.message || 'Solver worker crashed.'));
    worker.onmessage = (event: MessageEvent<SolverWorkerResponse>) => {
      const response = event.data;
      if (response.kind === 'debug') onDebug?.(`[${response.event.source}] ${response.event.message}`);
      else if (response.kind === 'compare-run') onRun(response.run);
      else if (response.kind === 'error') fail(new Error(response.message));
      else if (response.kind === 'compare-done') {
        worker.terminate();
        resolve();
      }
    };
  });
  worker.postMessage({ kind: 'compare', moveSystem, spec } satisfies SolverWorkerRequest);
  return { done, cancel: () => fail(new Error('Comparison cancelled.')) };
};

export const scrambleInWorker = (
  algorithmId: string, level: number, seed: number, length: number,
  onDebug?: (message: string) => void,
  moveSystem: MoveSystem = 'standard',
): Promise<{ cubies: SerializedCubieState[]; moveCount: number }> => runWorker(
  { kind: 'scramble', algorithmId, moveSystem, level, seed, length }, 'scramble-result', onDebug,
);

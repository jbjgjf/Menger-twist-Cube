import type { Cubie } from '@menger/engine';
import type { BenchmarkRunResult, BenchmarkRunSpec, SolverRunResult } from '@menger/solver-core';
import type {
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
): Promise<SolverRunResult> => runWorker<SolverRunResult>(
  { kind: 'solve', algorithmId, level, cubies: serializeCubies(cubies) },
  'solve-result',
  onDebug,
);

export const benchmarkInWorker = (
  algorithmId: string,
  spec: BenchmarkRunSpec,
  onDebug?: (message: string) => void,
): Promise<BenchmarkRunResult> => runWorker<BenchmarkRunResult>(
  { kind: 'benchmark', algorithmId, spec },
  'benchmark-result',
  onDebug,
);

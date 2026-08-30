import { Quaternion } from 'three';
import {
  getAlgorithm,
  mengerPuzzleModel,
  onSolverDebug,
  runBenchmark,
} from '@menger/solver-core';
import type { Cubie } from '@menger/engine';
import type { SolverWorkerRequest, SolverWorkerResponse } from './solverWorkerProtocol';

const send = (message: SolverWorkerResponse): void => self.postMessage(message);
const maxTransferredPlaybackMoves = 10_000;

onSolverDebug((event) => send({ kind: 'debug', event }));

const restoreCubies = (level: number, serialized: Extract<SolverWorkerRequest, { kind: 'solve' }>['cubies']): Cubie[] => {
  const canonical = mengerPuzzleModel.createState(level);
  const byId = new Map(serialized.map((cubie) => [cubie.id, cubie]));
  return canonical.cubies.map((cubie) => {
    const saved = byId.get(cubie.id);
    if (!saved) throw new Error(`Worker input is missing cubie ${cubie.id}.`);
    return {
      ...cubie,
      currentPosition: [...saved.currentPosition],
      orientation: new Quaternion(...saved.orientation),
    };
  });
};

self.onmessage = (event: MessageEvent<SolverWorkerRequest>): void => {
  void (async () => {
    try {
      const request = event.data;
      const algorithm = getAlgorithm(request.algorithmId);
      if (!algorithm) throw new Error(`Unknown solver algorithm: ${request.algorithmId}`);

      if (request.kind === 'benchmark') {
        const result = await runBenchmark(mengerPuzzleModel, algorithm, request.spec);
        send({ kind: 'benchmark-result', result });
        return;
      }

      const canonical = mengerPuzzleModel.createState(request.level);
      const result = await algorithm.solve(mengerPuzzleModel, {
        ...canonical,
        cubies: restoreCubies(request.level, request.cubies),
      });
      // Hundreds of thousands of verbose SolverMove objects are useful to CLI
      // consumers but not to the Lab, which intentionally skips playback above
      // this limit. Avoid cloning tens of megabytes back to the UI thread.
      send({
        kind: 'solve-result',
        result: result.move_count > maxTransferredPlaybackMoves
          ? { ...result, output_moves: [] }
          : result,
      });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      send({ kind: 'error', message: error.message, stack: error.stack });
    }
  })();
};

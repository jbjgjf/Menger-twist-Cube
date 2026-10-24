import { Quaternion } from 'three';
import {
  getAlgorithm,
  createMengerPuzzleModel,
  onSolverDebug,
  runBenchmark,
  createSeededRng,
  scrambleState,
} from '@menger/solver-core';
import type { Cubie } from '@menger/engine';
import type { SolverWorkerRequest, SolverWorkerResponse } from './solverWorkerProtocol';

const send = (message: SolverWorkerResponse): void => self.postMessage(message);
const maxTransferredPlaybackMoves = 10_000;

onSolverDebug((event) => send({ kind: 'debug', event }));

const restoreCubies = (canonical: Cubie[], serialized: Extract<SolverWorkerRequest, { kind: 'solve' }>['cubies']): Cubie[] => {
  const byId = new Map(serialized.map((cubie) => [cubie.id, cubie]));
  return canonical.map((cubie) => {
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
      const model = createMengerPuzzleModel(request.moveSystem);
      const algorithm = getAlgorithm(request.algorithmId);
      if (!algorithm) throw new Error(`Unknown solver algorithm: ${request.algorithmId}`);
      if (!(algorithm.moveSystemsSupported ?? ['standard']).includes(request.moveSystem)) throw new Error('Algorithm does not support the selected move system.');

      if (request.kind === 'scramble') {
        const canonical = model.createState(request.level);
        const pool = algorithm.scrambleMovePool ? (state: typeof canonical) => algorithm.scrambleMovePool!(model, state) : undefined;
        const { state, moves } = scrambleState(model, canonical, createSeededRng(request.seed), request.length, pool);
        send({ kind: 'scramble-result', result: { moveCount: moves.length, cubies: state.cubies.map((c) => ({
          id: c.id, currentPosition: [...c.currentPosition],
          orientation: [c.orientation.x, c.orientation.y, c.orientation.z, c.orientation.w],
        })) } });
        return;
      }

      if (request.kind === 'benchmark') {
        const result = await runBenchmark(model, algorithm, request.spec);
        send({ kind: 'benchmark-result', result });
        return;
      }

      const canonical = model.createState(request.level);
      const result = await algorithm.solve(model, {
        ...canonical,
        cubies: restoreCubies(canonical.cubies, request.cubies),
      });
      // Hundreds of thousands of verbose SolverMove objects are useful to CLI
      // consumers but not to the Lab, which intentionally skips playback above
      // this limit. Avoid cloning tens of megabytes back to the UI thread.
      send({
        kind: 'solve-result',
        result: request.level >= 4 || result.move_count > maxTransferredPlaybackMoves
          ? { ...result, output_moves: [] }
          : result,
      });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      send({ kind: 'error', message: error.message, stack: error.stack });
    }
  })();
};

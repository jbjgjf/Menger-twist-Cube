import { Quaternion } from 'three';
import {
  getAlgorithm,
  createMengerPuzzleModel,
  onSolverDebug,
  runBenchmark,
  createSeededRng,
  scrambleState,
} from '@menger/solver-core';
import type { Cubie, MoveSystem } from '@menger/engine';
import type { CompareSpec, SolverWorkerRequest, SolverWorkerResponse } from './solverWorkerProtocol';

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

const supportedAlgorithm = (algorithmId: string, moveSystem: MoveSystem) => {
  const algorithm = getAlgorithm(algorithmId);
  if (!algorithm) throw new Error(`Unknown solver algorithm: ${algorithmId}`);
  if (!(algorithm.moveSystemsSupported ?? ['standard']).includes(moveSystem)) {
    throw new Error(`${algorithmId} does not support the selected move system.`);
  }
  return algorithm;
};

/**
 * Every solver solves the same scrambles, one seed at a time. Each solver
 * first solves the solved cube once, untimed, so one-time library builds and
 * caches are not charged to whichever solver happens to run first. The solver
 * order rotates per seed for the same reason.
 */
const runComparison = async (moveSystem: MoveSystem, spec: CompareSpec): Promise<void> => {
  const model = createMengerPuzzleModel(moveSystem);
  const algorithms = spec.algorithmIds.map((id) => supportedAlgorithm(id, moveSystem));
  const reference = supportedAlgorithm(spec.scrambleAlgorithmId, moveSystem);
  const solved = model.createState(spec.level);

  for (const algorithm of algorithms) {
    try {
      await algorithm.solve(model, model.cloneState(solved));
    } catch {
      // A broken solver surfaces as failed timed runs below.
    }
  }

  const pool = reference.scrambleMovePool
    ? (state: typeof solved) => reference.scrambleMovePool!(model, state)
    : undefined;
  for (const [seedIndex, seed] of spec.seeds.entries()) {
    const { state } = scrambleState(model, solved, createSeededRng(seed), spec.length, pool);
    for (let offset = 0; offset < algorithms.length; offset += 1) {
      const algorithm = algorithms[(seedIndex + offset) % algorithms.length]!;
      const input = model.cloneState(state);
      const started = performance.now();
      let run: { success: boolean; moveCount: number; notes: string };
      try {
        const result = await algorithm.solve(model, input);
        run = { success: result.success, moveCount: result.success ? result.move_count : 0, notes: result.notes };
      } catch (cause) {
        run = { success: false, moveCount: 0, notes: cause instanceof Error ? cause.message : String(cause) };
      }
      send({ kind: 'compare-run', run: { algorithmId: algorithm.id, seed, wallMs: performance.now() - started, ...run } });
    }
  }
  send({ kind: 'compare-done' });
};

self.onmessage = (event: MessageEvent<SolverWorkerRequest>): void => {
  void (async () => {
    try {
      const request = event.data;
      if (request.kind === 'compare') {
        await runComparison(request.moveSystem, request.spec);
        return;
      }

      const model = createMengerPuzzleModel(request.moveSystem);
      const algorithm = supportedAlgorithm(request.algorithmId, request.moveSystem);

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

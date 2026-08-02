/**
 * Validation harness for the Level 3 block-quotient solver
 * (`packages/solver-core/src/algorithms/level3BlockQuotientSolver.ts`).
 *
 * Run: `npx tsx research/scratch/l3-validate.ts` from the repo root.
 *
 * Every scenario checks the same three things, independently of the solver's
 * own reporting: the run claims success, every emitted move is legal in the
 * state it is applied to, and replaying the whole move list through
 * `mengerPuzzleModel` lands on an exactly solved cube.
 */
import type { MengerPuzzleState, TurnTarget, TwistAngle } from '@menger/engine';
import { createExtensionMove, createMove, validateFrameRotation, validateTurnTargetRotation } from '@menger/engine';
import type { SolverMove } from '@menger/solver-core';
import {
  createSeededRng,
  level3BlockQuotientAlgorithm,
  mengerPuzzleModel,
  scrambleState,
  warmLevel3BlockQuotientSolver,
} from '@menger/solver-core';

const angles: TwistAngle[] = [90, -90, 180];
const model = mengerPuzzleModel;

const frameMoves = (state: MengerPuzzleState, scale: number): SolverMove[] =>
  state.frames
    .filter((frame) => frame.scale === scale)
    .flatMap((frame) =>
      angles
        .filter((angle) => validateFrameRotation(state.cubies, frame, angle).legal)
        .map((angle) => ({
          targetKind: 'frame' as const,
          targetId: `frame:${frame.id}`,
          frameId: frame.id,
          angle,
          notation: createMove(frame.id, angle, state.frameById).notation,
          reason: '',
        })),
    );

const extensionMoves = (state: MengerPuzzleState, predicate: (target: TurnTarget) => boolean): SolverMove[] =>
  state.turnTargets
    .filter((target) => target.kind === 'extension' && predicate(target))
    .flatMap((target) =>
      angles
        .filter((angle) => validateTurnTargetRotation(state.cubies, target, angle).legal)
        .map((angle) => ({
          targetKind: 'extension' as const,
          targetId: target.id,
          extensionTargetId: target.id,
          angle,
          notation: createExtensionMove(target, angle).notation,
          reason: '',
        })),
    );

interface Outcome {
  label: string;
  ok: boolean;
  detail: string;
}

const runCase = async (
  label: string,
  seed: number,
  length: number,
  pool: (state: MengerPuzzleState) => SolverMove[],
  expectSuccess: boolean,
): Promise<Outcome> => {
  const solved = model.createState(3);
  const { state: scrambled, moves: scrambleMoves } = scrambleState(model, solved, createSeededRng(seed), length, pool);
  if (scrambleMoves.length < length) {
    return { label, ok: false, detail: `scramble stalled after ${scrambleMoves.length}/${length} moves` };
  }

  const started = performance.now();
  const result = await level3BlockQuotientAlgorithm.solve(model, scrambled);
  const runtime = performance.now() - started;

  if (!expectSuccess) {
    const ok = !result.success && result.output_moves.length === 0;
    return {
      label,
      ok,
      detail: ok
        ? `rejected honestly: ${result.notes.slice(0, 110)}`
        : `expected an honest rejection, got success=${result.success}`,
    };
  }

  if (!result.success) return { label, ok: false, detail: `solver reported failure: ${result.notes}` };

  let current = model.cloneState(scrambled);
  for (const [index, move] of result.output_moves.entries()) {
    if (!model.isMoveLegal(current, move)) {
      return { label, ok: false, detail: `move ${index} (${move.notation}) is not legal in the state it is applied to` };
    }
    current = model.applyMove(current, move);
  }
  if (!model.isSolved(current)) return { label, ok: false, detail: 'replay did not reach an exactly solved cube' };

  const rollFixes = result.explanation.find((step) => step.phase === 'cell roll normalization')?.observation ?? '';
  return {
    label,
    ok: true,
    detail: `${result.move_count} moves, ${runtime.toFixed(0)}ms — ${rollFixes}`,
  };
};

const main = async () => {
  const warm = performance.now();
  warmLevel3BlockQuotientSolver();
  console.log(`warmed the Level 2 commutator library in ${(performance.now() - warm).toFixed(0)}ms\n`);

  const outcomes: Outcome[] = [];
  const declaredPool = (state: MengerPuzzleState) => level3BlockQuotientAlgorithm.scrambleMovePool!(model, state);

  console.log('--- scenario A: the declared block-rigid generator set ---');
  for (const length of [10, 20, 50, 100, 200]) {
    for (const seed of [1, 2, 3]) {
      const outcome = await runCase(`A len=${length} seed=${seed}`, seed, length, declaredPool, true);
      outcomes.push(outcome);
      console.log(`  ${outcome.ok ? 'PASS' : 'FAIL'} ${outcome.label}: ${outcome.detail}`);
    }
  }

  console.log('\n--- scenario B: roll-heavy scrambles (stresses cell roll normalization) ---');
  // 90% depth-3 cell rolls, 10% block transport: forces many residual twists,
  // most of them at home sites whose own roll target is physically blocked.
  const rollHeavyPool = (state: MengerPuzzleState) => [
    ...extensionMoves(state, (target) => target.depth === 3 && target.scale === 1),
    ...Array.from({ length: 3 }).flatMap(() => frameMoves(state, 9)),
  ];
  for (const length of [50, 200, 600]) {
    for (const seed of [11, 12]) {
      const outcome = await runCase(`B len=${length} seed=${seed}`, seed, length, rollHeavyPool, true);
      outcomes.push(outcome);
      console.log(`  ${outcome.ok ? 'PASS' : 'FAIL'} ${outcome.label}: ${outcome.detail}`);
    }
  }

  console.log('\n--- scenario C: out-of-scope scrambles must be rejected honestly ---');
  const sliceOnlyPool = (state: MengerPuzzleState) => frameMoves(state, 1);
  const slabOnlyPool = (state: MengerPuzzleState) => extensionMoves(state, (target) => target.depth === 2.5);
  for (const [label, pool] of [['scale-1 slices', sliceOnlyPool], ['depth-2.5 slabs', slabOnlyPool]] as const) {
    const outcome = await runCase(`C ${label}`, 7, 5, pool, false);
    outcomes.push(outcome);
    console.log(`  ${outcome.ok ? 'PASS' : 'FAIL'} ${outcome.label}: ${outcome.detail}`);
  }

  const failed = outcomes.filter((outcome) => !outcome.ok);
  console.log(`\n${outcomes.length - failed.length}/${outcomes.length} scenarios passed`);
  if (failed.length > 0) {
    for (const outcome of failed) console.log(`  FAILED ${outcome.label}: ${outcome.detail}`);
    process.exitCode = 1;
  }
};

await main();

/**
 * The opt-in `inner-square` move system (engine + solver-core) against the
 * audit it was built from, and the coset solver on scrambles of that system.
 *
 * Run: `npm run test:square`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Vector3Tuple } from 'three';
import { createMengerPuzzleState, validateTurnTargetRotation } from '@menger/engine';
import {
  createSeededRng,
  innerSquareCosetOf,
  innerSquareMengerPuzzleModel,
  level2InnerSquareCosetAlgorithm,
  level2SliceReductionAlgorithm,
  mengerPuzzleModel,
  scrambleState,
} from '@menger/solver-core';

console.debug = () => {};

const audit = JSON.parse(readFileSync('research/square-rotation/out/l2-extended-moves.json', 'utf8')) as {
  additional: Array<{ axis: Vector3Tuple; pivot: Vector3Tuple; angle: number; support: Vector3Tuple[] }>;
};
const supportKey = (axis: Vector3Tuple, pivot: Vector3Tuple, cells: Vector3Tuple[]): string =>
  `${axis.join(',')}|${pivot.join(',')}|${cells.map((cell) => cell.join(',')).sort().join(';')}`;

test('the standard system is unchanged: same 324 targets and 468 legal atoms, no ring target', () => {
  const standard = createMengerPuzzleState(2);
  assert.equal(standard.moveSystem, undefined);
  assert.equal(standard.turnTargets.length, 324);
  assert.equal(standard.turnTargets.some((target) => target.family === 'ring'), false);
  assert.equal(mengerPuzzleModel.legalMoves(standard).length, 468);
  assert.deepEqual(
    createMengerPuzzleState(2, { moveSystem: 'standard' }).turnTargets.map((target) => target.id),
    standard.turnTargets.map((target) => target.id),
  );
});

test('the inner-square system adds exactly the 18 audited ring targets, all legal at every angle', () => {
  const state = createMengerPuzzleState(2, { moveSystem: 'inner-square' });
  const rings = state.turnTargets.filter((target) => target.family === 'ring');
  assert.equal(state.turnTargets.length, 324 + 18);
  assert.equal(rings.length, 18);
  const engineKeys = new Set(
    rings.map((target) =>
      supportKey(target.axis, target.pivot, state.cubies.filter((cubie) => target.selector(cubie.currentPosition)).map((cubie) => cubie.currentPosition)),
    ),
  );
  const auditKeys = new Set(audit.additional.map((entry) => supportKey(entry.axis, entry.pivot, entry.support)));
  assert.equal(auditKeys.size, 18);
  assert.deepEqual([...engineKeys].sort(), [...auditKeys].sort());
  for (const target of rings) {
    const cells = state.cubies.filter((cubie) => target.selector(cubie.currentPosition)).length;
    assert.equal(cells, target.affectedCountEstimate, target.id);
    for (const angle of [90, -90, 180] as const) {
      assert.equal(validateTurnTargetRotation(state.cubies, target, angle).legal, true, `${target.id}@${angle}`);
    }
  }
  assert.equal(innerSquareMengerPuzzleModel.legalMoves(state).length, 468 + 54);
});

test('the inner-square system is refused where it is not defined', () => {
  assert.equal(createMengerPuzzleState(3, { moveSystem: 'inner-square' }).turnTargets.filter(t => t.family === 'ring').length, 690);
  assert.throws(() => createMengerPuzzleState(5, { moveSystem: 'inner-square' }), /not defined for level 5/);
});

test('ψ: 24 of the 54 ring atoms leave the standard coset, no standard atom does', () => {
  const state = innerSquareMengerPuzzleModel.createState(2);
  const moves = innerSquareMengerPuzzleModel.legalMoves(state);
  const flips = moves.filter((move) => innerSquareCosetOf(innerSquareMengerPuzzleModel.applyMove(state, move).cubies) === 1);
  assert.equal(flips.length, 24);
  for (const move of flips) assert.match(move.targetId, /^ring:[XYZ][+-]3:(inner|outer)$/);
  for (const move of flips) assert.notEqual(move.angle, 180);
});

test('coset solver: seeded inner-square scrambles are solved and replay to the exact solved state', async () => {
  const model = innerSquareMengerPuzzleModel;
  const cosets = { 0: 0, 1: 0 };
  let standardOnlyFailures = 0;
  for (let seed = 1; seed <= 12; seed += 1) {
    const { state } = scrambleState(model, model.createState(2), createSeededRng(seed), 30);
    const coset = innerSquareCosetOf(state.cubies);
    assert.ok(coset === 0 || coset === 1);
    cosets[coset] += 1;

    const result = await level2InnerSquareCosetAlgorithm.solve(model, model.cloneState(state));
    assert.equal(result.success, true, `seed ${seed}: ${result.notes}`);
    let current = model.cloneState(state);
    for (const move of result.output_moves) {
      assert.equal(model.isMoveLegal(current, move), true, `seed ${seed}: ${move.notation}`);
      current = model.applyMove(current, move);
    }
    assert.equal(model.isSolved(current), true, `seed ${seed}`);
    const ringMoves = result.output_moves.filter((move) => move.targetId.startsWith('ring:')).length;
    assert.equal(ringMoves, coset, `seed ${seed}: ring moves used`);

    // The standard-only solver must fail exactly on the ψ = 1 half.
    if (coset === 1) {
      const standard = await level2SliceReductionAlgorithm.solve(model, model.cloneState(state));
      assert.equal(standard.success, false, `seed ${seed}`);
      standardOnlyFailures += 1;
    }
  }
  assert.ok(cosets[0] > 0 && cosets[1] > 0, `both cosets sampled: ${JSON.stringify(cosets)}`);
  assert.equal(standardOnlyFailures, cosets[1]);
});

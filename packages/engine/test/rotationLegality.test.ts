import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCubieRotation,
  applyExtensionRotation,
  createMengerPuzzleState,
  validateFrameRotation,
  validateTurnTargetRotation,
} from '../src/index';
import type { TurnTarget } from '../src/index';
import type { Vector3Tuple } from 'three';

const targetSelecting = (
  targets: TurnTarget[],
  position: Vector3Tuple,
  depth: number,
  axisName: TurnTarget['axisName'],
): TurnTarget => {
  const target = targets.find(
    (candidate) =>
      candidate.kind === 'extension' &&
      candidate.depth === depth &&
      candidate.axisName === axisName &&
      candidate.selector(position),
  );
  assert.ok(target, `expected an extension target at ${position.join(',')}`);
  return target;
};

test('Level 1 edge extension remains legal with axial boundary contact', () => {
  const state = createMengerPuzzleState(1);
  const target = state.turnTargets.find((candidate) => candidate.kind === 'extension');
  assert.ok(target);
  assert.equal(validateTurnTargetRotation(state.cubies, target, 90).legal, true);
});

test('ordinary Level 2 frame rotation remains legal', () => {
  const state = createMengerPuzzleState(2);
  const frame = state.frames.find((candidate) => candidate.id === 'X_+4') ?? state.frames[0];
  assert.ok(frame);
  assert.equal(validateFrameRotation(state.cubies, frame, 90).legal, true);
});

test('Level 2 EE unit rotation is blocked by its adjacent CE unit', () => {
  const state = createMengerPuzzleState(2);
  const eePosition: Vector3Tuple = [1, 3, 4];
  const cePosition: Vector3Tuple = [2, 3, 4];
  const target = targetSelecting(state.turnTargets, eePosition, 2, 'Y');
  const result = validateTurnTargetRotation(state.cubies, target, 90);

  assert.equal(result.legal, false);
  assert.equal(result.code, 'sweep-collision');
  assert.equal(result.movingCubieId, 'L2_1_3_4');
  assert.equal(result.blockingCubieId, 'L2_2_3_4');
  assert.deepEqual(
    state.cubies.find((cubie) => cubie.id === result.blockingCubieId)?.currentPosition,
    cePosition,
  );
});

test('engine apply paths refuse an illegal extension and legacy one-cubie rotation', () => {
  const state = createMengerPuzzleState(2);
  const eePosition: Vector3Tuple = [1, 3, 4];
  const target = targetSelecting(state.turnTargets, eePosition, 2, 'Y');
  const cubie = state.cubies.find((candidate) => candidate.currentPosition.join(',') === eePosition.join(','));
  assert.ok(cubie);

  assert.strictEqual(
    applyExtensionRotation(state.cubies, target.id, 90, state.turnTargetById),
    state.cubies,
  );
  assert.strictEqual(applyCubieRotation(state.cubies, cubie.id, [0, 1, 0], 90), state.cubies);
});

test('Level 2 depth-1 block extension remains legal', () => {
  const state = createMengerPuzzleState(2);
  const target = state.turnTargets.find(
    (candidate) => candidate.kind === 'extension' && candidate.depth === 1,
  );
  assert.ok(target);
  assert.equal(validateTurnTargetRotation(state.cubies, target, 90).legal, true);
  assert.notStrictEqual(
    applyExtensionRotation(state.cubies, target.id, 90, state.turnTargetById),
    state.cubies,
  );
});

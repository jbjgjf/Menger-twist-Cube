/**
 * Regression tests for the extended "square cross section" rotation model.
 *
 * Run: `npm run test:square` from the repo root, or
 * `node --import tsx --test research/square-rotation/test/*.test.ts`.
 *
 * These lock the audit's measured numbers and the two rotations the request
 * started from. They test the *audit model only* — no engine source, move id,
 * UI behaviour or solver is touched by anything here, and the pre-existing
 * engine suite is left exactly as it was.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyExtensionRotation,
  cloneCubies,
  createMengerPuzzleState,
  validateTurnTargetRotation,
} from '../../../packages/engine/src/index';
import type { Cubie, TurnTarget, TwistAngle } from '../../../packages/engine/src/index';
import type { Vector3Tuple } from 'three';
import {
  allAngles,
  cellKey,
  enumerateRegionCandidates,
  enumerateSubsetCandidates,
  envelopeIsSquareOnAxis,
  targetForCells,
  type AxisIndex,
  type Candidate,
} from '../model';
import { buildOperation, existingLegalOperations, supportOf } from '../existing';

const fourBlockCandidate = (level: number, corner: number): Candidate => ({
  id: `test:L${level}:corners${corner}`,
  family: 'subset',
  axisIndex: 2,
  axisName: 'Z',
  layers: [0],
  pivot: [0, 0, 0],
  pivotInPlane: [0, 0],
  cells: [
    [corner, corner, 0],
    [-corner, corner, 0],
    [-corner, -corner, 0],
    [corner, -corner, 0],
  ],
});

for (const [level, corner] of [
  [2, 2],
  [3, 5],
] as const) {
  test(`Level ${level}: the four cells (+-${corner},+-${corner},0) rotate about the central Z axis`, () => {
    const state = createMengerPuzzleState(level);
    const candidate = fourBlockCandidate(level, corner);

    for (const cell of candidate.cells) {
      assert.ok(
        state.cubies.some((cubie) => cellKey(cubie.currentPosition) === cellKey(cell)),
        `cell ${cellKey(cell)} must exist in the solved Menger set`,
      );
    }

    const target = targetForCells(candidate);
    assert.equal(supportOf(state.cubies, target).length, 4);
    for (const angle of allAngles) {
      const verdict = validateTurnTargetRotation(state.cubies, target, angle);
      assert.equal(verdict.legal, true, `angle ${angle}: ${verdict.message}`);
    }
  });

  test(`Level ${level}: those four cells are all occupied cells of the ${2 * corner + 1}-side square region`, () => {
    const state = createMengerPuzzleState(level);
    const inRegion = state.cubies
      .filter(
        (cubie) =>
          cubie.currentPosition[2] === 0 &&
          Math.abs(cubie.currentPosition[0]!) <= corner &&
          Math.abs(cubie.currentPosition[1]!) <= corner,
      )
      .map((cubie) => cellKey(cubie.currentPosition))
      .sort();
    assert.deepEqual(inRegion, fourBlockCandidate(level, corner).cells.map(cellKey).sort());
  });

  test(`Level ${level}: no existing turn target selects exactly those four cells`, () => {
    const state = createMengerPuzzleState(level);
    const wanted = new Set(fourBlockCandidate(level, corner).cells.map(cellKey));
    const matches = state.turnTargets.filter((existing) => {
      const support = supportOf(state.cubies, existing);
      return support.length === wanted.size && support.every((cell) => wanted.has(cellKey(cell)));
    });
    assert.equal(matches.length, 0);
  });
}

test('Level 2 region family: candidate count and reason-by-reason legality census', () => {
  const state = createMengerPuzzleState(2);
  const regions = enumerateRegionCandidates(state.cubies, 2);
  assert.equal(regions.candidates.length, 6180);
  assert.equal(regions.emptyRegions, 1446);
  assert.equal(regions.duplicateRegions, 69);

  const census = new Map<TwistAngle, Map<string, number>>();
  for (const angle of allAngles) census.set(angle, new Map());
  for (const candidate of regions.candidates) {
    const target = targetForCells(candidate);
    const square = envelopeIsSquareOnAxis(candidate.cells, candidate.axisIndex, candidate.pivotInPlane);
    for (const angle of allAngles) {
      const verdict = validateTurnTargetRotation(state.cubies, target, angle);
      const code = verdict.legal ? (square ? 'legal' : 'rectangle-180') : (verdict.code ?? 'unknown');
      const byCode = census.get(angle)!;
      byCode.set(code, (byCode.get(code) ?? 0) + 1);
    }
  }

  assert.deepEqual(Object.fromEntries(census.get(90)!), {
    'outer-envelope-not-square': 2292,
    'endpoint-not-closed': 2244,
    'sweep-collision': 1500,
    legal: 144,
  });
  assert.deepEqual(Object.fromEntries(census.get(-90)!), Object.fromEntries(census.get(90)!));
  assert.deepEqual(Object.fromEntries(census.get(180)!), {
    'endpoint-not-closed': 4440,
    'sweep-collision': 1572,
    legal: 144,
    'rectangle-180': 24,
  });
});

test('Level 2 subset family: the closure enumeration is exhaustive and engine-confirmed', () => {
  const state = createMengerPuzzleState(2);
  const subsets = enumerateSubsetCandidates(state.cubies, 2);
  assert.equal(subsets.stats.cappedPivots.length, 0, 'no pivot may hit the closed-set cap');
  assert.equal(subsets.candidates.length, 153);

  let legal = 0;
  for (const candidate of subsets.candidates) {
    const target = targetForCells(candidate);
    for (const angle of allAngles) {
      if (validateTurnTargetRotation(state.cubies, target, angle).legal) legal += 1;
    }
  }
  assert.equal(legal, 459, 'every enumerated subset must be legal at every angle');

  // The region family is a sub-family of the subset family, so nothing legal
  // there may be missing here.
  const subsetKeys = new Set<string>();
  for (const candidate of subsets.candidates) {
    const axis: Vector3Tuple = [0, 0, 0];
    axis[candidate.axisIndex] = 1;
    for (const angle of allAngles) {
      subsetKeys.add(
        buildOperation(candidate.id, 'additional', axis, candidate.pivot, angle, candidate.cells).supportKey,
      );
    }
  }
  const regions = enumerateRegionCandidates(state.cubies, 2);
  for (const candidate of regions.candidates) {
    if (!envelopeIsSquareOnAxis(candidate.cells, candidate.axisIndex, candidate.pivotInPlane)) continue;
    const target = targetForCells(candidate);
    for (const angle of allAngles) {
      if (!validateTurnTargetRotation(state.cubies, target, angle).legal) continue;
      const axis: Vector3Tuple = [0, 0, 0];
      axis[candidate.axisIndex] = 1;
      const key = buildOperation(candidate.id, 'additional', axis, candidate.pivot, angle, candidate.cells)
        .supportKey;
      assert.ok(subsetKeys.has(key), `region-legal operation ${key} missing from the subset enumeration`);
    }
  }
});

test('Level 2 diff: 18 additional targets, 54 additional atomic moves, 405 already existing', () => {
  const state = createMengerPuzzleState(2);
  const subsets = enumerateSubsetCandidates(state.cubies, 2);
  const existing = existingLegalOperations(state);
  assert.equal(existing.length, 468, 'the shipped legal atomic move count is the documented 468');
  const existingByAction = new Map(existing.map((operation) => [operation.actionKey, operation]));

  const operations = new Map<string, ReturnType<typeof buildOperation>>();
  for (const candidate of subsets.candidates) {
    const axis: Vector3Tuple = [0, 0, 0];
    axis[candidate.axisIndex] = 1;
    for (const angle of allAngles) {
      if (!validateTurnTargetRotation(state.cubies, targetForCells(candidate), angle).legal) continue;
      const operation = buildOperation(candidate.id, 'additional', axis, candidate.pivot, angle, candidate.cells);
      if (!operations.has(operation.supportKey)) operations.set(operation.supportKey, operation);
    }
  }
  assert.equal(operations.size, 459);

  const shared = [...operations.values()].filter((operation) => existingByAction.has(operation.actionKey));
  const added = [...operations.values()].filter((operation) => !existingByAction.has(operation.actionKey));
  assert.equal(shared.length, 405, 'every legal single-layer existing operation is reproduced');
  assert.equal(added.length, 54);

  const targets = new Set(
    added.map((operation) => `${operation.axis.join(',')}|${operation.support.map(cellKey).sort().join(';')}`),
  );
  assert.equal(targets.size, 18);

  // All 18 live on the nine middle planes, on the axis through the plane centre.
  const layers = new Set(
    added.map((operation) => {
      const axisIndex = operation.axis.findIndex((value) => value === 1);
      return `${['X', 'Y', 'Z'][axisIndex]}${operation.pivot[axisIndex]}`;
    }),
  );
  assert.deepEqual([...layers].sort(), ['X-3', 'X0', 'X3', 'Y-3', 'Y0', 'Y3', 'Z-3', 'Z0', 'Z3']);
  assert.deepEqual(
    [...new Set(added.map((operation) => operation.support.length))].sort((a, b) => a - b),
    [4, 12, 20],
  );
});

const applyAudit = (target: TurnTarget, angle: TwistAngle, cubies: Cubie[]): Cubie[] =>
  applyExtensionRotation(cubies, target.id, angle, new Map([[target.id, target]]));

const additionalCandidatesLevel2 = (): Candidate[] => {
  const state = createMengerPuzzleState(2);
  const subsets = enumerateSubsetCandidates(state.cubies, 2);
  const existingByAction = new Map(
    existingLegalOperations(state).map((operation) => [operation.actionKey, operation]),
  );
  return subsets.candidates.filter((candidate) => {
    const axis: Vector3Tuple = [0, 0, 0];
    axis[candidate.axisIndex] = 1;
    const operation = buildOperation(candidate.id, 'additional', axis, candidate.pivot, 90, candidate.cells);
    return !existingByAction.has(operation.actionKey);
  });
};

test('an additional rotation followed by its inverse restores every cell, position and orientation', () => {
  const state = createMengerPuzzleState(2);
  const additional = additionalCandidatesLevel2();
  assert.equal(additional.length, 18);

  const baseline = state.cubies.map((cubie) => `${cubie.id}@${cellKey(cubie.currentPosition)}`).sort();
  const occupancy = state.cubies.map((cubie) => cellKey(cubie.currentPosition)).sort();

  for (const candidate of additional) {
    const target = targetForCells(candidate);
    for (const angle of allAngles) {
      const inverse = (angle === 180 ? 180 : -angle) as TwistAngle;
      const turned = applyAudit(target, angle, cloneCubies(state.cubies));
      assert.notEqual(
        turned.map((cubie) => `${cubie.id}@${cellKey(cubie.currentPosition)}`).join(';'),
        baseline.join(';'),
        `${candidate.id}@${angle} must actually move something`,
      );

      // no cell lost, none duplicated, occupancy unchanged
      assert.equal(turned.length, state.cubies.length);
      assert.equal(new Set(turned.map((cubie) => cubie.id)).size, state.cubies.length);
      assert.deepEqual(turned.map((cubie) => cellKey(cubie.currentPosition)).sort(), occupancy);

      const restored = applyAudit(target, inverse, turned);
      assert.deepEqual(
        restored.map((cubie) => `${cubie.id}@${cellKey(cubie.currentPosition)}`).sort(),
        baseline,
        `${candidate.id}: ${angle} then ${inverse} must restore all positions`,
      );
      for (const cubie of restored) {
        const home = state.cubies.find((other) => other.id === cubie.id)!;
        assert.ok(
          Math.abs(cubie.orientation.dot(home.orientation)) > 1 - 1e-9,
          `${candidate.id}: ${angle} then ${inverse} must restore ${cubie.id}'s orientation`,
        );
      }
    }
  }
});

test('legality of audit candidates does not depend on the state, only on the occupancy', () => {
  const state = createMengerPuzzleState(2);
  const probes = enumerateSubsetCandidates(state.cubies, 2, {
    planeFilter: (axisIndex: AxisIndex, layer: number) => axisIndex === 2 && layer === 0,
  }).candidates;
  assert.ok(probes.length > 0);

  const baseline = probes.map((candidate) =>
    allAngles.map((angle) => validateTurnTargetRotation(state.cubies, targetForCells(candidate), angle).legal),
  );

  // Scramble with the additional rotations themselves, then re-judge.
  let cubies = cloneCubies(state.cubies);
  for (let step = 0; step < 24; step += 1) {
    const candidate = probes[step % probes.length]!;
    cubies = applyAudit(targetForCells(candidate), step % 2 === 0 ? 90 : 180, cubies);
  }
  assert.deepEqual(
    cubies.map((cubie) => cellKey(cubie.currentPosition)).sort(),
    state.cubies.map((cubie) => cellKey(cubie.currentPosition)).sort(),
  );

  const after = probes.map((candidate) =>
    allAngles.map((angle) => validateTurnTargetRotation(cubies, targetForCells(candidate), angle).legal),
  );
  assert.deepEqual(after, baseline);
});

test('the judge admits rectangular cross sections at 180 degrees: 24 such moves at Level 2', () => {
  const state = createMengerPuzzleState(2);
  const regions = enumerateRegionCandidates(state.cubies, 2);
  const rectangles = regions.candidates.filter(
    (candidate) =>
      !envelopeIsSquareOnAxis(candidate.cells, candidate.axisIndex, candidate.pivotInPlane) &&
      validateTurnTargetRotation(state.cubies, targetForCells(candidate), 180).legal,
  );
  assert.equal(rectangles.length, 24);
  for (const candidate of rectangles) {
    assert.equal(candidate.cells.length, 2, 'all of them are two-cell 1x3 boxes');
    assert.equal(
      validateTurnTargetRotation(state.cubies, targetForCells(candidate), 90).legal,
      false,
      'and none of them is legal at 90 degrees',
    );
  }
});

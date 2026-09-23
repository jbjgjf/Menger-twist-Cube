/**
 * Regression tests for the Level 2 certificates added on top of the audit:
 * exact (integer / rational) collision proofs on both sides of the judge's
 * verdict, and the replay-verified proof that [H : G] = 2.
 *
 * Run: `npm run test:square`. Audit-only; nothing shipped is touched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Vector3Tuple } from 'three';
import { certifyMove } from '../exact-sweep-certificate';
import type { MoveRecord } from '../exact-sweep-certificate';
import { certifyCollision, interiorsOverlapAt } from '../rejection-certificates';
import { verifyIndexCertificate } from '../verify-certificates';

console.debug = () => {};

const extended = JSON.parse(readFileSync('research/square-rotation/out/l2-extended-moves.json', 'utf8')) as {
  cells: Vector3Tuple[];
  existing: MoveRecord[];
  additional: MoveRecord[];
};

test('exact annulus separation proves every atom of H interference-free (468 existing + 54 additional)', () => {
  for (const [origin, moves] of [['existing', extended.existing], ['additional', extended.additional]] as const) {
    for (const move of moves) {
      const verdict = certifyMove(move, origin, extended.cells);
      assert.equal(verdict.endpointClosesExactly, true, `${move.id}@${move.angle} closure`);
      if (Math.abs(move.angle) === 90) assert.equal(verdict.squareEnvelopeExact, true, `${move.id}@${move.angle} envelope`);
      assert.equal(verdict.status, 'exact-certified', `${move.id}@${move.angle}: ${JSON.stringify(verdict.unseparatedPairs.slice(0, 2))}`);
    }
  }
});

test('the annulus test is not vacuous: a blocked ring is not certified', () => {
  // The four (+-2,+-2,0) cells about the origin plus a fake stationary cell at
  // (2,0,0), which is empty in the real Menger set. Its annulus overlaps the
  // moving cells' annulus, so no exact certificate may be issued.
  const move: MoveRecord = {
    id: 'fake-blocked',
    axis: [0, 0, 1],
    pivot: [0, 0, 0],
    angle: 90,
    support: [[2, 2, 0], [-2, 2, 0], [-2, -2, 0], [2, -2, 0]],
  };
  const verdict = certifyMove(move, 'additional', [...move.support, [2, 0, 0]]);
  assert.equal(verdict.status, 'judge-only');
  assert.equal(verdict.unseparatedPairs.length, 4);
});

test('exact rational SAT: known overlap, touching contact and separation', () => {
  // Doubled coordinates, half-width 1. Moving centre (2,0) turned by +90 about
  // the origin lands on (0,2): a static square there overlaps at 90 but the
  // angle range is open, so probe strictly inside it instead.
  const tanHalf = (degrees: number): [bigint, bigint] => [
    BigInt(Math.round(Math.tan((degrees * Math.PI) / 360) * 2 ** 24)),
    2n ** 24n,
  ];
  assert.equal(interiorsOverlapAt([2, 0], [0, 2], ...tanHalf(89)), true);
  // Edge-adjacent squares at angle 0 only touch.
  assert.equal(interiorsOverlapAt([2, 0], [4, 0], 0n, 1n), false);
  assert.equal(interiorsOverlapAt([2, 0], [8, 8], ...tanHalf(45)), false);
  // Sweep of (2,0) through 90 degrees hits a square at doubled (2,2)...
  assert.equal(certifyCollision([2, 0], [2, 2], Math.PI / 2, undefined).certified, true);
  // ...but not one far outside its annulus.
  assert.equal(certifyCollision([2, 0], [8, 0], Math.PI / 2, undefined).certified, false);
});

test('[H : G] = 2: every Schreier generator of ker ψ replays to solved with existing atoms only', () => {
  const report = verifyIndexCertificate();
  assert.deepEqual(report.atoms, { existing: 468, additional: 54 });
  assert.deepEqual(report.parityRank, { G: 5, H: 6 });
  assert.equal(report.schreierWordsWellFormed, true);
  assert.equal(report.distinctElements, 619);
  assert.deepEqual(report.replayFailures, []);
  assert.equal(report.singleAtom.inGCertified.length, 30);
  assert.equal(report.singleAtom.notInGProved.length, 24);
  assert.equal(report.singleAtom.undetermined.length, 0);
  // The 24 non-members are exactly the quarter turns of the layer +-3 rings.
  for (const label of report.singleAtom.notInGProved) assert.match(label, /^\+(region|subset):[XYZ](-3|3):c0_0:[^@]+@-?90$/);
  assert.equal(report.indexTwoProved, true);
});

test('negative control: a truncated certificate is rejected by the verifier', () => {
  const report = verifyIndexCertificate({
    tamper: (file) => {
      const victim = file.records.find((record) => record.duplicateOf === undefined && (record.certificate?.length ?? 0) > 1)!;
      victim.certificate = victim.certificate!.slice(0, -1);
    },
  });
  assert.equal(report.replayFailures.length, 1);
  assert.equal(report.indexTwoProved, false);
});

test('negative control: dropping a Schreier word breaks the well-formedness check', () => {
  const report = verifyIndexCertificate({ sampleEvery: 1000, tamper: (file) => void file.records.pop() });
  assert.equal(report.schreierWordsWellFormed, false);
  assert.equal(report.indexTwoProved, false);
});

test('envelope-only vs full sweep check: no difference on the Level 2 candidate families', async () => {
  const { compareEnvelopeOnly } = await import('../envelope-only-check');
  const result = compareEnvelopeOnly(2);
  assert.equal(result.compared, 5439);
  assert.equal(result.bothLegal, 891);
  assert.deepEqual(result.envelopeOnlyLegalButFullyIllegal, []);
  assert.equal(result.fullyLegalButEnvelopeIllegal, 0);
});

test('envelope-only vs full sweep check: not equivalent in general (synthetic occupancy with a hole)', async () => {
  const { Quaternion } = await import('three');
  const { validateTurnTargetRotation } = await import('../../../packages/engine/src/index');
  const { targetForCells } = await import('../model');
  // Not a Menger configuration. Selection: the corners (+-2,+-2) and the
  // interior orbit (+-1,0),(0,+-1); an unselected cell sits in the hole at (1,1).
  const corners: Vector3Tuple[] = [[2, 2, 0], [-2, 2, 0], [-2, -2, 0], [2, -2, 0]];
  const interior: Vector3Tuple[] = [[1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0]];
  const hole: Vector3Tuple = [1, 1, 0];
  const cubie = (position: Vector3Tuple) => ({
    id: `c_${position.join(',')}`,
    homePosition: position,
    currentPosition: position,
    orientation: new Quaternion(),
    type: 'outer' as const,
  });
  const candidate = (cells: Vector3Tuple[], id: string) => ({
    id,
    family: 'subset' as const,
    axisIndex: 2 as const,
    axisName: 'Z' as const,
    layers: [0],
    pivot: [0, 0, 0] as Vector3Tuple,
    pivotInPlane: [0, 0] as [number, number],
    cells,
  });
  const full = validateTurnTargetRotation(
    [...corners, ...interior, hole].map(cubie),
    targetForCells(candidate([...corners, ...interior], 'synthetic-full')),
    90,
  );
  const envelopeOnly = validateTurnTargetRotation(
    [...corners, hole].map(cubie),
    targetForCells(candidate(corners, 'synthetic-envelope')),
    90,
  );
  assert.equal(full.legal, false);
  assert.equal(full.code, 'sweep-collision');
  assert.equal(full.blockingCubieId, 'c_1,1,0');
  assert.equal(envelopeOnly.legal, true);
});

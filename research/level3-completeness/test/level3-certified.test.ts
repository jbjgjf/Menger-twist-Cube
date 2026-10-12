/**
 * Tests for the Level 3 completeness result.
 *
 * Run: `npm run test:l3`.
 *
 * As at Level 2, the decisive tests do not scramble. They write down elements
 * of the group described by the structure theorem directly — even permutations
 * of chosen orbits, twists with sum zero on the C3 orbits, an even number of
 * flips on the D4 orbit — and require `level3-slice-reduction` to solve them,
 * both in its normal mode and restricted to the certified steps the proof
 * covers. The companion tests break one invariant at a time and require a
 * rejection that names it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Matrix4, Quaternion } from 'three';
import type { Cubie, MengerPuzzleState } from '@menger/engine';
import { createMengerPuzzleState } from '@menger/engine';
import { level3SliceReductionAlgorithm, mengerPuzzleModel } from '@menger/solver-core';
import { level3SliceReductionInternals } from '../../../packages/solver-core/src/algorithms/level3SliceReductionSolver';
import { rotations, sitePositions } from '../../scratch/l3sim';
import { N, ROT_ID, frameOf, orbits, rotInv, rotMul } from '../group';
import type { Frame } from '../group';

console.debug = () => {};

const quaternionOf = (rot: number): Quaternion => {
  const m = rotations[rot]!;
  return new Quaternion().setFromRotationMatrix(new Matrix4().set(m[0]!, m[1]!, m[2]!, 0, m[3]!, m[4]!, m[5]!, 0, m[6]!, m[7]!, m[8]!, 0, 0, 0, 0, 1));
};

/** mulberry32: a fixed seed keeps every run of this file identical. */
const createRng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const frames: Frame[] = orbits.map((_, orbit) => frameOf(orbit));
const orbitsOfKind = (kind: Frame['kind']): number[] => frames.filter((frame) => frame.kind === kind).map((frame) => frame.orbit);
const solved = createMengerPuzzleState(3);

/** State with piece j on site perm[j] wearing the twist tau[j] (an element of its orbit's H). */
const stateOf = (perm: number[], tau: number[]): MengerPuzzleState => ({
  ...solved,
  cubies: solved.cubies.map((cubie: Cubie, j: number) => {
    const ref = frames.find((frame) => frame.ref.has(j))!.ref;
    return {
      ...cubie,
      currentPosition: [...sitePositions[perm[j]!]!] as [number, number, number],
      // rot = ref[site] · tau · ref[home]^-1
      orientation: quaternionOf(rotMul[ref.get(perm[j]!)!]![rotMul[tau[j]!]![rotInv[ref.get(j)!]!]!]!),
    };
  }),
});

const identityPerm = (): number[] => Array.from({ length: N }, (_, i) => i);
const noTwist = (): number[] => new Array<number>(N).fill(ROT_ID);

/** Random twists inside the group O of the theorem: sum 0 on C3 orbits, an even number of flips on D4. */
const randomTwists = (rng: () => number): number[] => {
  const tau = noTwist();
  for (const frame of frames) {
    if (frame.kind === 'trivial') continue;
    const sites = orbits[frame.orbit]!;
    for (const site of sites) tau[site] = frame.freedom[Math.floor(rng() * frame.freedom.length)]!;
    const last = sites[sites.length - 1]!;
    if (frame.kind === 'C3') {
      const generator = frame.freedom.find((rot) => frame.exponent(rot) === 1)!;
      let sum = 0;
      for (const site of sites) sum += frame.exponent(tau[site]!);
      while (sum % 3 !== 0) { tau[last] = rotMul[generator]![tau[last]!]!; sum += 1; }
    }
    if (frame.kind === 'D4') {
      const flips = sites.filter((site) => !frame.cyclic.has(tau[site]!)).length;
      const flip = frame.freedom.find((rot) => !frame.cyclic.has(rot))!;
      if (flips % 2 !== 0) tau[last] = rotMul[flip]![tau[last]!]!;
    }
  }
  return tau;
};

/** A uniformly random even permutation of each listed orbit, identity elsewhere. */
const randomEvenPermutation = (rng: () => number, chosen: number[]): number[] => {
  const perm = identityPerm();
  for (const orbit of chosen) {
    const sites = orbits[orbit]!;
    const image = [...sites];
    let transpositions = 0;
    for (let i = image.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      if (i !== j) { [image[i], image[j]] = [image[j]!, image[i]!]; transpositions += 1; }
    }
    if (transpositions % 2 !== 0) [image[0], image[1]] = [image[1]!, image[0]!];
    sites.forEach((site, index) => { perm[site] = image[index]!; });
  }
  return perm;
};

const solveWith = async (state: MengerPuzzleState, certifiedOnly: boolean) => {
  level3SliceReductionInternals.certifiedOnly = certifiedOnly;
  try {
    return await level3SliceReductionAlgorithm.solve(mengerPuzzleModel, state);
  } finally {
    level3SliceReductionInternals.certifiedOnly = false;
  }
};

test('the certificate passes', () => {
  execFileSync('node', ['--import', 'tsx', 'research/level3-completeness/certify.ts'], { stdio: 'pipe' });
  const certificate = JSON.parse(readFileSync('research/level3-completeness/out/certificate.json', 'utf8')) as {
    ok: boolean;
    godsNumberLowerBound: { fromPositionGroup: number; fromFullGroup: number };
  };
  assert.equal(certificate.ok, true);
  assert.equal(certificate.godsNumberLowerBound.fromPositionGroup, 3207);
  assert.equal(certificate.godsNumberLowerBound.fromFullGroup, 3353);
});

test('every sampled twist state of O is solved, by the certified steps alone and in normal mode', async () => {
  const rng = createRng(20261010);
  for (let trial = 0; trial < 3; trial += 1) {
    const state = stateOf(identityPerm(), randomTwists(rng));
    // The descent of the normal mode takes minutes on ~700 twisted cells, so it runs once.
    for (const certifiedOnly of trial === 0 ? [true, false] : [true]) {
      const result = await solveWith(state, certifiedOnly);
      assert.equal(result.success, true, `trial ${trial}, certifiedOnly=${certifiedOnly}: ${result.notes}`);
    }
  }
});

test('even permutations of whole orbits with twists are solved by the certified steps alone', async () => {
  const rng = createRng(7);
  // One orbit of each kind the proof distinguishes: a C3 orbit, a C4 orbit, the D4
  // orbit (whose shipped tool is a double transposition), a 3+3 wide-tool orbit,
  // and a 384-cell orbit.
  const wide = 31;
  const large = orbits.findIndex((sites) => sites.length === 384);
  const chosen = [orbitsOfKind('C3')[0]!, orbitsOfKind('C4')[0]!, orbitsOfKind('D4')[0]!, wide, large];
  const state = stateOf(randomEvenPermutation(rng, chosen), randomTwists(rng));
  const result = await solveWith(state, true);
  assert.equal(result.success, true, result.notes);
});

test('a single twisted C3 cell is rejected with the twist-sum invariant', async () => {
  for (const orbit of orbitsOfKind('C3')) {
    const frame = frames[orbit]!;
    const tau = noTwist();
    tau[orbits[orbit]![3]!] = frame.freedom.find((rot) => rot !== ROT_ID)!;
    for (const certifiedOnly of [true, false]) {
      const result = await solveWith(stateOf(identityPerm(), tau), certifiedOnly);
      assert.equal(result.success, false);
      assert.match(result.notes, /non-zero twist sum/);
    }
  }
});

test('a single flipped D4 cell is rejected with the flip-parity invariant', async () => {
  const frame = frames[orbitsOfKind('D4')[0]!]!;
  for (const flip of frame.freedom.filter((rot) => !frame.cyclic.has(rot))) {
    const tau = noTwist();
    tau[orbits[frame.orbit]![5]!] = flip;
    for (const certifiedOnly of [true, false]) {
      const result = await solveWith(stateOf(identityPerm(), tau), certifiedOnly);
      assert.equal(result.success, false);
      assert.match(result.notes, /odd number of flipped cells/);
    }
  }
});

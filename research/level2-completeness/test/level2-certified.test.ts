/**
 * Tests for the Level 2 completeness result.
 *
 * Run: `npm run test:l2`.
 *
 * The decisive test here does not scramble: it samples states directly from the
 * set U of the theorem (admissible, parity vector in the span, twist sums and
 * flip parity zero) and requires `level2-certified` to solve each of them. That
 * exercises the claim "U is contained in G" on states no scramble of practical
 * length would produce. The companion test breaks one invariant at a time and
 * requires a rejection.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Matrix4, Quaternion } from 'three';
import type { Cubie, MengerPuzzleState, MoveSystem } from '@menger/engine';
import { createMengerPuzzleModel, createSeededRng, level2CertifiedAlgorithm, scrambleState } from '@menger/solver-core';
import { buildContext, createRng, rotations, rotInv, rotMul, siteOrbits } from '../group';

console.debug = () => {};

const quaternionOf = (turn: number): Quaternion => {
  const m = rotations[turn]!;
  return new Quaternion().setFromRotationMatrix(new Matrix4().set(m[0]!, m[1]!, m[2]!, 0, m[3]!, m[4]!, m[5]!, 0, m[6]!, m[7]!, m[8]!, 0, 0, 0, 0, 1));
};

/** Everything needed to write down an element of W by hand. */
const setup = (system: MoveSystem) => {
  const ctx = buildContext(system);
  const { orbitOf, orbits } = siteOrbits(ctx.N, ctx.atoms);
  const ref = new Int16Array(ctx.N).fill(-1);
  const freedom: number[][] = [];
  for (const orbit of orbits) {
    const base = orbit[0]!;
    ref[base] = 0;
    const seen = new Set([base * 24]);
    const queue = [base * 24];
    for (let head = 0; head < queue.length; head += 1) {
      const site = Math.floor(queue[head]! / 24);
      const turn = queue[head]! % 24;
      for (const atom of ctx.atoms) {
        const next = atom.perm[site]! * 24 + rotMul[atom.rot[site]!]![turn]!;
        if (seen.has(next)) continue;
        seen.add(next);
        if (ref[atom.perm[site]!] < 0) ref[atom.perm[site]!] = next % 24;
        queue.push(next);
      }
    }
    freedom.push([...seen].filter((v) => Math.floor(v / 24) === base).map((v) => v % 24));
  }
  const model = createMengerPuzzleModel(system);
  const solved = model.createState(2);
  /** State with piece j on site perm[j] and tau-coordinate tau[j]. */
  const stateOf = (perm: number[], tau: number[]): MengerPuzzleState => ({
    ...solved,
    cubies: solved.cubies.map((cubie: Cubie, j: number) => ({
      ...cubie,
      currentPosition: [...ctx.sites[perm[j]!]!] as [number, number, number],
      // rot = ref_p · tau · ref_j^-1
      orientation: quaternionOf(rotMul[ref[perm[j]!]!]![rotMul[tau[j]!]![rotInv[ref[j]!]!]!]!),
    })),
  });
  return { ctx, orbitOf, orbits, freedom, model, stateOf };
};

const certificate = (): {
  ok: boolean;
  standard: { parity: { basis: number[] } };
  innerSquare: { parity: { basis: number[] } };
} => JSON.parse(readFileSync('research/level2-completeness/out/certificate.json', 'utf8'));

const inSpan = (vector: number, basis: number[]): boolean => {
  let residue = vector;
  for (const row of basis) if (residue & (row & -row)) residue ^= row;
  return residue === 0;
};

const orderOf = (turn: number): number => {
  let k = 1;
  for (let x = turn; x !== 0; x = rotMul[turn]![x]!) k += 1;
  return k;
};

/** A uniformly random element of U (up to the choice of parity vector in the span). */
const sampleU = (s: ReturnType<typeof setup>, basis: number[], rng: () => number) => {
  const { ctx, orbits, freedom } = s;
  const perm = Array.from({ length: ctx.N }, (_, i) => i);
  const tau = new Array<number>(ctx.N).fill(0);
  let target = 0;
  for (const row of basis) if (rng() < 0.5) target ^= row;
  orbits.forEach((orbit, index) => {
    const shuffled = [...orbit];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    // Parity of the permutation orbit[i] -> shuffled[i].
    const image = new Map(orbit.map((site, i) => [site, shuffled[i]!]));
    const seen = new Set<number>();
    let odd = 0;
    for (const start of orbit) {
      let length = 0;
      for (let cursor = start; !seen.has(cursor); cursor = image.get(cursor)!) {
        seen.add(cursor);
        length += 1;
      }
      if (length > 0 && length % 2 === 0) odd ^= 1;
    }
    if (odd !== ((target >> index) & 1)) [shuffled[0], shuffled[1]] = [shuffled[1]!, shuffled[0]!];
    orbit.forEach((site, i) => {
      perm[site] = shuffled[i]!;
    });

    const H0 = freedom[index]!;
    for (const site of orbit) tau[site] = H0[Math.floor(rng() * H0.length)]!;
    const last = orbit.at(-1)!;
    if (H0.length === 3) {
      // Twist sum zero: choose the last cell so the product of all taus is 1.
      let product = 0;
      for (const site of orbit.slice(0, -1)) product = rotMul[product]![tau[site]!]!;
      tau[last] = rotInv[product]!;
    } else if (H0.length === 8) {
      const quarter = H0.find((h) => orderOf(h) === 4)!;
      const cyclic = new Set([0, quarter, rotMul[quarter]![quarter]!, rotInv[quarter]!]);
      const flips = orbit.filter((site) => !cyclic.has(tau[site]!)).length;
      if (flips % 2 === 1) tau[last] = rotMul[H0.find((h) => !cyclic.has(h))!]![tau[last]!]!;
    }
  });
  return { perm, tau };
};

const assertSolves = async (system: MoveSystem, state: MengerPuzzleState, label: string): Promise<number> => {
  const model = createMengerPuzzleModel(system);
  const result = await level2CertifiedAlgorithm.solve(model, model.cloneState(state));
  assert.equal(result.success, true, `${label}: ${result.notes}`);
  let current = model.cloneState(state);
  for (const move of result.output_moves) {
    assert.equal(model.isMoveLegal(current, move), true, `${label}: ${move.notation} illegal`);
    current = model.applyMove(current, move);
  }
  assert.equal(model.isSolved(current), true, `${label}: replay not solved`);
  return result.move_count;
};

test('the certificate script passes every check of the proof (both move systems)', () => {
  const output = execFileSync('node', ['--import', 'tsx', 'research/level2-completeness/certify.ts'], { encoding: 'utf8' });
  assert.match(output, /all checks passed/);
  assert.match(output, /\[H:G\] = 2/);
  assert.equal(certificate().ok, true);
});

for (const system of ['standard', 'inner-square'] as const) {
  test(`${system}: random elements of U, built without using any move, are all solved`, async () => {
    const s = setup(system);
    const basis = system === 'standard' ? certificate().standard.parity.basis : certificate().innerSquare.parity.basis;
    const rng = createRng(system === 'standard' ? 20261004 : 20261005);
    let worst = 0;
    for (let trial = 0; trial < 12; trial += 1) {
      const { perm, tau } = sampleU(s, basis, rng);
      worst = Math.max(worst, await assertSolves(system, s.stateOf(perm, tau), `${system} trial ${trial}`));
    }
    assert.ok(worst > 0);
  });

  test(`${system}: a state violating exactly one invariant is rejected`, async () => {
    const s = setup(system);
    const basis = system === 'standard' ? certificate().standard.parity.basis : certificate().innerSquare.parity.basis;
    const identity = Array.from({ length: s.ctx.N }, (_, i) => i);
    const zeros = new Array<number>(s.ctx.N).fill(0);
    const rejects = async (perm: number[], tau: number[], pattern: RegExp, label: string) => {
      const result = await level2CertifiedAlgorithm.solve(s.model, s.stateOf(perm, tau));
      assert.equal(result.success, false, label);
      assert.match(result.notes, pattern, label);
    };

    // One twisted corner in each C3 orbit, one flipped cell in the D4 orbit.
    for (const [index, H0] of s.freedom.entries()) {
      if (H0.length !== 3 && H0.length !== 8) continue;
      const tau = [...zeros];
      const quarter = H0.find((h) => orderOf(h) === 4);
      tau[s.orbits[index]![0]!] = H0.length === 3 ? H0.find((h) => h !== 0)! : H0.find((h) => h !== 0 && orderOf(h) === 2 && h !== rotMul[quarter!]![quarter!]!)!;
      await rejects(identity, tau, H0.length === 3 ? /twist sum/ : /flip parity/, `orbit ${index}`);
    }

    // A single transposition inside one orbit whose unit vector is outside the span.
    const lonely = s.orbits.findIndex((_, index) => !inSpan(1 << index, basis));
    assert.ok(lonely >= 0);
    const swapped = [...identity];
    const [a, b] = s.orbits[lonely]!;
    [swapped[a!], swapped[b!]] = [b!, a!];
    await rejects(swapped, zeros, /parity vector/, 'transposition');

    // An orientation outside the cell's automaton, and a cell on a foreign orbit.
    const trivial = s.freedom.findIndex((H0) => H0.length === 1);
    const turned = [...zeros];
    turned[s.orbits[trivial]![0]!] = 1;
    await rejects(identity, turned, /never takes/, 'inadmissible orientation');
    const crossed = [...identity];
    const [p, q] = [s.orbits[0]![0]!, s.orbits[1]![0]!];
    [crossed[p], crossed[q]] = [q, p];
    await rejects(crossed, zeros, /outside its site orbit/, 'foreign orbit');
  });

  test(`${system}: seeded scrambles with the full move set are solved`, async () => {
    const model = createMengerPuzzleModel(system);
    for (let seed = 1; seed <= 8; seed += 1) {
      const { state } = scrambleState(model, model.createState(2), createSeededRng(seed), 80);
      await assertSolves(system, state, `${system} seed ${seed}`);
    }
  });
}

test('the two systems differ exactly by the parity span: a ψ = 1 state is rejected by standard, solved by inner-square', async () => {
  const inner = createMengerPuzzleModel('inner-square');
  const start = inner.createState(2);
  const ring = inner.legalMoves(start).find((move) => move.targetId === 'ring:Z+3:inner' && move.angle === 90)!;
  const state = inner.applyMove(start, ring);
  await assertSolves('inner-square', state, 'ring move');
  const standard = createMengerPuzzleModel('standard');
  const result = await level2CertifiedAlgorithm.solve(standard, { ...standard.createState(2), cubies: state.cubies });
  assert.equal(result.success, false);
  assert.match(result.notes, /parity vector/);
});

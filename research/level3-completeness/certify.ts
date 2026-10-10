/**
 * Machine check of the computational facts behind the Level 3 structure theorem
 * and the completion lemmas of `docs/proofs/level3-completeness.tex`.
 *
 * Run: `node --import tsx research/level3-completeness/certify.ts`
 * Writes `research/level3-completeness/out/certificate.json` and exits non-zero
 * if any check fails. No random numbers; every word is checked on all 8000 cells.
 *
 * Checks:
 *   (C1) the atom set: 3,591 atoms, closed under inverses;
 *   (C2) the 164 site orbits;
 *   (C3) the (site, orientation) automaton of each orbit and its freedom H;
 *   (C4) the span of the atoms' orbit-parity vectors (rank 15);
 *   (C5) a globally pure 3-cycle in every orbit (133 shipped, 31 derived);
 *   (C6) invariance: every atom has twist sum 0 on each C3 orbit and an even
 *        number of flips on the D4 orbit;
 *   (C7) single-cell rolls realize the whole rotation part at every cell of the
 *        C4 and D4 orbits;
 *   (C8) the two-cell twisters of the C3 orbits and the two-cell flip of the D4
 *        orbit;
 *   (C9) the resulting group orders and the counting bound on God's number.
 *
 * That each orbit's permutation group contains Alt(orbit) is checked separately
 * by `research/scratch/l3-orbit-groups.ts` (`npm run verify:l3`).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { level3PureToolWords } from '../../packages/solver-core/src/algorithms/level3SliceReductionToolData';
import { ROT_ID, atoms, frameOf, fullAction, inverseAtom, N, orbitOf, orbits, parityVector, resolveWord, rotInv, rotMul } from './group';
import type { Action, Frame } from './group';

const tools = JSON.parse(readFileSync('research/level3-completeness/out/tools.json', 'utf8')) as {
  threeCycles: Array<{ orbit: number; word: string[] }>;
  c3Twisters: Array<{ orbit: number; word: string[] }>;
  d4Orbit: number;
  d4FlipPairWord: string[];
};

const failures: string[] = [];
const check = (condition: boolean, message: string): void => {
  if (!condition) failures.push(message);
};

// (C1)
check(atoms.length === 3591, `C1: ${atoms.length} atoms, expected 3591`);
check(atoms.every((atom) => inverseAtom(atom) !== undefined), 'C1: an atom has no inverse atom');

// (C2)
const sizeCounts = new Map<number, number>();
for (const sites of orbits) sizeCounts.set(sites.length, (sizeCounts.get(sites.length) ?? 0) + 1);
check(orbits.length === 164, `C2: ${orbits.length} orbits, expected 164`);

// (C3)
const frames: Frame[] = orbits.map((_, orbit) => frameOf(orbit));
const kindOrbits = { trivial: [] as number[], C3: [] as number[], C4: [] as number[], D4: [] as number[] };
for (const frame of frames) kindOrbits[frame.kind].push(frame.orbit);
check(kindOrbits.C3.length === 4 && kindOrbits.C3.every((orbit) => orbits[orbit]!.length === 8), 'C3: expected four C3 orbits of size 8');
check(kindOrbits.C4.length === 11, 'C3: expected eleven C4 orbits');
check(kindOrbits.D4.length === 1 && kindOrbits.D4[0] === tools.d4Orbit, 'C3: expected the one D4 orbit named by the tool data');
const cellsOf = (list: number[]): number => list.reduce((sum, orbit) => sum + orbits[orbit]!.length, 0);

// (C4)
const highBit = (value: bigint): number => value.toString(2).length - 1;
const parityBasis: bigint[] = [];
const reduce = (vector: bigint): bigint => {
  let v = vector;
  for (const row of parityBasis) if ((v >> BigInt(highBit(row))) & 1n) v ^= row;
  return v;
};
const distinctParity = new Set<string>();
for (const atom of atoms) {
  const vector = parityVector((site) => atom.map.get(site) ?? site, atom.map.keys());
  if (vector !== 0n) distinctParity.add(vector.toString(16));
  const rest = reduce(vector);
  if (rest !== 0n) { parityBasis.push(rest); parityBasis.sort((a, b) => highBit(b) - highBit(a)); }
}
check(parityBasis.length === 15, `C4: parity rank ${parityBasis.length}, expected 15`);

// (C5)
const threeCycleOrbits = new Set<number>();
const moved = (action: Action): number[] => [...action].filter(([site, [to]]) => site !== to).map(([site]) => site);
const isPureThreeCycle = (action: Action, orbit: number): boolean =>
  moved(action).length === 3 &&
  [...action].every(([site, [to, rot]]) => (site === to ? rot === ROT_ID : orbitOf[site] === orbit));
let shippedThreeCycles = 0;
for (const record of level3PureToolWords) {
  const action = fullAction(resolveWord(record.word));
  if (moved(action).length !== 3) continue;
  check(isPureThreeCycle(action, record.orbit), `C5: shipped tool of orbit ${record.orbit} is not a pure 3-cycle`);
  threeCycleOrbits.add(record.orbit);
  shippedThreeCycles += 1;
}
for (const record of tools.threeCycles) {
  check(isPureThreeCycle(fullAction(resolveWord(record.word)), record.orbit), `C5: derived word of orbit ${record.orbit} is not a pure 3-cycle`);
  check(!threeCycleOrbits.has(record.orbit), `C5: orbit ${record.orbit} has two 3-cycle records`);
  threeCycleOrbits.add(record.orbit);
}
check(threeCycleOrbits.size === orbits.length, `C5: ${threeCycleOrbits.size}/${orbits.length} orbits have a pure 3-cycle`);

// (C6)
let invariantViolations = 0;
for (const atom of atoms) {
  for (const orbit of kindOrbits.C3) {
    const frame = frames[orbit]!;
    let sum = 0;
    for (const site of orbits[orbit]!) {
      const to = atom.map.get(site);
      if (to !== undefined) sum += frame.exponent(frame.twist(site, to, atom.rot));
    }
    if (sum % 3 !== 0) invariantViolations += 1;
  }
  for (const orbit of kindOrbits.D4) {
    const frame = frames[orbit]!;
    let flips = 0;
    for (const site of orbits[orbit]!) {
      const to = atom.map.get(site);
      if (to !== undefined && !frame.cyclic.has(frame.twist(site, to, atom.rot))) flips += 1;
    }
    if (flips % 2 !== 0) invariantViolations += 1;
  }
}
check(invariantViolations === 0, `C6: ${invariantViolations} atom/orbit pairs break a twist-sum or flip-parity invariant`);

// (C7)
const rollsAt = new Map<number, Set<number>>();
for (const atom of atoms) {
  if (atom.map.size !== 1) continue;
  const [[site, to]] = [...atom.map] as [[number, number]];
  if (site !== to) continue;
  const set = rollsAt.get(site) ?? new Set<number>();
  set.add(atom.rot);
  rollsAt.set(site, set);
}
let rollCells = 0;
for (const orbit of [...kindOrbits.C4, ...kindOrbits.D4]) {
  const frame = frames[orbit]!;
  for (const site of orbits[orbit]!) {
    const ref = frame.ref.get(site)!;
    const wanted = [...frame.cyclic].filter((rot) => rot !== ROT_ID).map((rot) => rotMul[ref]![rotMul[rot]![rotInv[ref]!]!]!);
    const have = rollsAt.get(site) ?? new Set<number>();
    check(wanted.every((rot) => have.has(rot)), `C7: cell ${site} of orbit ${orbit} lacks a single-cell roll`);
    rollCells += 1;
  }
}

// (C8)
check(
  tools.c3Twisters.length === kindOrbits.C3.length &&
  kindOrbits.C3.every((orbit) => tools.c3Twisters.some((record) => record.orbit === orbit)),
  'C8: not every C3 orbit has a twister record',
);
for (const record of tools.c3Twisters) {
  const frame = frames[record.orbit]!;
  const action = fullAction(resolveWord(record.word));
  const exponents: number[] = [];
  let clean = frame.kind === 'C3';
  for (const [site, [to, rot]] of action) {
    if (site !== to || orbitOf[site] !== record.orbit) { clean = false; break; }
    exponents.push(frame.exponent(frame.twist(site, to, rot)));
  }
  check(
    clean && exponents.length === 2 && exponents.every((e) => e !== 0) && (exponents[0]! + exponents[1]!) % 3 === 0,
    `C8: twister of orbit ${record.orbit} is not a two-cell twist (c, -c)`,
  );
}
{
  const frame = frames[tools.d4Orbit]!;
  const action = fullAction(resolveWord(tools.d4FlipPairWord));
  let flips = 0;
  let clean = true;
  for (const [site, [to, rot]] of action) {
    if (site !== to || orbitOf[site] !== tools.d4Orbit) { clean = false; break; }
    if (!frame.cyclic.has(frame.twist(site, to, rot))) flips += 1;
  }
  check(clean && flips === 2, 'C8: the D4 word does not flip exactly two cells of the D4 orbit');
}

// (C9)
const factorial = (n: number): bigint => {
  let out = 1n;
  for (let i = 2n; i <= BigInt(n); i += 1n) out *= i;
  return out;
};
const log10 = (value: bigint): number => {
  const digits = value.toString();
  return digits.length - 1 + Math.log10(Number(`${digits[0]}.${digits.slice(1, 16)}`));
};
/** The least d with 1 + M + ... + M^d >= size: no shorter word list can cover `size` states. */
const countingBound = (size: bigint): number => {
  const M = BigInt(atoms.length);
  let words = 1n;
  let power = 1n;
  let d = 0;
  while (words < size) { power *= M; words += power; d += 1; }
  return d;
};
let alternatingOrder = 1n;
for (const sites of orbits) alternatingOrder *= factorial(sites.length) / 2n;
const positionOrder = alternatingOrder * 2n ** BigInt(parityBasis.length);
const orientationOrder =
  3n ** BigInt(cellsOf(kindOrbits.C3) - kindOrbits.C3.length) *
  4n ** BigInt(cellsOf(kindOrbits.C4)) *
  (8n ** BigInt(cellsOf(kindOrbits.D4)) / 2n);
const groupOrder = positionOrder * orientationOrder;

const certificate = {
  ok: failures.length === 0,
  failures,
  atoms: atoms.length,
  cells: N,
  orbits: { count: orbits.length, sizes: Object.fromEntries([...sizeCounts].sort((a, b) => a[0] - b[0])) },
  freedom: {
    trivial: { orbits: kindOrbits.trivial.length, cells: cellsOf(kindOrbits.trivial) },
    C3: { orbits: kindOrbits.C3, cells: cellsOf(kindOrbits.C3) },
    C4: { orbits: kindOrbits.C4, cells: cellsOf(kindOrbits.C4) },
    D4: { orbits: kindOrbits.D4, cells: cellsOf(kindOrbits.D4) },
  },
  parity: { distinctVectors: distinctParity.size, rank: parityBasis.length },
  threeCycles: { shipped: shippedThreeCycles, derived: tools.threeCycles.length, orbitsCovered: threeCycleOrbits.size },
  invariants: { atomsChecked: atoms.length, violations: invariantViolations },
  rolls: { cellsChecked: rollCells },
  orders: {
    log10AlternatingProduct: log10(alternatingOrder),
    log10Position: log10(positionOrder),
    log10Orientation: log10(orientationOrder),
    log10Group: log10(groupOrder),
    group: groupOrder.toString(),
  },
  godsNumberLowerBound: {
    fromAlternatingProduct: countingBound(alternatingOrder),
    fromPositionGroup: countingBound(positionOrder),
    fromFullGroup: countingBound(groupOrder),
  },
};

mkdirSync('research/level3-completeness/out', { recursive: true });
writeFileSync('research/level3-completeness/out/certificate.json', `${JSON.stringify(certificate, null, 2)}\n`);

const { group: _group, ...ordersToPrint } = certificate.orders;
console.log(JSON.stringify({ ...certificate, orders: ordersToPrint }, null, 2));
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');

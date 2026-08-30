/**
 * Step 4: orbit-parity normalization.
 *
 * Run: `npx tsx research/scratch/l3-parity.ts` from the repo root.
 *
 * Every solving tool is a commutator, and the restriction of a commutator to an
 * orbit is the commutator of the restrictions — so tools are **even on every
 * orbit**. Permutation parity per orbit is therefore an invariant of the whole
 * solve, and has to be fixed once, up front, by applying raw turns.
 *
 * Level 2 does this with an F2 linear system over 11 orbit-parity bits. Level 3
 * has 164, so this measures the parity space: which orbits can be flipped at
 * all, the rank of the span, and a minimal generating set for the solver to
 * solve against. Vectors are BigInt bitmasks since 164 bits exceed a word.
 */
import { atoms, N, siteClasses } from './l3sim';

// ---------- orbits ----------
const parent = new Int32Array(N).map((_, i) => i);
const findRoot = (x: number): number => {
  let r = x;
  while (parent[r] !== r) r = parent[r]!;
  while (parent[x] !== r) { const n = parent[x]!; parent[x] = r; x = n; }
  return r;
};
for (const a of atoms) for (const [from, to] of a.map) {
  if (from === to) continue;
  const ra = findRoot(from); const rb = findRoot(to);
  if (ra !== rb) parent[ra] = rb;
}
const orbitOfSite = new Int32Array(N).fill(-1);
const orbitSites: number[][] = [];
{
  const idx = new Map<number, number>();
  for (let i = 0; i < N; i += 1) {
    const r = findRoot(i);
    let k = idx.get(r);
    if (k === undefined) { k = orbitSites.length; orbitSites.push([]); idx.set(r, k); }
    orbitOfSite[i] = k; orbitSites[k]!.push(i);
  }
}
const O = orbitSites.length;
console.log(`orbits: ${O}, cells: ${N}\n`);

// ---------- parity vector of each atom ----------
// A permutation restricted to an orbit is odd exactly when it has an odd number
// of even-length cycles.
const parityVector = (atomIndex: number): bigint => {
  const a = atoms[atomIndex]!;
  let vec = 0n;
  const seen = new Set<number>();
  for (const [from] of a.map) {
    if (seen.has(from)) continue;
    let len = 0;
    let cur = from;
    do {
      seen.add(cur);
      cur = a.map.get(cur) ?? cur;
      len += 1;
    } while (cur !== from);
    if (len % 2 === 0) vec ^= 1n << BigInt(orbitOfSite[from]!);
  }
  return vec;
};

const vectors: Array<{ index: number; vec: bigint }> = [];
for (let i = 0; i < atoms.length; i += 1) {
  const vec = parityVector(i);
  if (vec !== 0n) vectors.push({ index: i, vec });
}
console.log(`atoms with a non-trivial parity vector: ${vectors.length}/${atoms.length}`);
const distinct = new Set(vectors.map((v) => v.vec.toString(16)));
console.log(`distinct non-zero parity vectors: ${distinct.size}`);

// ---------- rank over F2, keeping a generating set ----------
const basis: Array<{ vec: bigint; from: number }> = [];
const highBit = (v: bigint): number => v.toString(2).length - 1;
for (const { index, vec } of vectors) {
  let v = vec;
  for (const b of basis) {
    const h = highBit(b.vec);
    if ((v >> BigInt(h)) & 1n) v ^= b.vec;
  }
  if (v !== 0n) {
    basis.push({ vec: v, from: index });
    basis.sort((p, q) => highBit(q.vec) - highBit(p.vec));
  }
}
console.log(`rank of the parity space over F2: ${basis.length} (of ${O} orbits)\n`);

// ---------- which orbits can be flipped at all ----------
let flippable = 0n;
for (const { vec } of vectors) flippable |= vec;
const flippableOrbits: number[] = [];
for (let o = 0; o < O; o += 1) if ((flippable >> BigInt(o)) & 1n) flippableOrbits.push(o);

const byClass = new Map<string, { total: number; flip: number; cells: number }>();
for (let o = 0; o < O; o += 1) {
  const cls = `${String(orbitSites[o]!.length).padStart(4)}  ${siteClasses[orbitSites[o]![0]!]!}`;
  const r = byClass.get(cls) ?? { total: 0, flip: 0, cells: 0 };
  r.total += 1;
  r.cells += orbitSites[o]!.length;
  if ((flippable >> BigInt(o)) & 1n) r.flip += 1;
  byClass.set(cls, r);
}
console.log('size  class          orbits  parity-flippable');
for (const [cls, r] of [...byClass].sort()) {
  console.log(`${cls.padEnd(18)} ${String(r.total).padStart(6)} ${String(r.flip).padStart(17)}`);
}

const fixedParity = O - flippableOrbits.length;
console.log(`\norbits whose parity no single turn can flip: ${fixedParity}`);
console.log('  (their permutation parity is invariant under the whole move group,');
console.log('   so it is always even on a reachable state and needs no normalization)');
console.log(`\nA reachable state's parity vector is a sum of atom vectors by construction,`);
console.log(`so it always lies in the span — the F2 system the solver solves is never`);
console.log(`inconsistent for a legally scrambled cube. Rank ${basis.length} means at most`);
console.log(`${basis.length} raw turns are ever needed to normalize parity.`);

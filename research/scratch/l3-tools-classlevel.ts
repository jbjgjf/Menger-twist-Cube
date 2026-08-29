/**
 * Globally pure tools from the class-level construction, counted per orbit.
 *
 * Run: `npx tsx research/scratch/l3-tools-classlevel.ts` from the repo root.
 *
 * `l3-tool-inventory.ts` builds tools orbit by orbit, which gives short words
 * (4-8 atoms) and settles the small orbits completely, but its interchange only
 * reaches global purity up to orbit size 24. The older class-level family —
 * interchanged `[frame, depth-2/2.5]` commutators, 16 atoms — is globally pure
 * by construction and reaches the large orbits instead. The two are
 * complementary, so step 2's coverage is the union.
 */
import {
  ROT_ID, actionOver, atoms, atomsOfFamily, commutatorCandidates, commutatorWord,
  N, siteClasses, type Atom,
} from './l3sim';

const parent = new Int32Array(N).map((_, i) => i);
const findRoot = (x: number): number => { let r = x; while (parent[r] !== r) r = parent[r]!; while (parent[x] !== r) { const n = parent[x]!; parent[x] = r; x = n; } return r; };
for (const a of atoms) for (const [from, to] of a.map) { if (from === to) continue; const ra = findRoot(from); const rb = findRoot(to); if (ra !== rb) parent[ra] = rb; }
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
const pureCount = new Int32Array(O);
const purePairs: Array<Set<number>> = orbitSites.map(() => new Set<number>());

const started = performance.now();
const frameAtoms = atomsOfFamily('frame-s1', 'frame-s3', 'frame-s9');
const localAtoms = atomsOfFamily('ext-d2', 'ext-d2.5');

interface Seed { word: Atom[]; sup: number[] }
const seeds: Seed[] = [];
{
  const seen = new Set<string>();
  for (const f of frameAtoms) for (const e of localAtoms) {
    let touches = false;
    for (const s of e.map.keys()) if (f.map.has(s)) { touches = true; break; }
    if (!touches) continue;
    const word = commutatorWord([f], [e]);
    const action = actionOver(word, commutatorCandidates([f], [e]));
    if (action.moves.size === 0 || action.moves.size > 9) continue;
    const sup = [...action.moves.keys()].sort((a, b) => a - b);
    const key = sup.map((i) => `${i}>${action.moves.get(i)![0]}#${action.moves.get(i)![1]}`).join(';');
    if (seen.has(key)) continue;
    seen.add(key);
    seeds.push({ word, sup });
  }
}
console.log(`seeds: ${seeds.length} (${((performance.now() - started) / 1000).toFixed(0)}s)`);

const bySite = new Map<number, number[]>();
seeds.forEach((s, i) => { for (const x of s.sup) { const l = bySite.get(x) ?? []; l.push(i); bySite.set(x, l); } });

for (let i = 0; i < seeds.length; i += 1) {
  const w1 = seeds[i]!;
  const partners = new Set<number>();
  for (const s of w1.sup) for (const j of bySite.get(s) ?? []) if (j > i) partners.add(j);
  for (const j of partners) {
    const action = actionOver(commutatorWord(w1.word, seeds[j]!.word), commutatorCandidates(w1.word, seeds[j]!.word));
    const src: number[] = []; const dst: number[] = [];
    let ok = true;
    for (const [s, [to, rot]] of action.moves) {
      if (to === s) { if (rot !== ROT_ID) { ok = false; break; } continue; }
      src.push(s); dst.push(to);
      if (src.length > 3) { ok = false; break; }
    }
    if (!ok || src.length !== 3) continue;
    const o = orbitOfSite[src[0]!]!;
    if (src.some((s) => orbitOfSite[s] !== o)) continue;
    const perm = new Map(src.map((s, k) => [s, dst[k]!]));
    let cur = src[0]!;
    for (let k = 0; k < 3; k += 1) cur = perm.get(cur)!;
    if (cur !== src[0]!) continue;
    pureCount[o] += 1;
    for (let k = 0; k < 3; k += 1) { purePairs[o]!.add(src[k]! * N + dst[k]!); purePairs[o]!.add(dst[k]! * N + src[k]!); }
  }
}

console.log(`interchange done (${((performance.now() - started) / 1000).toFixed(0)}s)\n`);
console.log('size  class          orbits  globally pure  pair coverage');
const rows = new Map<string, { n: number; pure: number; cov: number[] }>();
for (let o = 0; o < O; o += 1) {
  const size = orbitSites[o]!.length;
  const key = `${String(size).padStart(4)}  ${siteClasses[orbitSites[o]![0]!]!.padEnd(12)}`;
  const r = rows.get(key) ?? { n: 0, pure: 0, cov: [] };
  r.n += 1;
  if (pureCount[o]! > 0) r.pure += 1;
  r.cov.push(purePairs[o]!.size / (size * (size - 1)));
  rows.set(key, r);
}
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; };
for (const [key, r] of [...rows].sort()) {
  console.log(`${key} ${String(r.n).padStart(6)} ${String(r.pure).padStart(14)}  ${(100 * median(r.cov)).toFixed(1).padStart(12)}%`);
}
const n = [...pureCount].filter((c) => c > 0).length;
const cells = orbitSites.reduce((acc, s, o) => acc + (pureCount[o]! > 0 ? s.length : 0), 0);
console.log(`\nglobally pure (class-level): ${n}/${O} orbits, ${cells}/${N} cells`);

/**
 * Step 5b: a tightening ladder for the orbits that block the phase order.
 *
 * Run: `npx tsx research/scratch/l3-tight-seeds.ts` from the repo root.
 *
 * Level 2 reaches pure 3-cycles in two rungs: atoms move ~44 cells, [frame,
 * E1/slab] commutators cut that to <= 9, and interchanging two of those lands on
 * exactly 3. Level 3 starts far wider — frames move 296 to 2,667 cells — so one
 * rung is not enough, which is why step 2's orbit-local tools bottom out at ~50
 * cells of global support and never interchange down to 3.
 *
 * This measures the missing rung. Step 2 rejected [frame, depth-1/1.5] because
 * nothing came in under support 9; but a seed does not have to be that tight to
 * be *useful* as an intermediate. The question here is what the support
 * distribution actually looks like, and whether interchanging at a relaxed
 * threshold reaches the orbits that block the phase order:
 *
 *   ECC, ECE/*        b = C, so only frames and depth-1/1.5 touch them
 *   EEC/B|b, EEE/B*   b = E but "oblique", missed by the class-level family
 */
import {
  ROT_ID, actionOver, atoms, atomsOfFamily, commutatorCandidates, commutatorWord,
  N, siteClasses, type Atom,
} from './l3sim';

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

const blockingClasses = new Set(['ECC', 'ECE/Bo', 'ECE/B|o', 'EEC/B|b', 'EEE/Bo|b', 'EEE/B|bo', 'EEE/B|b|o']);
const isBlocking = (o: number) => blockingClasses.has(siteClasses[orbitSites[o]![0]!]!);
const blockingOrbits = Array.from({ length: O }, (_, o) => o).filter(isBlocking);
console.log(`orbits blocking the phase order: ${blockingOrbits.length}\n`);

// ---------- rung 1: [frame, depth-1/1.5] support distribution ----------
const frames = atomsOfFamily('frame-s1', 'frame-s3', 'frame-s9');
const coarse = atomsOfFamily('ext-d1', 'ext-d1.5');
console.log(`frames ${frames.length}, depth-1/1.5 atoms ${coarse.length}, pairs ${(frames.length * coarse.length).toLocaleString()}`);

interface Seed { word: Atom[]; sup: number[] }
const seeds: Seed[] = [];
const histogram = new Map<number, number>();
{
  const started = performance.now();
  const seen = new Set<string>();
  for (const f of frames) {
    for (const e of coarse) {
      let touches = false;
      for (const s of e.map.keys()) if (f.map.has(s)) { touches = true; break; }
      if (!touches) continue;
      const word = commutatorWord([f], [e]);
      const action = actionOver(word, commutatorCandidates([f], [e]));
      const size = action.moves.size;
      if (size === 0) continue;
      const bucket = size <= 8 ? size : size <= 16 ? 16 : size <= 32 ? 32 : size <= 64 ? 64 : size <= 128 ? 128 : 999;
      histogram.set(bucket, (histogram.get(bucket) ?? 0) + 1);
      if (size > 40) continue;
      const sup = [...action.moves.keys()].sort((a, b) => a - b);
      const key = sup.map((i) => `${i}>${action.moves.get(i)![0]}#${action.moves.get(i)![1]}`).join(';');
      if (seen.has(key)) continue;
      seen.add(key);
      seeds.push({ word, sup });
    }
  }
  console.log(`support distribution (bucket:count): ${[...histogram].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k === 999 ? '>128' : `<=${k}`}:${v}`).join(' ')}`);
  console.log(`seeds kept (support <= 40): ${seeds.length} (${((performance.now() - started) / 1000).toFixed(0)}s)\n`);
}

// ---------- rung 2: interchange them ----------
const pureOrbits = new Uint8Array(O);
const pureCount = new Int32Array(O);
{
  const started = performance.now();
  const bySite = new Map<number, number[]>();
  seeds.forEach((s, i) => { for (const x of s.sup) { const l = bySite.get(x) ?? []; l.push(i); bySite.set(x, l); } });
  let tested = 0;
  for (let i = 0; i < seeds.length; i += 1) {
    const partners = new Set<number>();
    for (const s of seeds[i]!.sup) for (const j of bySite.get(s) ?? []) if (j > i) partners.add(j);
    for (const j of partners) {
      // One shared cell *guarantees* a 3-cycle, but seeds built from the same
      // frame overlap heavily, and none of these pairs meets in exactly one.
      // Overlap is therefore only a ranking heuristic here — the verdict comes
      // from the computed action.
      let sh = 0;
      for (const s of seeds[i]!.sup) { if (seeds[j]!.sup.includes(s)) { sh += 1; if (sh > 4) break; } }
      if (sh < 1 || sh > 4) continue;
      tested += 1;
      const action = actionOver(commutatorWord(seeds[i]!.word, seeds[j]!.word), commutatorCandidates(seeds[i]!.word, seeds[j]!.word));
      const src: number[] = [];
      let ok = true;
      for (const [s, [to, rot]] of action.moves) {
        if (to === s) { if (rot !== ROT_ID) { ok = false; break; } continue; }
        src.push(s);
        if (src.length > 3) { ok = false; break; }
      }
      if (!ok || src.length !== 3) continue;
      const o = orbitOfSite[src[0]!]!;
      if (src.some((s) => orbitOfSite[s] !== o)) continue;
      pureOrbits[o] = 1;
      pureCount[o] += 1;
    }
  }
  console.log(`interchange: ${tested.toLocaleString()} low-overlap pairs tested (${((performance.now() - started) / 1000).toFixed(0)}s)`);
}

// ---------- report ----------
const covered = blockingOrbits.filter((o) => pureOrbits[o] === 1);
console.log(`\nblocking orbits now with a globally pure tool: ${covered.length}/${blockingOrbits.length}`);
const rows = new Map<string, { n: number; got: number; tools: number }>();
for (const o of blockingOrbits) {
  const cls = siteClasses[orbitSites[o]![0]!]!;
  const r = rows.get(cls) ?? { n: 0, got: 0, tools: 0 };
  r.n += 1;
  if (pureOrbits[o]) { r.got += 1; r.tools += pureCount[o]!; }
  rows.set(cls, r);
}
console.log('\nclass          orbits  now pure  tools');
for (const [cls, r] of [...rows].sort()) {
  console.log(`${cls.padEnd(12)} ${String(r.n).padStart(7)} ${String(r.got).padStart(9)} ${String(r.tools).padStart(6)}`);
}
const total = Array.from({ length: O }, (_, o) => o).filter((o) => pureOrbits[o] === 1).length;
console.log(`\n(this family alone yields globally pure tools on ${total}/${O} orbits overall)`);

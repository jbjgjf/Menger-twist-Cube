/**
 * Step 2 deliverable: a pure 3-cycle tool for every orbit.
 *
 * Run: `npx tsx research/scratch/l3-tool-inventory.ts` from the repo root.
 *
 * Step 1 proved Alt(orbit) <= G on all 164 orbits, so the tools exist; this
 * finds them. Two grades are needed, because a tool may only run while the
 * orbits it disturbs are still unsolved:
 *
 *   orbit-local   a 3-cycle on the target orbit, disturbing others — usable
 *                 early. Built from bare atoms, so only 4 atoms long, against
 *                 the 16 Level 2 needs.
 *   globally pure a 3-cycle and nothing else anywhere — usable at any point,
 *                 and required by the last phases. Built by interchanging two
 *                 orbit-local tools that meet in exactly one cell overall.
 *
 * The interchange criterion |supp(A) ∩ supp(B)| = 1 is *sufficient* for a
 * 3-cycle, not necessary, so it is used only to rank candidate pairs; the
 * verdict always comes from the computed action.
 */
import {
  ROT_ID, actionOver, atoms, atomsOfFamily, commutatorCandidates, commutatorWord,
  inverseAtom, N, siteClasses, type Atom,
} from './l3sim';

// ---------- orbits ----------
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
const frames = atomsOfFamily('frame-s1', 'frame-s3', 'frame-s9');

interface Cand { word: Atom[]; sup: number[] }          // sup = orbit-restricted support
interface Local { word: Atom[]; cycle: number[]; gsup: number[] } // gsup = global support

const mask = new Uint8Array(N);

/** Action of [A,B]; returns the orbit 3-cycle and the global support, or null. */
const evaluate = (A: Atom[], B: Atom[]): { cycle: number[]; gsup: number[] } | null => {
  const action = actionOver(commutatorWord(A, B), commutatorCandidates(A, B));
  const src: number[] = []; const dst: number[] = []; const gsup: number[] = [];
  for (const [s, [to, rot]] of action.moves) {
    if (to !== s || rot !== ROT_ID) gsup.push(s);
    if (!mask[s]) continue;
    if (to === s) { if (rot !== ROT_ID) return null; continue; }
    src.push(s); dst.push(to);
    if (src.length > 3) return null;
  }
  if (src.length !== 3) return null;
  const perm = new Map(src.map((s, k) => [s, dst[k]!]));
  let cur = src[0]!;
  for (let k = 0; k < 3; k += 1) cur = perm.get(cur)!;
  return cur === src[0]! ? { cycle: src, gsup } : null;
};

const localOf = new Array<Local[]>(O);
const pureOf = new Array<number>(O).fill(0);
const pairsPure = new Array<Set<number>>(O);

const t0 = performance.now();
for (let o = 0; o < O; o += 1) {
  const sites = orbitSites[o]!;
  mask.fill(0);
  for (const s of sites) mask[s] = 1;

  // ---- candidate pool: bare atoms, widened with conjugates when needed ----
  const buildPool = (withConjugates: boolean): Cand[] => {
    const pool: Cand[] = [];
    for (const a of atoms) {
      const sup: number[] = [];
      for (const [from, to] of a.map) if (from !== to && mask[from]) sup.push(from);
      if (sup.length >= 1 && sup.length <= 24) pool.push({ word: [a], sup });
    }
    if (!withConjugates) return pool;
    const touching = atoms.filter((h) => { for (const [from, to] of h.map) if (from !== to && mask[from]) return true; return false; });
    const conj: Cand[] = [];
    for (const g of frames) {
      const gInv = inverseAtom(g);
      for (const h of touching) {
        if (g.refId === h.refId) continue;
        const sup: number[] = [];
        for (const s of sites) {
          const gs = g.map.get(s) ?? s;
          const hgs = h.map.get(gs);
          if (hgs !== undefined && hgs !== gs) sup.push(s);
        }
        if (sup.length >= 1 && sup.length <= 8) conj.push({ word: [g, h, gInv], sup });
      }
    }
    conj.sort((a, b) => a.sup.length - b.sup.length);
    pool.push(...conj.slice(0, 4000));
    return pool;
  };

  // ---- orbit-local search ----
  // `shared` is a ranking heuristic, not a gate: 1 guarantees a 3-cycle, but 2
  // and 3 produce them often enough to be worth the action computation.
  const search = (pool: Cand[], limit: number): Local[] => {
    const found: Local[] = [];
    const seen = new Set<string>();
    const bySite = new Map<number, number[]>();
    pool.forEach((c, i) => { for (const s of c.sup) { const l = bySite.get(s) ?? []; l.push(i); bySite.set(s, l); } });
    for (const maxShared of [1, 3]) {
      for (const site of sites) {
        const list = bySite.get(site) ?? [];
        for (let x = 0; x < list.length; x += 1) {
          for (let y = x + 1; y < list.length; y += 1) {
            const A = pool[list[x]!]!; const B = pool[list[y]!]!;
            let sh = 0;
            for (const s of A.sup) { if (B.sup.includes(s)) { sh += 1; if (sh > maxShared) break; } }
            if (sh < 1 || sh > maxShared) continue;
            if (maxShared === 3 && sh === 1) continue; // already covered by the first sweep
            const r = evaluate(A.word, B.word);
            if (!r) continue;
            const key = r.cycle.slice().sort((p, q) => p - q).join(',');
            if (seen.has(key)) continue;
            seen.add(key);
            found.push({ word: commutatorWord(A.word, B.word), cycle: r.cycle, gsup: r.gsup });
            if (found.length >= limit) return found;
          }
        }
      }
      if (found.length > 0) break; // the cheap sweep sufficed
    }
    return found;
  };

  let local = search(buildPool(false), 600);
  if (local.length === 0) local = search(buildPool(true), 600);
  localOf[o] = local;

  // ---- interchange the globally tightest, for a globally pure tool ----
  mask.fill(0);
  for (const s of sites) mask[s] = 1;
  local.sort((a, b) => a.gsup.length - b.gsup.length);
  const seeds = local.slice(0, 400);
  const pure = new Set<number>();
  let pureCount = 0;
  outer:
  for (let i = 0; i < seeds.length; i += 1) {
    for (let j = i + 1; j < seeds.length; j += 1) {
      // The interchange 3-cycles the orbit of the single shared cell, so that
      // cell has to lie in the target orbit — otherwise the tool is perfectly
      // good but belongs to a different orbit entirely.
      let sh = 0;
      let shared = -1;
      for (const s of seeds[i]!.gsup) { if (seeds[j]!.gsup.includes(s)) { sh += 1; shared = s; if (sh > 1) break; } }
      if (sh !== 1 || !mask[shared]) continue;
      const r = evaluate(seeds[i]!.word, seeds[j]!.word);
      if (!r || r.gsup.length !== 3) continue;
      pureCount += 1;
      const perm = new Map(r.cycle.map((s, k) => [s, r.cycle[(k + 1) % 3]!]));
      for (const s of r.cycle) { pure.add(s * N + perm.get(s)!); pure.add(perm.get(s)! * N + s); }
      if (pureCount >= 400) break outer;
    }
  }
  pureOf[o] = pureCount;
  pairsPure[o] = pure;
}

// ---------- report ----------
console.log(`search time ${((performance.now() - t0) / 1000).toFixed(0)}s\n`);
console.log('size  class          orbits  orbit-local  globally pure  pure pair cov  tool atoms');
const rows = new Map<string, { n: number; loc: number; pure: number; cov: number[]; atoms: Set<number> }>();
for (let o = 0; o < O; o += 1) {
  const key = `${String(orbitSites[o]!.length).padStart(4)}  ${siteClasses[orbitSites[o]![0]!]!.padEnd(12)}`;
  const r = rows.get(key) ?? { n: 0, loc: 0, pure: 0, cov: [], atoms: new Set<number>() };
  r.n += 1;
  if (localOf[o]!.length > 0) { r.loc += 1; r.atoms.add(localOf[o]![0]!.word.length); }
  if (pureOf[o]! > 0) r.pure += 1;
  const size = orbitSites[o]!.length;
  r.cov.push(pairsPure[o]!.size / (size * (size - 1)));
  rows.set(key, r);
}
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; };
for (const [key, r] of [...rows].sort()) {
  console.log(
    `${key} ${String(r.n).padStart(6)} ${String(r.loc).padStart(12)} ${String(r.pure).padStart(14)}  ` +
      `${(100 * median(r.cov)).toFixed(1).padStart(12)}%  ${[...r.atoms].sort((a, b) => a - b).join('/') || '-'}`,
  );
}
const cells = (pred: (o: number) => boolean) => orbitSites.reduce((n, s, o) => n + (pred(o) ? s.length : 0), 0);
const nLoc = localOf.filter((l) => l.length > 0).length;
const nPure = pureOf.filter((p) => p > 0).length;
console.log(`\norbit-local tool:   ${nLoc}/${O} orbits, ${cells((o) => localOf[o]!.length > 0)}/${N} cells`);
console.log(`globally pure tool: ${nPure}/${O} orbits, ${cells((o) => pureOf[o]! > 0)}/${N} cells`);
const missing: string[] = [];
for (let o = 0; o < O; o += 1) if (localOf[o]!.length === 0) missing.push(`${siteClasses[orbitSites[o]![0]!]!}(${orbitSites[o]!.length})`);
if (missing.length) {
  const c = new Map<string, number>();
  for (const k of missing) c.set(k, (c.get(k) ?? 0) + 1);
  console.log(`no tool at all: ${[...c].map(([k, v]) => `${k}x${v}`).join(' ')}`);
}

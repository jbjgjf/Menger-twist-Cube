/**
 * Step 5a: does a valid phase order exist?
 *
 * Run: `npx tsx research/scratch/l3-phase-order.ts` from the repo root.
 * The expensive half is cached in `l3-phase-order.cache.json`; delete it to
 * recompute.
 *
 * Step 2 left 40 orbits with no globally pure tool: their tools are 3-cycles on
 * the target orbit that also disturb ~50 cells elsewhere. Solving those first is
 * only sound if an order among *them* exists — if orbit A's every tool hits B
 * and B's every tool hits A, nothing works.
 *
 * A phase order is valid when every orbit has a tool whose disturbance lands
 * only on orbits solved later. Orbits with a globally pure tool disturb nothing,
 * so they are unconstrained and belong **last**; the ordering problem is
 * entirely among the non-pure ones, which may freely disturb the pure orbits
 * still waiting behind them.
 *
 * Reasoning at orbit granularity is conservative: the solver protects individual
 * cells, so if an orbit-level order exists the cell-level search has more room.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  ROT_ID, actionOver, atoms, atomsOfFamily, commutatorCandidates, commutatorWord,
  N, siteClasses, type Atom,
} from './l3sim';
import { findOrbitLocalTools, findPureTools } from './l3tools';

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

// ---------- cached: pure flags and distinct disturbance sets ----------
const cachePath = new URL('./l3-phase-order.cache.json', import.meta.url).pathname;
interface Cache { hasPure: number[]; disturb: number[][][] }
let cache: Cache;

if (existsSync(cachePath)) {
  cache = JSON.parse(readFileSync(cachePath, 'utf8')) as Cache;
  console.log('loaded cached tool/disturbance data\n');
} else {
  const started = performance.now();
  const hasPure = new Array<number>(O).fill(0);
  const disturb: number[][][] = orbitSites.map(() => []);

  for (let o = 0; o < O; o += 1) {
    const local = findOrbitLocalTools(orbitSites[o]!, 600);
    if (findPureTools(orbitSites[o]!, local, 1).length > 0) hasPure[o] = 1;
    const seen = new Set<string>();
    for (const t of local) {
      const s = new Set<number>();
      for (const site of t.gsup) {
        const other = orbitOfSite[site]!;
        if (other !== o) s.add(other);
      }
      const key = [...s].sort((a, b) => a - b).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      disturb[o]!.push([...s].sort((a, b) => a - b));
    }
  }
  console.log(`orbit-local tools and disturbance sets: ${((performance.now() - started) / 1000).toFixed(0)}s`);

  // The class-level family is globally pure by construction and reaches large
  // orbits the orbit-local interchange cannot, so it must be folded in before
  // deciding which orbits are unconstrained.
  const t2 = performance.now();
  const frameAtoms = atomsOfFamily('frame-s1', 'frame-s3', 'frame-s9');
  const localAtoms = atomsOfFamily('ext-d2', 'ext-d2.5');
  interface Seed { word: Atom[]; sup: number[] }
  const seeds: Seed[] = [];
  const seenSeed = new Set<string>();
  for (const f of frameAtoms) for (const e of localAtoms) {
    let touches = false;
    for (const s of e.map.keys()) if (f.map.has(s)) { touches = true; break; }
    if (!touches) continue;
    const word = commutatorWord([f], [e]);
    const action = actionOver(word, commutatorCandidates([f], [e]));
    if (action.moves.size === 0 || action.moves.size > 9) continue;
    const sup = [...action.moves.keys()].sort((a, b) => a - b);
    const k = sup.map((i) => `${i}>${action.moves.get(i)![0]}#${action.moves.get(i)![1]}`).join(';');
    if (seenSeed.has(k)) continue;
    seenSeed.add(k);
    seeds.push({ word, sup });
  }
  const bySite = new Map<number, number[]>();
  seeds.forEach((s, i) => { for (const x of s.sup) { const l = bySite.get(x) ?? []; l.push(i); bySite.set(x, l); } });
  for (let i = 0; i < seeds.length; i += 1) {
    const partners = new Set<number>();
    for (const s of seeds[i]!.sup) for (const j of bySite.get(s) ?? []) if (j > i) partners.add(j);
    for (const j of partners) {
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
      if (src.every((s) => orbitOfSite[s] === o)) hasPure[o] = 1;
    }
  }
  console.log(`class-level pure tools folded in: ${((performance.now() - t2) / 1000).toFixed(0)}s`);
  cache = { hasPure, disturb };
  writeFileSync(cachePath, JSON.stringify(cache));
}

const { hasPure, disturb } = cache;
const pure = hasPure.reduce((a, b) => a + b, 0);
console.log(`orbits with a globally pure tool: ${pure}/${O}`);
const nonPure: number[] = [];
for (let o = 0; o < O; o += 1) if (!hasPure[o]) nonPure.push(o);
console.log(`orbits needing an order among themselves: ${nonPure.length}\n`);

// ---------- order the non-pure orbits; the pure ones go last ----------
//
// Placing an orbit means solving it, so its tool must not disturb anything
// already placed. Pure orbits are unconstrained and are appended at the end,
// which is also why a non-pure orbit may disturb them freely.
const placeable = (o: number, solved: Set<number>): boolean =>
  disturb[o]!.some((set) => set.every((d) => !solved.has(d)));

const tryOrder = (pick: (options: number[], solved: Set<number>) => number): { order: number[]; complete: boolean } => {
  const solved = new Set<number>();
  const order: number[] = [];
  while (order.length < nonPure.length) {
    const options = nonPure.filter((o) => !solved.has(o) && placeable(o, solved));
    if (options.length === 0) return { order, complete: false };
    const chosen = pick(options, solved);
    order.push(chosen);
    solved.add(chosen);
  }
  return { order, complete: true };
};

// Most-constrained first: an orbit whose tools have few surviving disturbance
// sets should be placed while it still has an option.
const surviving = (o: number, solved: Set<number>) =>
  disturb[o]!.filter((set) => set.every((d) => !solved.has(d))).length;

let rng = 20260806;
const nextRandom = (n: number) => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng % n; };

const strategies: Array<{ name: string; pick: (o: number[], s: Set<number>) => number }> = [
  { name: 'first available', pick: (options) => options[0]! },
  { name: 'most constrained first', pick: (options, solved) => options.reduce((a, b) => (surviving(a, solved) <= surviving(b, solved) ? a : b)) },
  { name: 'widest disturbance first', pick: (options) => options.reduce((a, b) => (disturb[a]!.length <= disturb[b]!.length ? a : b)) },
  { name: 'fewest tools first', pick: (options) => options.reduce((a, b) => (disturb[a]!.length >= disturb[b]!.length ? a : b)) },
];

let best: { name: string; order: number[]; complete: boolean } = { name: '-', order: [], complete: false };
for (const s of strategies) {
  const r = tryOrder(s.pick);
  console.log(`${s.name.padEnd(26)} placed ${String(r.order.length).padStart(2)}/${nonPure.length}${r.complete ? '  COMPLETE' : ''}`);
  if (r.order.length > best.order.length) best = { name: s.name, ...r };
}
if (!best.complete) {
  let attempts = 0;
  for (; attempts < 20000 && !best.complete; attempts += 1) {
    const r = tryOrder((options) => options[nextRandom(options.length)]!);
    if (r.order.length > best.order.length) best = { name: `randomized restart #${attempts}`, ...r };
  }
  console.log(`randomized restarts       ran ${attempts}, best placed ${best.order.length}/${nonPure.length}`);
}

if (best.complete) {
  console.log(`\nRESULT: a valid phase order exists (${best.name}).`);
  console.log(`Solve the ${nonPure.length} orbit-local-only orbits in that order, then the ${pure}`);
  console.log('orbits with globally pure tools in any order. Every tool then disturbs only');
  console.log('orbits still unsolved, so the placement pipeline closes.');
} else {
  const solved = new Set(best.order);
  const stuck = nonPure.filter((o) => !solved.has(o));
  const c = new Map<string, number>();
  for (const o of stuck) {
    const k = `${siteClasses[orbitSites[o]![0]!]!}(${orbitSites[o]!.length})`;
    c.set(k, (c.get(k) ?? 0) + 1);
  }
  console.log(`\nRESULT: best effort placed ${best.order.length}/${nonPure.length}; ${stuck.length} remain.`);
  console.log(`Stuck: ${[...c].map(([k, v]) => `${k}x${v}`).join(' ')}`);
  console.log('Those need a globally pure tool, or tools with tighter disturbance.');
}

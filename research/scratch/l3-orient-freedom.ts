/**
 * Step 3a: how much orientation freedom does a cell have, per orbit?
 *
 * Run: `npx tsx research/scratch/l3-orient-freedom.ts` from the repo root.
 *
 * A single cell's state is (site, rotation), and every legal move acts on that
 * pair deterministically, so the exact set of orientations a cell can wear at
 * its home site is the reachable set of an automaton on orbit_size x 24 states.
 * The rotations reachable *at the home site* form a subgroup of the 24 — the
 * cell's orientation freedom — and its order is exactly how many twist states
 * the last phase has to be able to remove.
 *
 * Level 2's answer (exp9-orient-freedom.ts) was 3 for CC, 4 for CE, **1** for EC
 * — position determines orientation there — 8 for EEa and 4 for EEo.
 *
 * Sparse atom maps include cells a move selects but does not displace (a depth-3
 * roll maps its cell to itself), so rotation-only moves are picked up correctly.
 */
import { ROT_ID, atoms, N, rotMul, siteClasses } from './l3sim';
import { validateTurnTargetRotation } from '../../packages/engine/src/rotationLegality';
import { createMengerPuzzleState } from '../../packages/engine/src/puzzleState';
import type { Vector3Tuple } from 'three';

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
const orbitSites: number[][] = [];
{
  const idx = new Map<number, number>();
  for (let i = 0; i < N; i += 1) {
    const r = findRoot(i);
    let k = idx.get(r);
    if (k === undefined) { k = orbitSites.length; orbitSites.push([]); idx.set(r, k); }
    orbitSites[k]!.push(i);
  }
}

// ---------- which sites carry a legal in-place roll ----------
const state = createMengerPuzzleState(3);
const rollableSite = new Uint8Array(N);
{
  const key = (p: Vector3Tuple) => p.join(',');
  const index = new Map<string, number>();
  state.cubies.forEach((c, i) => index.set(key(c.homePosition as Vector3Tuple), i));
  for (const t of state.turnTargets) {
    if (t.kind !== 'extension' || t.depth !== 3 || t.scale !== 1) continue;
    if (!validateTurnTargetRotation(state.cubies, t, 90).legal) continue;
    const i = index.get(key(t.pivot as Vector3Tuple));
    if (i !== undefined) rollableSite[i] = 1;
  }
}

// ---------- the single-piece automaton, per orbit ----------
interface Row { size: number; cls: string; freedom: number; uniform: boolean; group: string; rollable: boolean }
const rows: Row[] = [];

const started = performance.now();
for (const sites of orbitSites) {
  const n = sites.length;
  const local = new Map(sites.map((s, i) => [s, i]));
  const gens = atoms.filter((a) => { for (const s of sites) if (a.map.has(s)) return true; return false; });

  const seen = new Uint8Array(n * 24);
  seen[ROT_ID] = 1;
  let frontier = [ROT_ID];
  while (frontier.length) {
    const next: number[] = [];
    for (const st of frontier) {
      const site = (st / 24) | 0;
      const rot = st % 24;
      const globalSite = sites[site]!;
      for (const a of gens) {
        const dest = a.map.get(globalSite);
        if (dest === undefined) continue;
        const k = local.get(dest)! * 24 + rotMul[a.rot]![rot]!;
        if (!seen[k]) { seen[k] = 1; next.push(k); }
      }
    }
    frontier = next;
  }

  const perSite: number[] = [];
  for (let i = 0; i < n; i += 1) {
    let c = 0;
    for (let r = 0; r < 24; r += 1) if (seen[i * 24 + r]) c += 1;
    perSite.push(c);
  }
  const freedom = perSite[0]!;
  const uniform = perSite.every((c) => c === freedom);

  const atHome: number[] = [];
  for (let r = 0; r < 24; r += 1) if (seen[r]) atHome.push(r);
  const orderOf = (r: number) => { let k = 1; let cur = r; while (cur !== ROT_ID) { cur = rotMul[cur]![r]!; k += 1; } return k; };
  const counts = new Map<number, number>();
  for (const o of atHome.map(orderOf)) counts.set(o, (counts.get(o) ?? 0) + 1);
  const group = `order ${atHome.length}, element orders {` +
    [...counts].sort((a, b) => a[0] - b[0]).map(([o, c]) => `${o}x${c}`).join(' ') + '}';

  rows.push({
    size: n, cls: siteClasses[sites[0]!]!, freedom, uniform, group,
    rollable: sites.some((s) => rollableSite[s] === 1),
  });
}

// ---------- report ----------
console.log(`automaton over ${orbitSites.length} orbits in ${((performance.now() - started) / 1000).toFixed(0)}s\n`);
console.log('size  class          orbits  freedom  uniform  legal roll  subgroup');
interface Bucket { n: number; row: Row }
const buckets = new Map<string, Bucket>();
for (const r of rows) {
  const key = `${r.size}|${r.cls}|${r.freedom}|${r.uniform}|${r.rollable}|${r.group}`;
  const b = buckets.get(key) ?? { n: 0, row: r };
  b.n += 1;
  buckets.set(key, b);
}
for (const [, b] of [...buckets].sort((x, y) => x[0].localeCompare(y[0]))) {
  const r = b.row;
  console.log(
    `${String(r.size).padStart(4)}  ${r.cls.padEnd(12)} ${String(b.n).padStart(6)} ` +
    `${String(r.freedom).padStart(7)}  ${(r.uniform ? 'yes' : 'NO').padEnd(7)}  ` +
    `${(r.rollable ? 'yes' : 'no').padEnd(10)}  ${r.group}`,
  );
}

const total = rows.reduce((n, r) => n + r.size, 0);
const determined = rows.filter((r) => r.freedom === 1);
console.log(`\ncells whose orientation is determined by position (freedom 1): ${determined.reduce((n, r) => n + r.size, 0)}/${total}`);
console.log(`orbits with non-uniform freedom across their sites: ${rows.filter((r) => !r.uniform).length} (must be 0)`);
const needTwist = rows.filter((r) => r.freedom > 1);
console.log(`orbits needing twist tools: ${needTwist.length}/${orbitSites.length}, ${needTwist.reduce((n, r) => n + r.size, 0)} cells`);
console.log(`  of those, orbits with a legal in-place roll: ${needTwist.filter((r) => r.rollable).length}`);

/**
 * Step 3b: twist tools for the 16 orbits whose orientation is not determined.
 *
 * Run: `npx tsx research/scratch/l3-twist-tools.ts` from the repo root.
 *
 * `l3-orient-freedom.ts` showed 7,224 of 8,000 cells have their orientation
 * fixed by position, leaving 16 orbits (776 cells):
 *
 *   11 orbits, freedom 4 (C4)  — a single legal depth-3 turn realizes the whole
 *                                group, so these need no commutator at all;
 *    1 orbit,  freedom 8 (D4)  — rolls give the C4 half, the flips need tools
 *                                (Level 2's EEa is the same shape);
 *    4 orbits, freedom 3 (C3)  — corner-style twists with **no** legal in-place
 *                                roll, so tools are the only way.
 *
 * Level 2's construction: two pure 3-cycles on the *same ordered cycle* with
 * different rotation profiles compose to a position-identity word that only
 * twists. Both halves must be globally pure or their side effects will not
 * cancel — which is why this uses the shared `findPureTools`.
 */
import {
  ROT_ID, actionOver, atoms, inverseWord, N, rotMul, siteClasses, supportCandidates,
} from './l3sim';
import { findOrbitLocalTools, findPureTools } from './l3tools';
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

// ---------- orientation freedom ----------
const freedomOf = orbitSites.map((sites) => {
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
      for (const a of gens) {
        const dest = a.map.get(sites[site]!);
        if (dest === undefined) continue;
        const k = local.get(dest)! * 24 + rotMul[a.rot]![rot]!;
        if (!seen[k]) { seen[k] = 1; next.push(k); }
      }
    }
    frontier = next;
  }
  let c = 0;
  for (let r = 0; r < 24; r += 1) if (seen[r]) c += 1;
  return c;
});

// ---------- sites that can roll in place ----------
const state = createMengerPuzzleState(3);
const rollable = new Uint8Array(N);
{
  const key = (p: Vector3Tuple) => p.join(',');
  const index = new Map<string, number>();
  state.cubies.forEach((c, i) => index.set(key(c.homePosition as Vector3Tuple), i));
  for (const t of state.turnTargets) {
    if (t.kind !== 'extension' || t.depth !== 3 || t.scale !== 1) continue;
    if (!validateTurnTargetRotation(state.cubies, t, 90).legal) continue;
    const i = index.get(key(t.pivot as Vector3Tuple));
    if (i !== undefined) rollable[i] = 1;
  }
}

// ---------- twisters ----------
const targets = orbitSites
  .map((sites, o) => ({ o, sites, freedom: freedomOf[o]!, roll: sites.some((s) => rollable[s] === 1) }))
  .filter((t) => t.freedom > 1)
  .sort((a, b) => a.sites.length - b.sites.length || a.freedom - b.freedom);

console.log(`orbits needing twist handling: ${targets.length}, ${targets.reduce((n, t) => n + t.sites.length, 0)} cells\n`);
console.log('size  class        freedom  roll  pure tools  twisters  cells twisted  time');

for (const t of targets) {
  const started = performance.now();
  const local = findOrbitLocalTools(t.sites, 600);
  const pure = findPureTools(t.sites, local, 300);

  const byCycle = new Map<string, typeof pure>();
  for (const p of pure) {
    const key = p.src.map((s, k) => `${s}>${p.dst[k]}`).sort().join(';');
    const l = byCycle.get(key) ?? [];
    l.push(p);
    byCycle.set(key, l);
  }
  let twisters = 0;
  const widths = new Set<number>();
  for (const group of byCycle.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = 0; j < group.length; j += 1) {
        if (i === j) continue;
        if (group[i]!.rots.join() === group[j]!.rots.join()) continue;
        const word = [...group[i]!.word, ...inverseWord(group[j]!.word)];
        const action = actionOver(word, supportCandidates(word));
        let positionIdentity = true;
        let twisted = 0;
        for (const [s, [to, rot]] of action.moves) {
          if (to !== s) { positionIdentity = false; break; }
          if (rot !== ROT_ID) twisted += 1;
        }
        if (!positionIdentity || twisted === 0) continue;
        twisters += 1;
        widths.add(twisted);
      }
    }
  }
  console.log(
    `${String(t.sites.length).padStart(4)}  ${siteClasses[t.sites[0]!]!.padEnd(11)} ` +
    `${String(t.freedom).padStart(7)}  ${(t.roll ? 'yes' : 'no').padEnd(4)}  ` +
    `${String(pure.length).padStart(10)}  ${String(twisters).padStart(8)}  ` +
    `${([...widths].sort((a, b) => a - b).join('/') || '-').padStart(13)}  ` +
    `${((performance.now() - started) / 1000).toFixed(0)}s`,
  );
}

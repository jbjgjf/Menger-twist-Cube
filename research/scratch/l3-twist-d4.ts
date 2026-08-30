/**
 * Step 3 carry-over: twist tools for the D4 orbit.
 *
 * Run: `npx tsx research/scratch/l3-twist-d4.ts` from the repo root.
 *
 * 15 of the 16 twistable orbits are settled: 11 have freedom C4, which a single
 * legal depth-3 turn generates outright, and the four C3 `CCC` orbits get
 * twisters from `l3-twist-tools.ts`. The last one is the 192-cell `EEE/Bbo`
 * orbit, whose freedom is D4 of order 8 — rolls reach only the C4 half, and the
 * flips need tools. Level 2's `EEa` class has exactly this shape.
 *
 * Two constructions, both from Level 2:
 *
 *   [E3, T]     a depth-3 roll does not move any cell, so the commutator's
 *               support is contained in T's three cells and its position action
 *               cancels — a pure twister on at most 3 cells.
 *   T_i · T_j⁻¹ two pure 3-cycles on the same ordered cycle with different
 *               rotation profiles compose to a position-identity twist.
 *
 * Its pure 3-cycles come from the class-level family (step 2 showed the
 * orbit-local interchange does not reach orbits this large).
 */
import {
  ROT_ID, actionOver, atoms, atomsOfFamily, commutatorCandidates, commutatorWord,
  inverseWord, N, rotMul, siteClasses, supportCandidates, type Atom,
} from './l3sim';
import { validateTurnTargetRotation } from '../../packages/engine/src/rotationLegality';
import { createMengerPuzzleState } from '../../packages/engine/src/puzzleState';
import type { Vector3Tuple } from 'three';
import { writeFileSync } from 'node:fs';

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

// the D4 orbit: the single 192-cell one
const targetOrbit = orbitSites.findIndex((s) => s.length === 192);
const sites = orbitSites[targetOrbit]!;
const mask = new Uint8Array(N);
for (const s of sites) mask[s] = 1;
console.log(`target orbit: ${siteClasses[sites[0]!]!} with ${sites.length} cells\n`);

// ---------- the orbit's orientation freedom, for comparison ----------
const freedomAtHome = (() => {
  const local = new Map(sites.map((s, i) => [s, i]));
  const gens = atoms.filter((a) => { for (const s of sites) if (a.map.has(s)) return true; return false; });
  const seen = new Uint8Array(sites.length * 24);
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
  const out: number[] = [];
  for (let r = 0; r < 24; r += 1) if (seen[r]) out.push(r);
  return out;
})();
console.log(`orientation freedom at a home cell: ${freedomAtHome.length} rotations`);

// ---------- legal in-place rolls on this orbit ----------
const state = createMengerPuzzleState(3);
const rollAtSite = new Map<number, Atom[]>();
{
  const key = (p: Vector3Tuple) => p.join(',');
  const index = new Map<string, number>();
  state.cubies.forEach((c, i) => index.set(key(c.homePosition as Vector3Tuple), i));
  for (const a of atomsOfFamily('ext-d3')) {
    const target = state.turnTargetById.get(a.refId);
    if (!target) continue;
    if (!validateTurnTargetRotation(state.cubies, target, a.angle).legal) continue;
    const i = index.get(key(target.pivot as Vector3Tuple));
    if (i === undefined || !mask[i]) continue;
    const l = rollAtSite.get(i) ?? [];
    l.push(a);
    rollAtSite.set(i, l);
  }
}
const rollRotations = new Set<number>();
for (const l of rollAtSite.values()) for (const a of l) rollRotations.add(a.rot);
console.log(`cells with a legal roll: ${rollAtSite.size}/${sites.length}, roll rotations: ${rollRotations.size}`);

// ---------- pure 3-cycles on this orbit, from the class-level family ----------
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
    const k = sup.map((i) => `${i}>${action.moves.get(i)![0]}#${action.moves.get(i)![1]}`).join(';');
    if (seen.has(k)) continue;
    seen.add(k);
    seeds.push({ word, sup });
  }
}
interface Pure { word: Atom[]; src: number[]; dst: number[]; rots: number[] }
const pure: Pure[] = [];
{
  const bySite = new Map<number, number[]>();
  seeds.forEach((s, i) => { for (const x of s.sup) { const l = bySite.get(x) ?? []; l.push(i); bySite.set(x, l); } });
  const seenProfile = new Set<string>();
  for (let i = 0; i < seeds.length && pure.length < 250000; i += 1) {
    const partners = new Set<number>();
    for (const s of seeds[i]!.sup) for (const j of bySite.get(s) ?? []) if (j > i) partners.add(j);
    for (const j of partners) {
      if (pure.length >= 250000) break;
      const word = commutatorWord(seeds[i]!.word, seeds[j]!.word);
      const action = actionOver(word, commutatorCandidates(seeds[i]!.word, seeds[j]!.word));
      const src: number[] = []; const dst: number[] = []; const rots: number[] = [];
      let ok = true;
      for (const [s, [to, rot]] of action.moves) {
        if (to === s) { if (rot !== ROT_ID) { ok = false; break; } continue; }
        src.push(s); dst.push(to); rots.push(rot);
        if (src.length > 3) { ok = false; break; }
      }
      if (!ok || src.length !== 3) continue;
      if (src.some((s) => !mask[s])) continue;
      const profile = src.map((s, k) => `${s}>${dst[k]}#${rots[k]}`).sort().join(';');
      if (seenProfile.has(profile)) continue;
      seenProfile.add(profile);
      pure.push({ word, src, dst, rots });
    }
  }
}
{
  const byCyc = new Map<string, number>();
  for (const p of pure) {
    const key = p.src.map((x, k) => `${x}>${p.dst[k]}`).sort().join(';');
    byCyc.set(key, (byCyc.get(key) ?? 0) + 1);
  }
  const multi = [...byCyc.values()].filter((v) => v > 1).length;
  console.log(`pure 3-cycles on the orbit: ${pure.length} over ${byCyc.size} distinct ordered cycles, ` +
    `${multi} of which have more than one rotation profile (${((performance.now() - started) / 1000).toFixed(0)}s)\n`);
}

// ---------- twisters ----------
const twistRotations = new Set<number>();
let fromRollCommutator = 0;
let fromSameCycle = 0;
const widths = new Set<number>();
/** rotation profiles a single twister applies, as a sorted pair key */
const profiles = new Map<string, number>();
const exampleByRotation = new Map<number, { word: string[]; site: number; rotation: number }>();

const recordTwister = (word: Atom[]): boolean => {
  const action = actionOver(word, supportCandidates(word));
  let twisted = 0;
  const rots: number[] = [];
  for (const [s, [to, rot]] of action.moves) {
    if (to !== s) return false;
    if (rot !== ROT_ID) { twisted += 1; if (mask[s]) rots.push(rot); }
  }
  if (twisted === 0) return false;
  widths.add(twisted);
  for (let index = 0; index < rots.length; index += 1) {
    const r = rots[index]!;
    twistRotations.add(r);
    if (!exampleByRotation.has(r)) {
      const site = [...action.moves]
        .filter(([candidate, [to, rot]]) => mask[candidate] && candidate === to && rot !== ROT_ID)[index]![0];
      exampleByRotation.set(r, { word: word.map((atom) => atom.id), site, rotation: r });
    }
  }
  const key = [...rots].sort((a, b) => a - b).join('+');
  profiles.set(key, (profiles.get(key) ?? 0) + 1);
  return true;
};

// (a) [E3, T]
for (const t of pure) {
  for (const s of t.src) {
    for (const roll of rollAtSite.get(s) ?? []) {
      if (recordTwister(commutatorWord([roll], t.word))) fromRollCommutator += 1;
    }
  }
}
// (b) same ordered cycle, different rotation profile
{
  const byCycle = new Map<string, Pure[]>();
  for (const p of pure) {
    const key = p.src.map((s, k) => `${s}>${p.dst[k]}`).sort().join(';');
    const l = byCycle.get(key) ?? [];
    l.push(p);
    byCycle.set(key, l);
  }
  for (const group of byCycle.values()) {
    for (let i = 0; i < group.length && fromSameCycle < 4000; i += 1) {
      for (let j = 0; j < group.length && fromSameCycle < 4000; j += 1) {
        if (i === j || group[i]!.rots.join() === group[j]!.rots.join()) continue;
        if (recordTwister([...group[i]!.word, ...inverseWord(group[j]!.word)])) fromSameCycle += 1;
      }
    }
  }
}

console.log(`twisters from [E3, T]:        ${fromRollCommutator}`);
console.log(`twisters from T_i · T_j⁻¹:    ${fromSameCycle}`);
console.log(`cells twisted per tool:       ${[...widths].sort((a, b) => a - b).join('/') || '-'}`);

// ---------- can potential descent remove every residue? ----------
//
// Asking whether a tool *applies* the missing rotation is the wrong question.
// Level 2 does not remove a hard residue directly either: it multiplies the
// residue by a twist and lands on one a roll can finish. A residue r has
// potential 0 if it is already solved, 1 if some roll undoes it, and 2
// otherwise; the phase applies twists that strictly decrease the total.
//
// So the condition to check is: for every residue a roll cannot fix, does some
// available twist g bring r·g down to potential <= 1?
const rollFixable = new Set<number>([ROT_ID, ...rollRotations]);
const potential = (r: number): number => (r === ROT_ID ? 0 : rollFixable.has(r) ? 1 : 2);

const hardResidues = freedomAtHome.filter((r) => potential(r) === 2);
const stuck: number[] = [];
for (const r of hardResidues) {
  const escape = [...twistRotations].some((g) => potential(rotMul[g]![r]!) < 2);
  if (!escape) stuck.push(r);
}

console.log(`\nrotations a roll can undo:              ${rollRotations.size}`);
console.log(`rotations a twister can apply:          ${twistRotations.size}`);
console.log(`freedom group (non-identity):           ${freedomAtHome.length - 1}`);
console.log(`  of those, roll-fixable (potential 1): ${freedomAtHome.filter((r) => potential(r) === 1).length}`);
console.log(`  of those, hard (potential 2):         ${hardResidues.length}`);
console.log(`hard residues with no descending twist: ${stuck.length}`);
console.log(stuck.length === 0
  ? '\nRESULT: every hard residue has a twist that drops it to roll-fixable, so strict\n' +
    'potential descent terminates — the same argument Level 2 uses for EEa. The D4\n' +
    'orbit is covered, and step 3 is complete.'
  : `\nRESULT: ${stuck.length} residue(s) admit no descending twist — this orbit still needs work.`);

writeFileSync(
  new URL('./l3-orientation-tools.cache.json', import.meta.url),
  JSON.stringify({ version: 1, d4Orbit: targetOrbit, examples: [...exampleByRotation.values()] }),
);

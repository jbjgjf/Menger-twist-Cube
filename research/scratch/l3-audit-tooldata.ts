/**
 * Independent audit of the exported Level 3 tool data.
 *
 * Re-derives the orbits from `l3sim.ts` and checks every exported word from
 * scratch: that its atom ids resolve, that its action is confined to one orbit,
 * that it leaves no cell twisted, and that the 164 orbits are actually covered.
 * The generator's own claims are not trusted here.
 */
import { ROT_ID, actionOver, atomById, atoms, N, siteClasses, supportCandidates, type Atom } from './l3sim';
import { level3PureToolWords, level3D4Orbit, level3D4TwisterWords } from '../../packages/solver-core/src/algorithms/level3SliceReductionToolData';

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
console.log(`orbits re-derived: ${orbitSites.length}`);
console.log(`exported pure tools: ${level3PureToolWords.length}`);

const covered = new Set<number>();
let unresolved = 0;
let spill = 0;
let twisted = 0;
let notPermutation = 0;
let good = 0;
const widths = new Map<number, number>();
const lengths: number[] = [];

for (const entry of level3PureToolWords) {
  const word: Atom[] = [];
  let ok = true;
  for (const id of entry.word) {
    const a = atomById.get(id);
    if (!a) { ok = false; break; }
    word.push(a);
  }
  if (!ok) { unresolved += 1; continue; }
  lengths.push(word.length);

  const action = actionOver(word, supportCandidates(word));
  const moved: number[] = [];
  let hasTwist = false;
  let hasSpill = false;
  for (const [s, [to, rot]] of action.moves) {
    if (to === s) { if (rot !== ROT_ID) hasTwist = true; continue; }
    moved.push(s);
    if (orbitOfSite[s] !== entry.orbit) hasSpill = true;
  }
  if (hasSpill) { spill += 1; continue; }
  if (hasTwist) { twisted += 1; continue; }
  if (moved.length < 3) { notPermutation += 1; continue; }
  widths.set(moved.length, (widths.get(moved.length) ?? 0) + 1);
  covered.add(entry.orbit);
  good += 1;
}

console.log(`\nwords whose atom ids resolve: ${level3PureToolWords.length - unresolved}/${level3PureToolWords.length}`);
console.log(`  verified globally pure and orbit-confined: ${good}`);
console.log(`  spill outside their declared orbit:        ${spill}`);
console.log(`  leave a stationary cell twisted:           ${twisted}`);
console.log(`  degenerate (support < 3):                  ${notPermutation}`);
console.log(`support widths: ${[...widths].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' ')}`);
console.log(`word lengths: min ${Math.min(...lengths)}, median ${[...lengths].sort((a,b)=>a-b)[Math.floor(lengths.length/2)]}, max ${Math.max(...lengths)}`);
console.log(`\ndistinct orbits covered by verified tools: ${covered.size}/${orbitSites.length}`);
const missing: string[] = [];
for (let o = 0; o < orbitSites.length; o += 1) if (!covered.has(o)) missing.push(`${siteClasses[orbitSites[o]![0]!]!}(${orbitSites[o]!.length})`);
if (missing.length) {
  const c = new Map<string, number>();
  for (const k of missing) c.set(k, (c.get(k) ?? 0) + 1);
  console.log(`MISSING: ${[...c].map(([k, v]) => `${k}x${v}`).join(' ')}`);
}

// D4 twisters
console.log(`\nD4 orbit index ${level3D4Orbit} (size ${orbitSites[level3D4Orbit]?.length}), twisters exported: ${level3D4TwisterWords.length}`);
let twGood = 0; let twBad = 0;
for (const w of level3D4TwisterWords.slice(0, 500)) {
  const word: Atom[] = [];
  let ok = true;
  for (const id of w) { const a = atomById.get(id); if (!a) { ok = false; break; } word.push(a); }
  if (!ok) { twBad += 1; continue; }
  const action = actionOver(word, supportCandidates(word));
  let positionIdentity = true;
  let anyTwist = false;
  for (const [s, [to, rot]] of action.moves) {
    if (to !== s) { positionIdentity = false; break; }
    if (rot !== ROT_ID) anyTwist = true;
  }
  if (positionIdentity && anyTwist) twGood += 1; else twBad += 1;
}
console.log(`  first 500 twisters: ${twGood} are position-identity twists, ${twBad} are not`);

if (
  unresolved !== 0 ||
  spill !== 0 ||
  twisted !== 0 ||
  notPermutation !== 0 ||
  covered.size !== orbitSites.length ||
  twBad !== 0
) {
  throw new Error('Level 3 exported tool-data audit failed; see the counters above');
}

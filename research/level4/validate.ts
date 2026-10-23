import { mkdirSync, writeFileSync } from 'node:fs';
import { applyExtensionRotation, applyTwistToCubies, cloneCubies, validateTurnTargetRotation } from '../../packages/engine/src/index';
import { atoms as legacyAtoms } from '../scratch/l3sim';
import { createSparseGroup, rotationOfCubie, rotMul } from '../../packages/solver-core/src/algorithms/mengerSparseGroup';

const g3 = createSparseGroup(3);
if (g3.atoms.length !== legacyAtoms.length) throw new Error('Level 3 alphabet size differs');
let entries = 0;
for (const a of legacyAtoms) {
  const b = g3.atomById.get(a.id);
  if (!b || b.rot !== a.rot || b.map.size !== a.map.size) throw new Error(`Legacy atom differs: ${a.id}`);
  for (const [s, t] of a.map) { if (b.map.get(s) !== t) throw new Error(`Legacy map differs: ${a.id} at ${s}`); entries++; }
}
console.log(`Legacy Level 3 comparison: ${legacyAtoms.length} atoms, ${entries} selected-site entries, exact agreement`);

const group = createSparseGroup(4, console.log);
let seed = 20261015;
const random = (n: number): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
// Fresh target identities force the original engine to validate the complete
// 160,000-cell geometry, independently of the sparse builder's local crop.
const families = [...new Set(group.canonical.turnTargets.filter((t) => t.kind === 'extension').map((t) => t.depth))];
let legalityComparisons = 0;
for (const depth of families) {
  const pool = group.canonical.turnTargets.filter((t) => t.kind === 'extension' && t.depth === depth);
  const chosen = new Set([0, pool.length - 1]);
  for (let i = 0; i < 12; i++) chosen.add(random(pool.length));
  for (const i of chosen) for (const angle of [90, -90, 180] as const) {
    const t = pool[i]!;
    const full = validateTurnTargetRotation(group.canonical.cubies, { ...t }, angle);
    const localLegal = group.atomById.has(`e:${t.id}:${angle}`);
    if (full.legal !== localLegal) throw new Error(`Local/full legality differs: ${t.id}:${angle}`);
    legalityComparisons++;
  }
}
console.log(`Level 4 full/local geometry: ${legalityComparisons} independent decisions agree`);

let cubies = cloneCubies(group.canonical.cubies);
const pieceAt = Int32Array.from({ length: group.N }, (_, i) => i);
const siteOf = pieceAt.slice(); const rotOf = new Uint8Array(group.N);
const atomFamilies = [...new Set(group.atoms.map((a) => a.family))];
const word: string[] = [];
for (let step = 0; step < 44; step++) {
  const family = atomFamilies[step % atomFamilies.length]!;
  const pool = group.atoms.filter((a) => a.family === family);
  const atom = pool[random(pool.length)]!;
  word.push(atom.id);
  const pieces = [...atom.map.keys()].map((s) => pieceAt[s]!);
  let i = 0;
  for (const [, to] of atom.map) { const p = pieces[i++]!; siteOf[p] = to; rotOf[p] = rotMul[atom.rot]![rotOf[p]!]!; }
  for (const p of pieces) pieceAt[siteOf[p]!] = p;
  if (atom.kind === 'frame') {
    const frame = { ...group.canonical.frameById.get(atom.refId)! };
    cubies = applyTwistToCubies(cubies, atom.refId, atom.angle, new Map([[atom.refId, frame]]));
  } else {
    const target = { ...group.canonical.turnTargetById.get(atom.refId)! };
    cubies = applyExtensionRotation(cubies, atom.refId, atom.angle, new Map([[atom.refId, target]]));
  }
  for (let p = 0; p < group.N; p++) {
    if (group.siteAt(cubies[p]!.currentPosition) !== siteOf[p] || rotationOfCubie(cubies[p]!) !== rotOf[p]) {
      throw new Error(`Sparse/engine mismatch at step ${step}, piece ${p}`);
    }
  }
  console.log(`Engine replay ${step + 1}/44 (${family}): all ${group.N} cells agree`);
}
const report = { ok: true, legacyAtoms: legacyAtoms.length, legacySelectedEntries: entries,
  localFullLegalityComparisons: legalityComparisons, engineMoves: word.length,
  cellsComparedPerMove: group.N, word };
mkdirSync('research/level4/out', { recursive: true });
writeFileSync('research/level4/out/simulator-validation.json', JSON.stringify(report, null, 2) + '\n');
console.log('All comparisons passed');

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { mengerPuzzleModel as model } from '../../packages/solver-core/src/model/mengerPuzzleModel';
import { level3BlockRestorationAlgorithm, level4BlockRestorationAlgorithm } from '../../packages/solver-core/src/algorithms/higherBlockRestorationSolver';
import { getCachedSparseGroup } from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import { rawReplay, sparseStateOf } from '../../packages/solver-core/src/algorithms/mengerCertifiedReduction';
import { blockGeometry, searchMengerBlockRestoration } from '../../packages/solver-core/src/algorithms/mengerBlockRestoration';
console.debug = () => {};
const level = Number(process.argv[2] ?? 3);
if (level !== 3 && level !== 4) throw new Error('Expected 3 or 4');
const group = getCachedSparseGroup(level);
const solver = level === 3 ? level3BlockRestorationAlgorithm : level4BlockRestorationAlgorithm;
const records = [];
for (const seed of [0, 1, 2]) {
  let state = group.canonical;
  // Coarse frame preserves leaf blocks, fine frame tears many blocks.
  const coarse = group.atoms.filter(a => a.family === `frame-s${3 ** (level - 1)}` && a.angle === 90 && a.refId.startsWith('Y'))[seed]!;
  const fine = group.atoms.filter(a => a.family === 'frame-s1' && a.angle === 90)[seed]!;
  const roll = group.atoms.find(a => a.map.size === 1)!;
  const fine2 = group.atoms.find(a => a.family === 'frame-s1' && a.refId.startsWith('Y') && a.angle === 90)!;
  const scramble = seed === 2 ? [coarse, fine, fine2, roll] : [coarse, fine, roll];
  for (const atom of scramble) state = model.applyMove(state, atom.move);
  const input = sparseStateOf(group, state.cubies);
  const geometry = blockGeometry(group);
  const before = geometry.agreements(input.siteOf);
  assert(before.some(v => v < 20));
  // Incremental candidate scores must equal full recomputation, including broad moves.
  for (const a of [fine, coarse, roll]) {
    const moved = rawReplay(group, input, [a]).state;
    const recomputed = geometry.agreements(moved.siteOf);
    before.forEach((_, b) => assert.equal(geometry.agreement(input.siteOf, b, a), recomputed[b]));
  }
  const none = searchMengerBlockRestoration(group, input, { maxNodes: 0 });
  assert(!none.restored); assert.equal(none.atoms.length, 0);
  const result = await solver.solve(model, state);
  assert(result.success, result.notes);
  let full = state;
  for (const move of result.output_moves) { assert(model.isMoveLegal(full, move)); full = model.applyMove(full, move); }
  assert(model.isSolved(full));
  const record = { seed, level, inputMoves: scramble.map(a => a.id), outputMoves: result.move_count, ms: result.runtime_ms, metrics: JSON.parse(result.explanation[0]!.observation), fullEngineVerified: true };
  records.push(record); console.log(JSON.stringify(record));
}
writeFileSync(`research/results/level${level}-block-restoration.json`, JSON.stringify({ note: 'Three designed coarse+one/two fine+roll states, not random group samples. Full engine endpoints checked. First solve includes lower-level cold caches.', records }, null, 2)+'\n');

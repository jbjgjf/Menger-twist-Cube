import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mengerPuzzleModel as model } from '../../packages/solver-core/src/model/mengerPuzzleModel';
import { level2CertifiedAlgorithm as certified } from '../../packages/solver-core/src/algorithms/level2CertifiedSolver';
import { level2BlockRestorationAlgorithm as hybrid, searchLevel2BlockRestoration, shortenLevel2Word, level2RigidityPreservingMoves } from '../../packages/solver-core/src/algorithms/level2BlockRestorationSolver';
import { createSparseGroup, inverseAtom } from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import { createSeededRng } from '../../packages/solver-core/src/benchmark/scramble';
const group = createSparseGroup(2);
const base = group.canonical;
const replay = (state: typeof base, moves: Parameters<typeof shortenLevel2Word>[1]) => {
  for (const move of moves) { assert(model.isMoveLegal(state, move)); state = model.applyMove(state, move); }
  return state;
};
// Non-adjacent cancellation and preservation of full orientations.
const a = group.atoms.find(a => a.map.size === 1)!;
const b = group.atoms.find(b => b.map.size === 1 && !a.map.has([...b.map.keys()][0]!))!;
const word = [a.move, b.move, inverseAtom(group, a).move];
assert.deepEqual(model.stateFingerprint(replay(base, word)), model.stateFingerprint(replay(base, shortenLevel2Word(group, word))));
assert.equal(shortenLevel2Word(group, word).length, 1);
const transport = group.atoms.filter(a => [...a.map].some(([s, t]) => s !== t));
const tears = transport.filter(a => a.family === 'frame-s1');
const macros = transport.filter(a => a.family === 'frame-s3');
console.debug = () => {};
const preservingAtoms = level2RigidityPreservingMoves().length;
const records = [];
for (const family of ['rigid', 'one-tear', 'two-tears', 'mixed', 'mixed-30'] as const) {
  for (const seed of [1, 2, 3]) {
    const rng = createSeededRng(seed);
    let state = base;
    const pick = (pool: typeof transport) => { state = model.applyMove(state, pool[Math.floor(rng() * pool.length)]!.move); };
    for (let i = 0; i < 3; i++) pick(macros);
    const count = family === 'rigid' ? 0 : family === 'one-tear' ? 1 : family === 'two-tears' ? 2 : family === 'mixed-30' ? 30 : 6;
    for (let i = 0; i < count; i++) pick(family.startsWith('mixed') ? transport : tears);
    const search = searchLevel2BlockRestoration(state);
    // An exhausted fast path must emit no speculative prefix.
    const exhausted = searchLevel2BlockRestoration(state, { maxNodes: 0 });
    if (exhausted.initialDefect) assert.equal(exhausted.moves.length, 0);
    const baseline = await certified.solve(model, state);
    assert(baseline.success); assert(model.isSolved(replay(state, baseline.output_moves)));
    const dStart = performance.now();
    const shortened = shortenLevel2Word(group, baseline.output_moves);
    const dMs = performance.now() - dStart;
    assert(model.isSolved(replay(state, shortened)));
    const result = await hybrid.solve(model, state);
    assert(result.success); assert(model.isSolved(replay(state, result.output_moves)));
    const record = { family, seed, search: { ...search, moves: search.moves.length },
      baseline: { moves: baseline.move_count, ms: baseline.runtime_ms },
      dOnly: { moves: shortened.length, optimizationMs: dMs },
      hybrid: { moves: result.move_count, ms: result.runtime_ms, phase: result.explanation[0]!.observation } };
    records.push(record); console.log(JSON.stringify(record));
  }
}
mkdirSync('research/results', { recursive: true });
writeFileSync('research/results/level2-block-restoration.json', JSON.stringify({ preservingAtoms, legalAtoms: group.atoms.length, note: 'Sequential seeded comparison; first runs include cold caches. D time is optimization only; hybrid includes full engine replay. Not uniform random states.', records }, null, 2)+'\n');

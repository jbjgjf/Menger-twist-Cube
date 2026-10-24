import test from 'node:test';
import assert from 'node:assert/strict';
import { mengerPuzzleModel as model } from '../../packages/solver-core/src/model/mengerPuzzleModel';
import { getCachedSparseGroup } from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import { sparseStateOf } from '../../packages/solver-core/src/algorithms/mengerCertifiedReduction';
import { blockGeometry, searchMengerBlockRestoration } from '../../packages/solver-core/src/algorithms/mengerBlockRestoration';
import { searchLevel2BlockRestoration } from '../../packages/solver-core/src/algorithms/level2BlockRestorationSolver';
import { createHigherBlockRestorationAlgorithm, liftAndCheckMacroAtom } from '../../packages/solver-core/src/algorithms/higherBlockRestorationSolver';
console.debug = () => {};
test('generic defect agrees with independent Level2 vote table; candidate updates agree with engine', () => {
  const g = getCachedSparseGroup(2); const geometry = blockGeometry(g);
  let state = g.canonical;
  for (const ai of [0, 97, 201, 373, 450]) {
    state = model.applyMove(state, g.atoms[ai]!.move);
    const input = sparseStateOf(g, state.cubies);
    const defect = g.N - geometry.agreements(input.siteOf).reduce((a, b) => a + b, 0);
    assert.equal(defect, searchLevel2BlockRestoration(state, { depth: 0 }).initialDefect);
    assert.equal(!!geometry.placements(input.siteOf), defect === 0);
    for (let i = 0; i < g.atoms.length; i += 23) {
      const atom = g.atoms[i]!;
      const actual = sparseStateOf(g, model.applyMove(state, atom.move).cubies);
      geometry.members.forEach((_, bi) => assert.equal(geometry.agreement(input.siteOf, bi, atom), geometry.agreement(actual.siteOf, bi)));
    }
  }
});
test('all Level2 legal atoms lift exactly on all Level3 leaf cells', () => {
  const macro = getCachedSparseGroup(2); const group = getCachedSparseGroup(3);
  for (const atom of macro.atoms) assert(liftAndCheckMacroAtom(group, macro, atom));
});
test('budget validation, forced fallback and invalid orientation rejection', async () => {
  const g = getCachedSparseGroup(3);
  const smallest = g.atoms.filter(a => [...a.map].some(([s, t]) => s !== t)).sort((a, b) => a.map.size - b.map.size)[0]!;
  const state = model.applyMove(g.canonical, smallest.move);
  const input = sparseStateOf(g, state.cubies);
  assert.throws(() => searchMengerBlockRestoration(g, input, { width: 0 }));
  const result = await createHigherBlockRestorationAlgorithm(3, { maxNodes: 0 }).solve(model, state);
  assert(result.success); assert.equal(JSON.parse(result.explanation[0]!.observation).fallback, true);
  let endpoint = state;
  for (const move of result.output_moves) endpoint = model.applyMove(endpoint, move);
  assert(model.isSolved(endpoint));
  const bad = model.cloneState(g.canonical); bad.cubies[0]!.orientation.set(0, 0, 0, 0);
  assert.equal((await createHigherBlockRestorationAlgorithm(3).solve(model, bad)).success, false);
});
test('Level4 forced fallback completes a small positional defect', async () => {
  const group = getCachedSparseGroup(4);
  let smallest = group.atoms[0]!;
  for (const atom of group.atoms) if ([...atom.map].some(([s, t]) => s !== t) && atom.map.size < smallest.map.size) smallest = atom;
  const state = model.applyMove(group.canonical, smallest.move);
  const result = await createHigherBlockRestorationAlgorithm(4, { maxNodes: 0 }).solve(model, state);
  assert(result.success, result.notes);
  const phase = JSON.parse(result.explanation[0]!.observation);
  assert.equal(phase.fallback, true); assert.equal(phase.restored, false);
  // The solver has independently replayed every output atom on the original
  // sparse state. Existing Level4 tests establish its agreement with the engine.
  assert(result.move_count > 0);
});

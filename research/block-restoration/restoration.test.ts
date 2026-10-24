import test from 'node:test';
import assert from 'node:assert/strict';
import { mengerPuzzleModel as model } from '../../packages/solver-core/src/model/mengerPuzzleModel';
import { createSparseGroup, inverseAtom } from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import { searchLevel2BlockRestoration, shortenLevel2Word, level2BlockRestorationAlgorithm } from '../../packages/solver-core/src/algorithms/level2BlockRestorationSolver';
console.debug = () => {};
const group = createSparseGroup(2);
test('one fine frame is restored from state, without history', () => {
  const atom = group.atoms.find(a => a.family === 'frame-s1')!;
  const state = model.applyMove(group.canonical, atom.move);
  const found = searchLevel2BlockRestoration(state);
  assert(found.initialDefect > 0); assert(found.restored); assert.equal(found.moves.length, 1);
  let restored = state;
  for (const move of found.moves) restored = model.applyMove(restored, move);
  assert.equal(searchLevel2BlockRestoration(restored).initialDefect, 0);
});
test('zero search budget emits no partial repair', () => {
  const atom = group.atoms.find(a => a.family === 'frame-s1')!;
  const found = searchLevel2BlockRestoration(model.applyMove(group.canonical, atom.move), { maxNodes: 0 });
  assert(!found.restored); assert.deepEqual(found.moves, []);
});
test('overlapping supports block non-adjacent cancellation; all angle sums replay exactly', () => {
  const a = group.atoms.find(a => a.family === 'frame-s1')!;
  const b = group.atoms.find(b => b.refId !== a.refId && [...a.map.keys()].some(s => b.map.has(s)) && b.kind === 'frame')!;
  assert.equal(shortenLevel2Word(group, [a.move, b.move, inverseAtom(group, a).move]).length, 3);
  const same = group.atoms.filter(b => b.refId === a.refId);
  for (const x of same) for (const y of same) {
    const expected = model.applyMove(model.applyMove(group.canonical, x.move), y.move);
    let actual = group.canonical;
    for (const move of shortenLevel2Word(group, [x.move, y.move])) actual = model.applyMove(actual, move);
    assert.equal(model.stateFingerprint(actual), model.stateFingerprint(expected));
  }
});
test('hybrid rejects a non-bijective input via certified validation', async () => {
  const state = model.cloneState(group.canonical);
  state.cubies[0]!.currentPosition = [...state.cubies[1]!.currentPosition];
  assert.equal((await level2BlockRestorationAlgorithm.solve(model, state)).success, false);
});

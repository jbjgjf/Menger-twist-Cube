import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { applyExtensionRotation, applyTwistToCubies } from '../../../packages/engine/src/index';
import { level4CertifiedData } from '../../../packages/solver-core/src/algorithms/level4CertifiedData';
import { reduceMengerState, sparseStateOf } from '../../../packages/solver-core/src/algorithms/mengerCertifiedReduction';
import { createSparseGroup, fullAction, actionOver, rotationOfCubie } from '../../../packages/solver-core/src/algorithms/mengerSparseGroup';
import { mengerPuzzleModel } from '../../../packages/solver-core/src/model/mengerPuzzleModel';

const group = createSparseGroup(4);
const applyEngineWord = (ids: readonly string[]) => {
  let cubies = group.canonical.cubies;
  for (const id of ids) {
    const a = group.atomById.get(id)!;
    cubies = a.kind === 'frame' ? applyTwistToCubies(cubies, a.refId, a.angle, group.canonical.frameById)
      : applyExtensionRotation(cubies, a.refId, a.angle, group.canonical.turnTargetById);
  }
  return cubies;
};

test('headless Level 4 is materialized independently of rendering', () => {
  const state = mengerPuzzleModel.createState(4);
  assert.equal(state.cubies.length, 160000);
  assert.equal(state.turnTargets.length, 116568);
  assert.equal(state.interactionTier, 'research-evaluation');
});
test('high cell indices survive a nontrivial engine scramble and exact reduction', () => {
  const tool = level4CertifiedData.tools.find((t) => t.orbit === 3049)!;
  const cubies = applyEngineWord(tool.word);
  assert.ok(cubies.some((c, i) => i > 32767 && c.currentPosition.some((v, j) => v !== c.homePosition[j])));
  const result = reduceMengerState(group, level4CertifiedData, cubies);
  assert.ok(result.atoms.length > 0);
  let replay = cubies;
  for (const a of result.atoms) replay = a.kind === 'frame'
    ? applyTwistToCubies(replay, a.refId, a.angle, group.canonical.frameById)
    : applyExtensionRotation(replay, a.refId, a.angle, group.canonical.turnTargetById);
  assert.ok(replay.every((c) => c.currentPosition.every((v, i) => v === c.homePosition[i]) && rotationOfCubie(c) === 0));
});
test('C3 and D4 pair defects are completed, with full engine endpoints', () => {
  for (const kind of ['C3', 'D4']) {
    const tool = level4CertifiedData.pairTwisters.find((t) => t.kind === kind)!;
    const cubies = applyEngineWord(tool.word);
    assert.equal(cubies.filter((c) => rotationOfCubie(c) !== 0).length, 2);
    const result = reduceMengerState(group, level4CertifiedData, cubies);
    let replay = cubies;
    for (const a of result.atoms) replay = a.kind === 'frame'
      ? applyTwistToCubies(replay, a.refId, a.angle, group.canonical.frameById)
      : applyExtensionRotation(replay, a.refId, a.angle, group.canonical.turnTargetById);
    assert.ok(replay.every((c) => c.currentPosition.every((v, i) => v === c.homePosition[i]) && rotationOfCubie(c) === 0));
  }
});
test('rejects a lone C3 twist and a lone D4 flip', () => {
  for (const kind of ['C3', 'D4']) {
    const tool = level4CertifiedData.pairTwisters.find((t) => t.kind === kind)!;
    const cubies = applyEngineWord(tool.word);
    const one = cubies.findIndex((c) => rotationOfCubie(c) !== 0);
    cubies[one] = { ...cubies[one]!, orientation: group.canonical.cubies[one]!.orientation.clone() };
    assert.throws(() => reduceMengerState(group, level4CertifiedData, cubies), kind === 'C3' ? /twist sum/ : /odd flip count/);
  }
});
test('long-word composition agrees with independent per-cell tracing', () => {
  const ids = level4CertifiedData.tools.find((t) => t.word.length > 200)!.word;
  const word = ids.map((id) => group.atomById.get(id)!);
  const actual = fullAction(word);
  const support = new Set(word.flatMap((a) => [...a.map.keys()]));
  assert.deepEqual(actual, actionOver(word, support));
});
test('rejects empty, duplicate-site, off-grid and cross-orbit states', () => {
  assert.throws(() => sparseStateOf(group, []), /Expected/);
  const duplicate = group.canonical.cubies.slice();
  duplicate[0] = { ...duplicate[0]!, currentPosition: duplicate[group.orbits[0]![1]!]!.currentPosition };
  assert.throws(() => sparseStateOf(group, duplicate), /bijectively/);
  const offGrid = group.canonical.cubies.slice();
  offGrid[0] = { ...offGrid[0]!, orientation: offGrid[0]!.orientation.clone().setFromAxisAngle(new Vector3(1, 0, 0), 0.1) };
  assert.throws(() => sparseStateOf(group, offGrid), /non-grid/);
  const nonUnit = group.canonical.cubies.slice();
  nonUnit[0] = { ...nonUnit[0]!, orientation: nonUnit[0]!.orientation.clone().set(0, 0, 0, 2) };
  assert.throws(() => sparseStateOf(group, nonUnit), /non-unit/);
  const unreachable = group.canonical.cubies.slice();
  const a = group.orbits[0]![0]!; const b = group.orbits[1]![0]!;
  unreachable[a] = { ...unreachable[a]!, currentPosition: unreachable[b]!.currentPosition };
  unreachable[b] = { ...unreachable[b]!, currentPosition: group.canonical.cubies[a]!.currentPosition };
  assert.throws(() => sparseStateOf(group, unreachable), /orbit/);
});

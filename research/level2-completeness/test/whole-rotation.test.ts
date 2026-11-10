import assert from 'node:assert/strict';
import test from 'node:test';
import { createMengerPuzzleModel, createSeededRng, getAlgorithm, scrambleState } from '@menger/solver-core';

console.debug = () => {};

for (const system of ['standard', 'inner-square'] as const) {
  test(`${system}: both L2 rotation solvers reach a rigid goal with legal moves`, async () => {
    const model = createMengerPuzzleModel(system);
    const solved = model.createState(2);
    const legal = model.legalMoves(solved);
    const quarterTurns = ['X', 'Y', 'Z'].map((axis) => {
      const frames = solved.frames.filter((frame) => frame.axisName === axis && frame.scale === 3);
      assert.equal(frames.length, 3);
      return frames.map((frame) => {
        const move = legal.find((candidate) => candidate.frameId === frame.id && candidate.angle === 90);
        assert.ok(move);
        return move;
      });
    });
    const positionKey = (state: typeof solved) => state.cubies.map((cubie) => cubie.currentPosition.join(',')).join('|');
    const goals = new Map([[positionKey(solved), solved]]);
    const queue = [solved];
    for (const goal of queue) {
      for (const turns of quarterTurns) {
        const rotated = turns.reduce((state, move) => {
          assert.ok(model.isMoveLegal(state, move));
          return model.applyMove(state, move);
        }, goal);
        const key = positionKey(rotated);
        if (!goals.has(key)) {
          goals.set(key, rotated);
          queue.push(rotated);
        }
      }
    }
    assert.equal(goals.size, 24);

    const target = getAlgorithm('level2-rotation-target')!;
    const search = getAlgorithm('level2-rotation-quotient-search')!;
    const assertSolves = async (solver: typeof target, input: typeof solved) => {
      const result = await solver.solve(model, input);
      assert.ok(result.success, result.notes);
      const final = result.output_moves.reduce((state, move) => {
        assert.ok(model.isMoveLegal(state, move));
        return model.applyMove(state, move);
      }, input);
      const goal = goals.get(positionKey(final));
      assert.ok(goal, 'endpoint positions match one of the physically generated goals');
      final.cubies.forEach((cubie, i) => {
        assert.ok(Math.abs(cubie.orientation.dot(goal.cubies[i]!.orientation)) > 1 - 1e-6);
      });
      return { result, final };
    };

    for (const goal of goals.values()) {
      for (const solver of [target, search]) {
        assert.equal((await assertSolves(solver, goal)).result.move_count, 0);
      }
    }

    const rotated = queue[1]!;
    const fineFrame = solved.frames.find((frame) => frame.axisName === 'Y' && frame.scale === 1)!;
    const first = legal.find((move) => move.frameId === fineFrame.id && move.angle === 90)!;
    const second = system === 'inner-square'
      ? legal.find((move) => move.targetId === 'ring:Z+3:inner' && move.angle === 90)!
      : legal.find((move) => move.frameId !== first.frameId && move.targetKind === 'frame' && move.angle === 90)!;
    const one = model.applyMove(rotated, first);
    const two = model.applyMove(one, second);
    assert.equal((await assertSolves(search, one)).result.move_count, 1);
    assert.equal((await assertSolves(search, two)).result.move_count, 2);
    assert.equal(positionKey((await assertSolves(target, one)).final), positionKey(rotated));

    const { state: deep } = scrambleState(model, rotated, createSeededRng(103), 60);
    assert.match((await assertSolves(search, deep)).result.notes, /certified reduction/);
    assert.match((await assertSolves(target, deep)).result.notes, /once/);
  });
}

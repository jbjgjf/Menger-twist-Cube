/**
 * The ported puzzle and solvers, checked against each other: scramble with the
 * pages' rule, solve, replay the answer on the model, require a solved state.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOctaMove,
  createOctaPuzzle,
  inverseOctaMove,
  isOctaSolved,
  octaPieceGeometry,
  octaScramble,
  octaSlot,
  octaSolverMatchesModel,
  solveOcta,
  solvedOctaState,
  type OctaLevel,
  type OctaMove,
} from '../src/index';

const createRng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const replay = (level: OctaLevel, moves: OctaMove[], from = solvedOctaState(createOctaPuzzle(level))) =>
  moves.reduce((state, move) => applyOctaMove(createOctaPuzzle(level), state, move), from);

test('piece and region counts match the pages', () => {
  const expected: Record<OctaLevel, { pieces: number; regions: number[] }> = {
    0: { pieces: 8, regions: [4] },
    1: { pieces: 32, regions: [12, 4, 4] },
    2: { pieces: 128, regions: [4, 16, 12, 36, 32, 12, 24, 48, 4].sort((a, b) => a - b) },
    3: { pieces: 512, regions: [] },
  };
  for (const level of [0, 1, 2, 3] as OctaLevel[]) {
    const puzzle = createOctaPuzzle(level);
    assert.equal(puzzle.pieces.length, expected[level].pieces);
    assert.equal(new Set(puzzle.pieces.map((p) => p.home.join())).size, puzzle.pieces.length, `level ${level} slots are distinct`);
    if (level <= 1) assert.deepEqual(puzzle.regions.map((r) => r.count), expected[level].regions);
    for (const piece of puzzle.pieces) assert.equal(octaPieceGeometry(piece).positions.length, 9 * 9);
  }
});

test('the Level 2 solver agrees with the model on slots and regions', () => {
  assert.equal(octaSolverMatchesModel(createOctaPuzzle(2)), true);
});

test('a move followed by its inverse is the identity, and turns keep slots inside the puzzle', () => {
  const rng = createRng(3);
  for (const level of [0, 1, 2, 3] as OctaLevel[]) {
    const puzzle = createOctaPuzzle(level);
    const homes = new Set(puzzle.pieces.map((p) => p.home.join()));
    let state = solvedOctaState(puzzle);
    for (const move of octaScramble(puzzle, rng)) {
      const next = applyOctaMove(puzzle, state, move);
      assert.deepEqual(applyOctaMove(puzzle, next, inverseOctaMove(move)), state);
      state = next;
    }
    const slots = puzzle.pieces.map((_, i) => octaSlot(puzzle, state, i).join());
    assert.ok(slots.every((slot) => homes.has(slot)), `level ${level}: a piece left the slot set`);
    assert.equal(new Set(slots).size, puzzle.pieces.length, `level ${level}: two pieces share a slot`);
  }
});

for (const level of [0, 1, 2] as OctaLevel[]) {
  test(`level ${level}: scrambled states are solved by the ported solver`, () => {
    const puzzle = createOctaPuzzle(level);
    const rng = createRng(100 + level);
    for (let trial = 0; trial < (level === 2 ? 3 : 5); trial += 1) {
      const scrambled = replay(level, octaScramble(puzzle, rng));
      assert.equal(isOctaSolved(scrambled), false);
      const solution = solveOcta(puzzle, scrambled);
      assert.ok(solution, `level ${level} trial ${trial}: no solution`);
      assert.equal(isOctaSolved(replay(level, solution, scrambled)), true, `level ${level} trial ${trial}`);
      if (level === 0) assert.ok(solution.length <= 11, 'Level 0 answers are shortest, at most 11 moves');
    }
  });
}

test('level 3 has no solver', () => {
  const puzzle = createOctaPuzzle(3);
  assert.equal(solveOcta(puzzle, solvedOctaState(puzzle)), null);
});

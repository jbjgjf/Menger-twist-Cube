import type { PuzzleModel } from '../model/puzzleModel';

/** Deterministic LCG — same seed always produces the same move sequence. */
export const createSeededRng = (seed: number): (() => number) => {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
};

/**
 * Scrambles a state by repeatedly choosing a random legal move through the
 * model interface. Written generically over `PuzzleModel`, so it works for
 * any future model/algorithm pair without modification — the same property
 * the rest of the benchmark harness depends on.
 */
export const scrambleState = <TState, TMove>(
  model: PuzzleModel<TState, TMove>,
  state: TState,
  rng: () => number,
  length: number,
): { state: TState; moves: TMove[] } => {
  let current = state;
  const moves: TMove[] = [];

  for (let step = 0; step < length; step += 1) {
    const legal = model.legalMoves(current);
    if (legal.length === 0) break;
    const move = legal[Math.floor(rng() * legal.length)]!;
    current = model.applyMove(current, move);
    moves.push(move);
  }

  return { state: current, moves };
};

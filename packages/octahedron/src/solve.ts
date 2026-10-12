/**
 * Typed entry points to the pages' solvers. Each converts the rotation-index
 * state into the input its page's solver read from the meshes, and the
 * solver's output into {@link OctaMove}s — the conversions are the pages'
 * `readState` and `bSolve` handlers. Level 3 has no solver.
 */
import type { OctaDir, OctaMove, OctaPuzzle, OctaState } from './model';
import { octaIdentity, octaRotations, octaSlot } from './model';
import { level0Solver } from './solvers/level0Solver';
import { level1Solver } from './solvers/level1Solver';
import { level2Solver } from './solvers/level2Solver';

interface SolverMove { ai: number; k: number; dir: OctaDir }

export const octaHasSolver = (puzzle: OctaPuzzle): boolean => puzzle.level <= 2;

/** Level 1 page's `readState`: a sticker permutation for the 24 outer pieces and rotations for the 8 inner ones. */
const level1Input = (puzzle: OctaPuzzle, state: OctaState) => {
  const perm = new Uint8Array(72);
  const inner = new Uint8Array(8);
  puzzle.pieces.forEach((_, pi) => {
    if (pi < 8) { inner[pi] = state[pi]!; return; }
    const R = octaRotations[state[pi]!]!;
    const u = level1Solver.slotIdx.get(octaSlot(puzzle, state, pi).join()) as number;
    for (let i = 0; i < 3; i += 1) {
      const sg: number = level1Solver.slotS[pi][i];
      const w = [0, 1, 2].map((r) => R[r * 3 + i]! * sg);
      perm[(pi - 8) * 3 + i] = (u - 8) * 3 + w.findIndex((x) => x !== 0);
    }
  });
  return { perm, inner };
};

/**
 * The Level 2 page refused to solve unless its solver's slots and regions
 * matched the page's own ones; the same check, against this model.
 */
export const octaSolverMatchesModel = (puzzle: OctaPuzzle): boolean => {
  if (puzzle.level !== 2) return true;
  const { slotG, GM, REGION } = level2Solver as { slotG: number[][]; GM: unknown[]; REGION: boolean[][] };
  if (slotG.length !== puzzle.pieces.length) return false;
  if (puzzle.pieces.some((p, i) => slotG[i]!.join() !== p.home.join())) return false;
  if (GM.length !== puzzle.regions.length * 18) return false;
  for (let axis = 0; axis < 6; axis += 1) {
    for (let k = 0; k < puzzle.regions.length; k += 1) {
      for (let u = 0; u < puzzle.pieces.length; u += 1) {
        if (REGION[axis * puzzle.regions.length + k]![u] !== puzzle.inRegion(puzzle.pieces[u]!.home, axis, k)) return false;
      }
    }
  }
  return true;
};

/**
 * A move sequence that solves `state` (up to a whole rotation), or null when the
 * level has no solver or the solver found none. Level 0's answer is shortest;
 * Levels 1 and 2 are not.
 */
export const solveOcta = (puzzle: OctaPuzzle, state: OctaState): OctaMove[] | null => {
  if (puzzle.level === 0) {
    const seq = level0Solver.findSolution(Uint8Array.from(state)) as Array<[number, OctaDir]> | null;
    return seq ? seq.map(([axis, dir]) => ({ axis, region: 0, dir })) : null;
  }
  if (puzzle.level === 1) {
    const ids = (level1Solver.solve as (input: ReturnType<typeof level1Input>) => number[])(level1Input(puzzle, state));
    return ids.map((id) => { const m = level1Solver.GM[id] as SolverMove; return { axis: m.ai, region: m.k, dir: m.dir }; });
  }
  if (puzzle.level === 2) {
    if (!octaSolverMatchesModel(puzzle)) return null;
    const ids = level2Solver.solve(Uint8Array.from(state)) as number[];
    return ids.map((id) => { const m = level2Solver.GM[id] as SolverMove; return { axis: m.ai, region: m.k, dir: m.dir }; });
  }
  return null;
};

/**
 * Builds one more of the solver's lookup tables; returns false once everything
 * is built. The pages ran this in idle slices after load.
 */
export const warmOctaSolverStep = (puzzle: OctaPuzzle): boolean => {
  if (puzzle.level === 0) { level0Solver.findSolution(new Uint8Array(8).fill(octaIdentity)); return false; }
  if (puzzle.level === 1) return level1Solver.warmStep() as boolean;
  if (puzzle.level === 2) return level2Solver.warmStep() as boolean;
  return false;
};

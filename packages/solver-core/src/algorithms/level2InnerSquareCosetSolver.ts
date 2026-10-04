import type { Cubie, MengerPuzzleState } from '@menger/engine';
import type { PuzzleModel } from '../model/puzzleModel';
import type { SolverAlgorithm, SolverMove, SolverRunResult } from '../algorithm/types';
import { emitSolverDebug } from '../debug';
import { mengerPuzzleModel } from '../model/mengerPuzzleModel';
import { level2SliceReductionAlgorithm } from './level2SliceReductionSolver';

/**
 * Level 2 solver for the `inner-square` move system.
 *
 * Let G be the group of the standard system (468 atoms) and H the group of the
 * inner-square system (G plus the 54 ring atoms). The audit proved, with
 * replay-verified certificates (`docs/research/square-region-rotation-impact.md`
 * §6.1), that [H : G] = 2 and G = ker ψ, where
 *
 *   ψ(state) = [ orbit-wise parity vector of the state ∉ span of G's vectors ].
 *
 * So an H-reachable state is G-reachable iff ψ = 0, and a state with ψ = 1
 * becomes G-reachable after any one ring quarter turn with ψ = 1. This solver
 * does exactly that: compute ψ, apply one ring turn if needed, then hand the
 * state to `level2-slice-reduction`.
 *
 * Completeness: this solver solves every H-reachable state **if and only if**
 * `level2-slice-reduction` solves every G-reachable state. The latter is
 * unproved for Level 2 (wiki §4.7), so this solver is not proved complete
 * either — but it adds no new gap of its own.
 */
const solverId = 'level2-inner-square-coset';
const solverName = 'Level 2 inner-square coset reduction';
const solverVersion = '0.1.0';

const key = (position: readonly number[]): string => position.join(',');

interface CosetInvariant {
  siteIndex: Map<string, number>;
  orbitOfSite: number[];
  /** Echelon basis (lowest set bit = pivot) of the span of G's parity vectors. */
  spanG: number[];
}

let cachedInvariant: CosetInvariant | null = null;

const sitePermutation = (cubies: readonly Cubie[], siteIndex: Map<string, number>): number[] | null => {
  const permutation = new Array<number>(cubies.length);
  for (const cubie of cubies) {
    const from = siteIndex.get(key(cubie.homePosition));
    const to = siteIndex.get(key(cubie.currentPosition));
    if (from === undefined || to === undefined) return null;
    permutation[from] = to;
  }
  return permutation;
};

/** Bit k is set iff the permutation is odd on orbit k; `null` if a cell left its orbit. */
const parityVector = (permutation: number[], orbitOfSite: number[]): number | null => {
  const seen = new Array<boolean>(permutation.length).fill(false);
  let mask = 0;
  for (let start = 0; start < permutation.length; start += 1) {
    if (seen[start]) continue;
    if (orbitOfSite[permutation[start]!] !== orbitOfSite[start]) return null;
    let length = 0;
    for (let cursor = start; !seen[cursor]; cursor = permutation[cursor]!) {
      seen[cursor] = true;
      length += 1;
    }
    if (length % 2 === 0) mask ^= 1 << orbitOfSite[start]!;
  }
  return mask;
};

const reduce = (vector: number, basis: readonly number[]): number => {
  let residue = vector;
  for (const row of basis) if (residue & (row & -row)) residue ^= row;
  return residue;
};

/** Site orbits and parity span of G, computed once from the standard system's legal atoms. */
const invariant = (): CosetInvariant => {
  if (cachedInvariant) return cachedInvariant;
  const solved = mengerPuzzleModel.createState(2);
  const siteIndex = new Map(solved.cubies.map((cubie, index) => [key(cubie.homePosition), index]));
  const permutations = mengerPuzzleModel
    .legalMoves(solved)
    .map((move) => sitePermutation(mengerPuzzleModel.applyMove(solved, move).cubies, siteIndex)!);

  const parent = solved.cubies.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]!]!;
      index = parent[index]!;
    }
    return index;
  };
  for (const permutation of permutations) {
    permutation.forEach((to, from) => {
      const [a, b] = [find(from), find(to)];
      if (a !== b) parent[a] = b;
    });
  }
  const orbitIds = new Map<number, number>();
  const orbitOfSite = parent.map((_, index) => {
    const root = find(index);
    if (!orbitIds.has(root)) orbitIds.set(root, orbitIds.size);
    return orbitIds.get(root)!;
  });

  const spanG: number[] = [];
  for (const permutation of permutations) {
    const residue = reduce(parityVector(permutation, orbitOfSite)!, spanG);
    if (residue !== 0) spanG.push(residue);
  }
  cachedInvariant = { siteIndex, orbitOfSite, spanG };
  return cachedInvariant;
};

/**
 * ψ of a Level 2 state: 0 if it lies in G's coset (solvable with standard
 * moves, as far as parity is concerned), 1 if it lies in the other coset of H,
 * `null` if some cell has left its site orbit (not reachable in either system).
 */
export const innerSquareCosetOf = (cubies: readonly Cubie[]): 0 | 1 | null => {
  const { siteIndex, orbitOfSite, spanG } = invariant();
  const permutation = sitePermutation(cubies, siteIndex);
  if (!permutation) return null;
  const vector = parityVector(permutation, orbitOfSite);
  if (vector === null) return null;
  return reduce(vector, spanG) === 0 ? 0 : 1;
};

const failure = (base: SolverRunResult, notes: string, started: number): SolverRunResult => ({
  ...base,
  name: solverName,
  version: solverVersion,
  output_moves: [],
  move_count: 0,
  success: false,
  runtime_ms: performance.now() - started,
  notes,
});

const solve = async (
  model: PuzzleModel<MengerPuzzleState, SolverMove>,
  state: MengerPuzzleState,
): Promise<SolverRunResult> => {
  const started = performance.now();
  if (state.level !== 2) {
    const inner = await level2SliceReductionAlgorithm.solve(model, state);
    return failure(inner, `${solverId} only supports Level 2.`, started);
  }

  const coset = innerSquareCosetOf(state.cubies);
  let prefix: SolverMove[] = [];
  let reduced = state;
  if (coset === 1) {
    // Any legal move that flips ψ will do; in the inner-square system these are
    // exactly the quarter turns of the layer +-3 rings. Take the first one.
    const flip = model
      .legalMoves(state)
      .find((move) => innerSquareCosetOf(model.applyMove(state, move).cubies) === 0);
    if (!flip) {
      const inner = await level2SliceReductionAlgorithm.solve(model, state);
      return failure(
        inner,
        'The state lies in the ψ = 1 coset, which standard moves cannot reach or leave, and this model offers no ' +
          'ring rotation to cross over. Select the inner-square move system.',
        started,
      );
    }
    prefix = [{ ...flip, reason: 'Coset reduction: ψ = 1, so one ring quarter turn brings the state into the standard group G.' }];
    reduced = model.applyMove(state, flip);
    emitSolverDebug(solverId, `ψ = 1: applied ${flip.notation} to enter the standard coset`);
  } else {
    emitSolverDebug(solverId, coset === 0 ? 'ψ = 0: already in the standard coset' : 'a cell is off its site orbit');
  }

  const inner = await level2SliceReductionAlgorithm.solve(model, reduced);
  const output = inner.success ? [...prefix, ...inner.output_moves] : [];
  return {
    ...inner,
    name: solverName,
    version: solverVersion,
    output_moves: output,
    move_count: output.length,
    runtime_ms: performance.now() - started,
    explanation: [
      {
        phase: 'coset',
        objective: 'Decide which coset of the standard group G the state lies in (ψ), and move it into G.',
        observation:
          coset === 1 ? 'ψ = 1: outside G.' : coset === 0 ? 'ψ = 0: inside G (by parity).' : 'A cell is off its site orbit.',
        selectedMove: prefix[0]?.notation,
        reason: prefix[0]?.reason,
        progress: inner.input_state.progress,
      },
      ...inner.explanation,
    ],
    final_strategy: `Coset reduction ([H:G] = 2): at most one ring quarter turn, then ${level2SliceReductionAlgorithm.id}. ${inner.final_strategy}`,
    notes: inner.success
      ? `Solved by coset reduction (${prefix.length} ring move) followed by ${level2SliceReductionAlgorithm.id}.`
      : `After coset reduction, ${level2SliceReductionAlgorithm.id} failed: ${inner.notes}`,
  };
};

/**
 * No `scrambleMovePool`: benchmarks scramble with the model's full legal move
 * set, which under the inner-square model includes the 54 ring atoms.
 */
export const level2InnerSquareCosetAlgorithm: SolverAlgorithm<MengerPuzzleState, SolverMove> = {
  id: solverId,
  name: solverName,
  version: solverVersion,
  levelsSupported: [2],
  solve,
};

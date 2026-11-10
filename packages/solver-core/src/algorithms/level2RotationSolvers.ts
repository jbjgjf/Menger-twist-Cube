import type { MengerPuzzleState } from '@menger/engine';
import type { SolverAlgorithm, SolverExplanationStep, SolverMove } from '../algorithm/types';
import { allBlockRotations, applyMatrixToVector } from './blockRotations';
import { level2CertifiedAlgorithm } from './level2CertifiedSolver';
import { progressForCubies, stateKey } from './level1State';
import { rawReplay, sparseStateOf, type SparsePuzzleState } from './mengerCertifiedReduction';
import { getCachedSparseGroup, inverseAtom, rotInv, rotMul, type SparseGroup } from './mengerSparseGroup';

const geometryCache = new WeakMap<SparseGroup, {
  rotatedSites: number[][];
  solved: SparsePuzzleState;
  neighbors?: Map<string, SolverMove>;
}>();

const geometryFor = (group: SparseGroup) => {
  let geometry = geometryCache.get(group);
  if (!geometry) {
    geometry = {
      rotatedSites: allBlockRotations.map(({ matrix }) =>
        group.sites.map((site) => group.siteAt(applyMatrixToVector(matrix, site)))),
      solved: sparseStateOf(group, group.canonical.cubies),
    };
    geometryCache.set(group, geometry);
  }
  return geometry;
};

// Relabel home sites by R and express each cell's pose relative to R.
// Physical turns act on the left and commute with this right action.
const quotientKey = (state: SparsePuzzleState, rotatedSites: number[][]): string => {
  const anchor = state.rotation[state.pieceAt[0]!]!;
  const sites = rotatedSites[anchor]!;
  const relative = rotInv[anchor]!;
  return Array.from(state.pieceAt, (piece) =>
    String.fromCharCode(sites[piece]! * 24 + rotMul[state.rotation[piece]!]![relative]!),
  ).join('');
};

const solvedRotation = (state: SparsePuzzleState, rotatedSites: number[][]): number | undefined => {
  const rotation = state.rotation[0]!;
  return state.siteOf.every((site, piece) =>
    site === rotatedSites[rotation]![piece] && state.rotation[piece] === rotation,
  ) ? rotation : undefined;
};

const selectTarget = (state: SparsePuzzleState, rotatedSites: number[][]): number => {
  let target = 0;
  let best = Infinity;
  for (const [rotation, sites] of rotatedSites.entries()) {
    const inverse = rotatedSites[rotInv[rotation]!]!;
    const seen = new Uint8Array(state.siteOf.length);
    let score = 0;
    for (const [piece, site] of state.siteOf.entries()) {
      if (site === sites[piece]) {
        score += Number(state.rotation[piece] !== rotation);
      } else if (!seen[site]) {
        let length = 0;
        for (let cursor = site; !seen[cursor]; cursor = state.siteOf[inverse[cursor]!]!) {
          seen[cursor] = 1;
          length++;
        }
        // The base three-cycle tools cost eight atoms, before setup and parity.
        score += 8 * Math.floor(length / 2);
      }
    }
    if (score < best) {
      target = rotation;
      best = score;
    }
  }
  return target;
};

const findShortSolution = (group: SparseGroup, input: SparsePuzzleState): SolverMove[] | undefined => {
  const geometry = geometryFor(group);
  const { rotatedSites, solved } = geometry;
  // One layer from each end gives an exact radius of two in the quotient.
  if (!geometry.neighbors) {
    const neighbors = new Map<string, SolverMove>();
    for (const atom of group.atoms) {
      const key = quotientKey(rawReplay(group, solved, [atom]).state, rotatedSites);
      if (!neighbors.has(key)) neighbors.set(key, inverseAtom(group, atom).move);
    }
    geometry.neighbors = neighbors;
  }
  const direct = geometry.neighbors.get(quotientKey(input, rotatedSites));
  if (direct) return [direct];

  const visited = new Set<string>();
  for (const atom of group.atoms) {
    const key = quotientKey(rawReplay(group, input, [atom]).state, rotatedSites);
    if (visited.has(key)) continue;
    visited.add(key);
    const finish = geometry.neighbors.get(key);
    if (finish) return [atom.move, finish];
  }
  return undefined;
};

const createSolver = (search: boolean): SolverAlgorithm<MengerPuzzleState, SolverMove> => ({
  id: search ? 'level2-rotation-quotient-search' : 'level2-rotation-target',
  name: search ? 'Level 2 rotation quotient search' : 'Level 2 rotation target selection',
  version: '1.0.0',
  levelsSupported: [2],
  moveSystemsSupported: ['standard', 'inner-square'],
  completeIn: ['standard', 'inner-square'],
  async solve(model, state) {
    const started = performance.now();
    const progress = progressForCubies(state.cubies);
    const input_state = {
      level: state.level, cubieCount: state.cubies.length, stateKey: stateKey(state.cubies, false), progress,
    };
    const base = {
      name: this.name, version: this.version, level_supported: [2], input_state,
      complexity_estimate: search ? 'Two one-move frontiers, then certified reduction if needed.'
        : '24 linear goal scores and at most one certified reduction.',
    };
    const failure = (notes: string) => ({
      ...base, success: false, output_moves: [], move_count: 0, runtime_ms: performance.now() - started,
      explanation: [], final_strategy: '', notes,
    });
    if (state.level !== 2) return failure('This solver only supports Level 2.');

    const group = getCachedSparseGroup(2, state.moveSystem ?? 'standard');
    const { rotatedSites } = geometryFor(group);
    let input: SparsePuzzleState;
    try {
      input = sparseStateOf(group, state.cubies);
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }

    const alreadySolved = solvedRotation(input, rotatedSites) !== undefined;
    let moves = alreadySolved ? [] : search ? findShortSolution(group, input) : undefined;
    let strategy = alreadySolved ? 'Already solved up to a whole-cube rotation.' : 'Matched two frontiers modulo whole-cube rotation.';
    let explanation: SolverExplanationStep[] = [];
    if (!moves) {
      const target = search ? 0 : selectTarget(input, rotatedSites);
      const rotation = allBlockRotations[target]!;
      const inverse = allBlockRotations[rotInv[target]!]!.quaternion;
      const relativeState = target === 0 ? state : {
        ...state,
        cubies: state.cubies.map((cubie) => ({
          ...cubie,
          homePosition: applyMatrixToVector(rotation.matrix, cubie.homePosition),
          orientation: cubie.orientation.clone().multiply(inverse),
        })),
      };
      const result = await level2CertifiedAlgorithm.solve(model, relativeState);
      if (!result.success) return failure(result.notes);
      moves = result.output_moves;
      strategy = search ? 'No solution within two moves. Used the certified reduction.'
        : `Selected goal rotation ${target} by cycle cost and ran the certified reduction once.`;
      explanation = result.explanation;
    }

    let current = model.cloneState(state);
    for (const move of moves) {
      if (!model.isMoveLegal(current, move)) return failure(`Replay rejected ${move.notation}.`);
      current = model.applyMove(current, move);
    }
    if (solvedRotation(sparseStateOf(group, current.cubies), rotatedSites) === undefined) {
      return failure('Replay did not reach any of the 24 completed orientations.');
    }
    return {
      ...base, success: true, output_moves: moves, move_count: moves.length, runtime_ms: performance.now() - started,
      explanation: [
        { phase: 'whole-cube rotation', objective: 'Solve in any completed orientation.',
          observation: strategy, progress },
        ...explanation,
        { phase: 'goal verification', objective: 'Replay all moves on the original cube.',
          observation: 'All cells match the same completed orientation. Progress is relative to that goal.',
          progress: progressForCubies(group.canonical.cubies) },
      ],
      final_strategy: strategy, notes: strategy,
    };
  },
});

export const level2RotationTargetAlgorithm = createSolver(false);
export const level2RotationQuotientSearchAlgorithm = createSolver(true);

import { validateFrameRotation, validateTurnTargetRotation, type MengerPuzzleState } from '@menger/engine';
import type { SolverAlgorithm, SolverMove, SolverRunResult } from '../algorithm/types';
import type { PuzzleModel } from '../model/puzzleModel';
import { emitSolverDebug } from '../debug';
import { isExactlySolved, progressForCubies, stateKey } from './level1State';
import { level4CertifiedData } from './level4CertifiedData';
import { reduceMengerState, sparseStateOf } from './mengerCertifiedReduction';
import { getCachedSparseGroup, localLegalityCubies, type SparseAtom, type SparseGroup } from './mengerSparseGroup';

const id = 'level4-slice-reduction';
const name = 'level-4-certified-orbit-reduction';
const version = '0.1.0';
let groupCache: SparseGroup | undefined;
export const warmLevel4SliceReductionSolver = (): void => { getGroup(); };
const getGroup = (): SparseGroup => groupCache ??= getCachedSparseGroup(4);
const primedTargets = new WeakSet<object>();
const poolCache = new WeakMap<object, SolverMove[]>();
export const level4ScrambleWeight = (a: SparseAtom): number =>
  a.kind === 'frame' ? 50 : Number(a.family.slice(5)) <= 2.5 ? 20 : a.family === 'ext-d4' ? 1 : 4;
export const primeLevel4StateLegality = (group: SparseGroup, state: MengerPuzzleState): void => {
  if (primedTargets.has(state.turnTargets)) return;
  const seen = new Set<string>();
  const cubieAt = (p: [number, number, number]) => group.canonical.cubies[group.siteAt(p)];
  for (const a of group.atoms) {
    const key = `${a.kind}:${a.refId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (a.kind === 'frame') {
      const frame = state.frameById.get(a.refId);
      if (!frame || !validateFrameRotation(group.canonical.cubies, frame, 90).legal) throw new Error(`Input lacks legal frame ${a.refId}`);
    } else {
      const target = state.turnTargetById.get(a.refId);
      if (!target || !validateTurnTargetRotation(localLegalityCubies(target, cubieAt, 40), target, 90).legal) throw new Error(`Input lacks legal target ${a.refId}`);
    }
  }
  primedTargets.add(state.turnTargets);
};

const solve = async (model: PuzzleModel<MengerPuzzleState, SolverMove>, puzzle: MengerPuzzleState): Promise<SolverRunResult> => {
  const start = performance.now();
  const inputProgress = progressForCubies(puzzle.cubies);
  const inputState = { level: puzzle.level, cubieCount: puzzle.cubies.length, stateKey: stateKey(puzzle.cubies, false), progress: inputProgress };
  const complexity = '3,050 independent orbit reductions using exact ordered-pair setup transport, 66-bit parity normalization, certified joint orientation completion, and sparse raw-atom replay';
  const base = { name, version, level_supported: [4], input_state: inputState, complexity_estimate: complexity };
  const explanation = [{ phase: 'state inspection', objective: 'Read the full current state without move history.', observation: `${puzzle.cubies.length} cells at Level ${puzzle.level}.`, progress: inputProgress }];
  const failure = (notes: string): SolverRunResult => ({ ...base, output_moves: [], runtime_ms: performance.now() - start, move_count: 0, success: false, explanation, final_strategy: 'Certified Level 4 orbit reduction could not accept the state.', notes });
  if (puzzle.level !== 4 || puzzle.cubies.length !== 160000) return failure('Level 4 requires exactly 160,000 materialized cells.');
  if (puzzle.moveSystem && puzzle.moveSystem !== 'standard') return failure('The certificate covers the standard move system only.');
  try {
    const group = getGroup();
    sparseStateOf(group, puzzle.cubies);
    if (isExactlySolved(puzzle.cubies)) return { ...base, output_moves: [], runtime_ms: performance.now() - start, move_count: 0, success: true, explanation, final_strategy: 'The input is already exactly solved.', notes: 'No moves required.' };
    const result = reduceMengerState(group, level4CertifiedData, puzzle.cubies, (s) => emitSolverDebug(id, s));
    // Occupancy is invariant, so legality is checked once per distinct atom on
    // the actual input geometry. Every output atom comes from this legal set.
    const checked = new Set<string>();
    primeLevel4StateLegality(group, puzzle);
    for (const a of result.atoms) {
      if (checked.has(a.id)) continue;
      if (!model.isMoveLegal(puzzle, a.move)) return failure(`The model rejects output atom ${a.id}.`);
      checked.add(a.id);
    }
    const finalProgress = progressForCubies(group.canonical.cubies);
    explanation.push({ phase: 'independent raw-atom replay', objective: 'Replay every output atom on all selected sites and require every cell to be exactly home and untwisted.', observation: `${result.atoms.length} moves; ${result.placements} pure-cycle placements; ${result.replaySelectedEntries} selected-site updates.`, progress: finalProgress });
    return { ...base, output_moves: result.atoms.map((a) => a.move), runtime_ms: performance.now() - start,
      move_count: result.atoms.length, success: true, explanation,
      final_strategy: 'Normalize the 66-dimensional parity vector, solve all 3,050 independent even orbit permutations with certified pure 3-cycles, clear C3 twists and D4 flips in pairs, clear cell rolls, then replay every raw atom.',
      notes: `Exactly solved all 160,000 cells by sparse integer replay. ${result.setupSearchNodes} setup-search nodes; ${checked.size} distinct output atoms checked with the supplied model. Solutions are not optimal.` };
  } catch (error) { return failure(error instanceof Error ? error.message : String(error)); }
};

const scrambleMovePool = (_model: PuzzleModel<MengerPuzzleState, SolverMove>, state: MengerPuzzleState): SolverMove[] => {
  if (state.level !== 4 || state.cubies.length !== 160000) return [];
  const cached = poolCache.get(state.turnTargets);
  if (cached) return cached;
  const group = getGroup();
  primeLevel4StateLegality(group, state);
  const pool = group.atoms.flatMap((a) => {
    const weight = level4ScrambleWeight(a);
    return Array.from({ length: weight }, () => a.move);
  });
  poolCache.set(state.turnTargets, pool);
  return pool;
};

export const level4SliceReductionAlgorithm: SolverAlgorithm<MengerPuzzleState, SolverMove> = {
  id, name, version, levelsSupported: [4], solve, scrambleMovePool,
};

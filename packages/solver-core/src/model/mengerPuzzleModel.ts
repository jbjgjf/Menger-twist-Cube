import type { MengerPuzzleState, MoveSystem, TwistAngle } from '@menger/engine';
import {
  applyExtensionRotation,
  applyTwistToCubies,
  cloneCubies,
  createExtensionMove,
  createMengerPuzzleState,
  createMove,
  validateFrameRotation,
  validateTurnTargetRotation,
} from '@menger/engine';
import type { PuzzleModel } from './puzzleModel';
import type { SolverMove } from '../algorithm/types';
import { isExactlySolved, stateKey } from '../algorithms/level1State';

const allAngles: TwistAngle[] = [90, -90, 180];

const frameLegalMoves = (state: MengerPuzzleState): SolverMove[] =>
  state.frames
    .flatMap((frame) =>
      allAngles.flatMap((angle) => {
        if (!validateFrameRotation(state.cubies, frame, angle).legal) return [];
        const move = createMove(frame.id, angle, state.frameById);
        return [{
          targetKind: 'frame' as const,
          targetId: move.targetId ?? `frame:${frame.id}`,
          frameId: frame.id,
          angle,
          notation: move.notation,
          reason: '',
        }];
      }),
    );

const extensionLegalMoves = (state: MengerPuzzleState): SolverMove[] =>
  state.turnTargets
    .filter((target) => target.kind === 'extension')
    .flatMap((target) =>
      allAngles.flatMap((angle) => {
        if (!validateTurnTargetRotation(state.cubies, target, angle).legal) return [];
        const move = createExtensionMove(target, angle);
        return [{
          targetKind: 'extension' as const,
          targetId: target.id,
          extensionTargetId: target.id,
          angle,
          notation: move.notation,
          reason: '',
        }];
      }),
    );

const applyMove = (state: MengerPuzzleState, move: SolverMove): MengerPuzzleState => {
  if (move.targetKind === 'frame' && move.frameId) {
    return { ...state, cubies: applyTwistToCubies(state.cubies, move.frameId, move.angle, state.frameById) };
  }
  if (move.targetKind === 'extension' && move.extensionTargetId) {
    return {
      ...state,
      cubies: applyExtensionRotation(state.cubies, move.extensionTargetId, move.angle, state.turnTargetById),
    };
  }
  return state;
};

const isMoveLegal = (state: MengerPuzzleState, move: SolverMove): boolean => {
  if (move.targetKind === 'frame' && move.frameId) {
    const frame = state.frameById.get(move.frameId);
    return frame !== undefined && validateFrameRotation(state.cubies, frame, move.angle).legal;
  }
  if (move.targetKind === 'extension' && move.extensionTargetId) {
    const target = state.turnTargetById.get(move.extensionTargetId);
    return target !== undefined && validateTurnTargetRotation(state.cubies, target, move.angle).legal;
  }
  return false;
};

/**
 * The `PuzzleModel` adapter for the Menger cube: it is the only module that
 * translates between `@menger/engine`'s mechanics and the generic shape the
 * benchmark runner and algorithm registry operate on. Engine itself has no
 * knowledge of this interface — the dependency only points one way
 * (solver-core -> engine), so engine stays usable by the Play app (or any
 * future consumer) without dragging in solver concepts.
 *
 * One model per move system. The system only decides which turn targets a
 * freshly created state carries; legality and application read the state's own
 * target tables, so the rest of the adapter is shared.
 */
export const createMengerPuzzleModel = (moveSystem: MoveSystem): PuzzleModel<MengerPuzzleState, SolverMove> => ({
  id: moveSystem === 'standard' ? 'menger-cube' : `menger-cube+${moveSystem}`,
  levelsSupported: [1, 2, 3, 4, 5],
  createState: (level) => createMengerPuzzleState(level, { moveSystem }),
  cloneState: (state) => ({ ...state, cubies: cloneCubies(state.cubies) }),
  legalMoves: (state) => [...frameLegalMoves(state), ...extensionLegalMoves(state)],
  isMoveLegal,
  applyMove,
  isSolved: (state) => isExactlySolved(state.cubies),
  describeMove: (move) => move.notation,
  stateFingerprint: (state) => stateKey(state.cubies, false),
});

/** The shipped system. Every existing solver, proof and benchmark is stated for this model. */
export const mengerPuzzleModel: PuzzleModel<MengerPuzzleState, SolverMove> = createMengerPuzzleModel('standard');

/** `standard` plus the Level 2 inner square ring rotations. Opt-in. */
export const innerSquareMengerPuzzleModel: PuzzleModel<MengerPuzzleState, SolverMove> =
  createMengerPuzzleModel('inner-square');

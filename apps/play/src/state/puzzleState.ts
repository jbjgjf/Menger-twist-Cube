import type { DragPreview, FrameId, InteractionMode, Move, PuzzleState, TwistAngle } from '../types/puzzle';
import type { Cubie } from '@menger/engine';
import type { Vector3Tuple } from 'three';
import {
  applyCubieRotation,
  applyExtensionRotation,
  applyTwistToCubies,
  createExtensionMove,
  createMengerPuzzleState,
  createMove,
} from '@menger/engine';
import type { SolverMove } from '@menger/solver-core';

export interface PuzzleUiState {
  transparentView: boolean;
  showGuides: boolean;
  hoveredFrame: FrameId | null;
  hoverAffectedIds: Set<string>;
  invalidFeedback: string | null;
  dragPreview: DragPreview | null;
  interactionMode: InteractionMode;
  frameScale: number;
  extensionDepth: number;
}

export interface RootState {
  puzzle: PuzzleState;
  initialCubies: Cubie[];
  ui: PuzzleUiState;
}

export type Action =
  | { type: 'SELECT_FRAME'; frameId: FrameId | null }
  | { type: 'SELECT_CUBIE'; cubieId: string | null }
  | { type: 'SELECT_EXTENSION'; targetId: string | null }
  | { type: 'SET_HOVER'; frameId: FrameId | null; affectedIds: Set<string> }
  | { type: 'SET_ANIMATING'; isAnimating: boolean }
  | { type: 'SET_DRAG_PREVIEW'; preview: DragPreview | null }
  | { type: 'COMMIT_MOVE'; frameId: FrameId; angle: TwistAngle }
  | { type: 'COMMIT_CUBIE_MOVE'; cubieId: string; axis: Vector3Tuple; angle: TwistAngle }
  | { type: 'COMMIT_EXTENSION_MOVE'; targetId: string; angle: TwistAngle }
  | { type: 'APPLY_SOLVER_MOVE'; move: SolverMove }
  | { type: 'APPLY_SOLVER_MOVES'; moves: SolverMove[] }
  | { type: 'SET_LEVEL'; level: number }
  | { type: 'SET_FRAME_SCALE'; scale: number }
  | { type: 'SET_EXTENSION_DEPTH'; depth: number }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET_PUZZLE' }
  | { type: 'SCRAMBLE'; moves: Move[] }
  | { type: 'TOGGLE_TRANSPARENCY' }
  | { type: 'TOGGLE_GUIDES' }
  | { type: 'TOGGLE_MODE' }
  | { type: 'INVALID'; message: string | null };

const cloneMove = (move: Move): Move => ({ ...move });

const applySolverMove = (state: RootState, solverMove: SolverMove): RootState => {
  if (solverMove.targetKind === 'frame' && solverMove.frameId) {
    const move = createMove(solverMove.frameId, solverMove.angle, state.puzzle.frameById);
    return {
      ...state,
      puzzle: {
        ...state.puzzle,
        cubies: applyTwistToCubies(state.puzzle.cubies, solverMove.frameId, solverMove.angle, state.puzzle.frameById),
        moveHistory: [...state.puzzle.moveHistory, move],
        redoStack: [],
      },
      ui: { ...state.ui, invalidFeedback: null, dragPreview: null },
    };
  }

  if (solverMove.targetKind === 'extension' && solverMove.extensionTargetId) {
    const target = state.puzzle.turnTargetById.get(solverMove.extensionTargetId);
    if (!target) return state;
    const move = createExtensionMove(target, solverMove.angle);
    return {
      ...state,
      puzzle: {
        ...state.puzzle,
        cubies: applyExtensionRotation(
          state.puzzle.cubies,
          solverMove.extensionTargetId,
          solverMove.angle,
          state.puzzle.turnTargetById,
        ),
        moveHistory: [...state.puzzle.moveHistory, move],
        redoStack: [],
      },
      ui: { ...state.ui, invalidFeedback: null, dragPreview: null },
    };
  }

  return state;
};

const createPuzzle = (level: number): PuzzleState & { initialCubies: Cubie[] } => {
  const base = createMengerPuzzleState(level);
  return {
    ...base,
    initialCubies: base.cubies.map((cubie) => ({ ...cubie, orientation: cubie.orientation.clone() })),
    moveHistory: [],
    redoStack: [],
    selectedFrame: null,
    selectedCubie: null,
    selectedExtension: null,
    isAnimating: false,
  };
};

export const createInitialState = (): RootState => {
  const puzzle = createPuzzle(1);
  return {
    initialCubies: puzzle.initialCubies,
    puzzle: {
      level: puzzle.level,
      interactionTier: puzzle.interactionTier,
      frames: puzzle.frames,
      frameById: puzzle.frameById,
      turnTargets: puzzle.turnTargets,
      turnTargetById: puzzle.turnTargetById,
      cubies: puzzle.cubies,
      moveHistory: puzzle.moveHistory,
      redoStack: puzzle.redoStack,
      selectedFrame: puzzle.selectedFrame,
      selectedCubie: puzzle.selectedCubie,
      selectedExtension: puzzle.selectedExtension,
      isAnimating: puzzle.isAnimating,
    },
    ui: {
      transparentView: false,
      showGuides: true,
      hoveredFrame: null,
      hoverAffectedIds: new Set(),
      invalidFeedback: null,
      dragPreview: null,
      interactionMode: 'slice',
      frameScale: 1,
      extensionDepth: 1,
    },
  };
};

export const puzzleReducer = (state: RootState, action: Action): RootState => {
  switch (action.type) {
    case 'SELECT_FRAME':
      return {
        ...state,
        puzzle: { ...state.puzzle, selectedFrame: action.frameId },
        ui: { ...state.ui, invalidFeedback: null },
      };
    case 'SELECT_CUBIE':
      return {
        ...state,
        puzzle: { ...state.puzzle, selectedCubie: action.cubieId },
        ui: { ...state.ui, invalidFeedback: null },
      };
    case 'SELECT_EXTENSION':
      return {
        ...state,
        puzzle: { ...state.puzzle, selectedExtension: action.targetId },
        ui: { ...state.ui, invalidFeedback: null },
      };
    case 'TOGGLE_MODE':
      return {
        ...state,
        puzzle: { ...state.puzzle, selectedFrame: null, selectedCubie: null, selectedExtension: null },
        ui: {
          ...state.ui,
          interactionMode: state.ui.interactionMode === 'slice' ? 'cubie' : 'slice',
          invalidFeedback: null,
          dragPreview: null,
        },
      };
    case 'SET_HOVER':
      return {
        ...state,
        ui: {
          ...state.ui,
          hoveredFrame: action.frameId,
          hoverAffectedIds: action.affectedIds,
        },
      };
    case 'SET_ANIMATING':
      return { ...state, puzzle: { ...state.puzzle, isAnimating: action.isAnimating } };
    case 'SET_DRAG_PREVIEW':
      return { ...state, ui: { ...state.ui, dragPreview: action.preview } };
    case 'COMMIT_MOVE': {
      const move = createMove(action.frameId, action.angle, state.puzzle.frameById);
      return {
        ...state,
        puzzle: {
          ...state.puzzle,
          cubies: applyTwistToCubies(state.puzzle.cubies, action.frameId, action.angle, state.puzzle.frameById),
          moveHistory: [...state.puzzle.moveHistory, move],
          redoStack: [],
        },
        ui: { ...state.ui, invalidFeedback: null, dragPreview: null },
      };
    }
    case 'COMMIT_CUBIE_MOVE': {
      const cubie = state.puzzle.cubies.find((c) => c.id === action.cubieId);
      if (!cubie) return state;
      const axisLabel = action.axis[0] ? 'X' : action.axis[1] ? 'Y' : 'Z';
      const notation = `C(${cubie.currentPosition.join(',')})${axisLabel}${action.angle > 0 ? '+' : ''}${action.angle}`;
      const move: Move = {
        frameId: '',
        cubieId: action.cubieId,
        cubieAxis: action.axis,
        angle: action.angle,
        notation,
        timestamp: Date.now(),
      };
      return {
        ...state,
        puzzle: {
          ...state.puzzle,
          cubies: applyCubieRotation(state.puzzle.cubies, action.cubieId, action.axis, action.angle),
          moveHistory: [...state.puzzle.moveHistory, move],
          redoStack: [],
        },
        ui: { ...state.ui, invalidFeedback: null, dragPreview: null },
      };
    }
    case 'COMMIT_EXTENSION_MOVE': {
      const target = state.puzzle.turnTargetById.get(action.targetId);
      if (!target) return state;
      const move = createExtensionMove(target, action.angle);
      return {
        ...state,
        puzzle: {
          ...state.puzzle,
          cubies: applyExtensionRotation(
            state.puzzle.cubies,
            action.targetId,
            action.angle,
            state.puzzle.turnTargetById,
          ),
          moveHistory: [...state.puzzle.moveHistory, move],
          redoStack: [],
        },
        ui: { ...state.ui, invalidFeedback: null, dragPreview: null },
      };
    }
    case 'APPLY_SOLVER_MOVE':
      return applySolverMove(state, action.move);
    case 'APPLY_SOLVER_MOVES':
      return action.moves.reduce((currentState, move) => applySolverMove(currentState, move), state);
    case 'UNDO': {
      const lastMove = state.puzzle.moveHistory[state.puzzle.moveHistory.length - 1];
      if (!lastMove) return state;

      const inverseAngle = (lastMove.angle === 180 ? 180 : -lastMove.angle) as TwistAngle;
      const newCubies = lastMove.extensionTargetId
        ? applyExtensionRotation(state.puzzle.cubies, lastMove.extensionTargetId, inverseAngle, state.puzzle.turnTargetById)
        : lastMove.cubieId && lastMove.cubieAxis
          ? applyCubieRotation(state.puzzle.cubies, lastMove.cubieId, lastMove.cubieAxis, inverseAngle)
          : applyTwistToCubies(state.puzzle.cubies, lastMove.frameId, inverseAngle, state.puzzle.frameById);
      return {
        ...state,
        puzzle: {
          ...state.puzzle,
          cubies: newCubies,
          moveHistory: state.puzzle.moveHistory.slice(0, -1),
          redoStack: [cloneMove(lastMove), ...state.puzzle.redoStack],
        },
      };
    }
    case 'REDO': {
      const [nextMove, ...rest] = state.puzzle.redoStack;
      if (!nextMove) return state;
      const newCubies = nextMove.extensionTargetId
        ? applyExtensionRotation(state.puzzle.cubies, nextMove.extensionTargetId, nextMove.angle, state.puzzle.turnTargetById)
        : nextMove.cubieId && nextMove.cubieAxis
          ? applyCubieRotation(state.puzzle.cubies, nextMove.cubieId, nextMove.cubieAxis, nextMove.angle)
          : applyTwistToCubies(state.puzzle.cubies, nextMove.frameId, nextMove.angle, state.puzzle.frameById);
      return {
        ...state,
        puzzle: {
          ...state.puzzle,
          cubies: newCubies,
          moveHistory: [...state.puzzle.moveHistory, cloneMove(nextMove)],
          redoStack: rest,
        },
      };
    }
    case 'SCRAMBLE': {
      const cubies = action.moves.reduce(
        (acc, move) => move.extensionTargetId
          ? applyExtensionRotation(acc, move.extensionTargetId, move.angle, state.puzzle.turnTargetById)
          : applyTwistToCubies(acc, move.frameId, move.angle, state.puzzle.frameById),
        state.initialCubies.map((cubie) => ({ ...cubie, orientation: cubie.orientation.clone() })),
      );
      return {
        ...state,
        puzzle: {
          ...state.puzzle,
          cubies,
          moveHistory: action.moves,
          redoStack: [],
        },
      };
    }
    case 'RESET_PUZZLE':
      return {
        ...state,
        puzzle: {
          ...state.puzzle,
          cubies: state.initialCubies.map((cubie) => ({ ...cubie, orientation: cubie.orientation.clone() })),
          moveHistory: [],
          redoStack: [],
          selectedCubie: null,
          selectedExtension: null,
          isAnimating: false,
        },
        ui: { ...state.ui, invalidFeedback: null, dragPreview: null },
      };
    case 'SET_LEVEL': {
      const puzzle = createPuzzle(action.level);
      return {
        ...state,
        initialCubies: puzzle.initialCubies,
        puzzle: {
          level: puzzle.level,
          interactionTier: puzzle.interactionTier,
          frames: puzzle.frames,
          frameById: puzzle.frameById,
          turnTargets: puzzle.turnTargets,
          turnTargetById: puzzle.turnTargetById,
          cubies: puzzle.cubies,
          moveHistory: puzzle.moveHistory,
          redoStack: puzzle.redoStack,
          selectedFrame: puzzle.selectedFrame,
          selectedCubie: null,
          selectedExtension: null,
          isAnimating: false,
        },
        ui: {
          ...state.ui,
          hoveredFrame: null,
          hoverAffectedIds: new Set(),
          invalidFeedback: null,
          dragPreview: null,
          interactionMode: 'slice',
          frameScale: 1,
          extensionDepth: 1,
        },
      };
    }
    case 'SET_FRAME_SCALE':
      return { ...state, ui: { ...state.ui, frameScale: action.scale } };
    case 'SET_EXTENSION_DEPTH':
      return {
        ...state,
        puzzle: { ...state.puzzle, selectedExtension: null },
        ui: { ...state.ui, extensionDepth: action.depth },
      };
    case 'TOGGLE_TRANSPARENCY':
      return { ...state, ui: { ...state.ui, transparentView: !state.ui.transparentView } };
    case 'TOGGLE_GUIDES':
      return { ...state, ui: { ...state.ui, showGuides: !state.ui.showGuides } };
    case 'INVALID':
      return { ...state, ui: { ...state.ui, invalidFeedback: action.message } };
    default:
      return state;
  }
};

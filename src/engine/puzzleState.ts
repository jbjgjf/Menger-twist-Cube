import type { DragPreview, FrameId, Move, PuzzleState, TwistAngle } from '../types/puzzle';
import { generateMenger } from './generateMenger';
import { createFrameMap, generateRotationFrames } from './frameDefinitions';
import { applyTwistToCubies, createMove } from './moves';

export interface PuzzleUiState {
  transparentView: boolean;
  showGuides: boolean;
  hoveredFrame: FrameId | null;
  hoverAffectedIds: Set<string>;
  invalidFeedback: string | null;
  dragPreview: DragPreview | null;
}

export interface RootState {
  puzzle: PuzzleState;
  initialCubies: ReturnType<typeof generateMenger>;
  ui: PuzzleUiState;
}

export type Action =
  | { type: 'SELECT_FRAME'; frameId: FrameId | null }
  | { type: 'SET_HOVER'; frameId: FrameId | null; affectedIds: Set<string> }
  | { type: 'SET_ANIMATING'; isAnimating: boolean }
  | { type: 'SET_DRAG_PREVIEW'; preview: DragPreview | null }
  | { type: 'COMMIT_MOVE'; frameId: FrameId; angle: TwistAngle }
  | { type: 'SET_LEVEL'; level: number }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET_PUZZLE' }
  | { type: 'SCRAMBLE'; moves: Move[] }
  | { type: 'TOGGLE_TRANSPARENCY' }
  | { type: 'TOGGLE_GUIDES' }
  | { type: 'INVALID'; message: string | null };

const cloneMove = (move: Move): Move => ({ ...move });

const createPuzzle = (level: number): PuzzleState & { initialCubies: ReturnType<typeof generateMenger> } => {
  const cubies = generateMenger(level);
  const frames = generateRotationFrames(level);
  const frameById = createFrameMap(frames);
  return {
    initialCubies: cubies.map((cubie) => ({ ...cubie, orientation: cubie.orientation.clone() })),
    level,
    frames,
    frameById,
    cubies,
    moveHistory: [],
    redoStack: [],
    selectedFrame: null,
    isAnimating: false,
  };
};

export const createInitialState = (): RootState => {
  const puzzle = createPuzzle(1);
  return {
    initialCubies: puzzle.initialCubies,
    puzzle: {
      level: puzzle.level,
      frames: puzzle.frames,
      frameById: puzzle.frameById,
      cubies: puzzle.cubies,
      moveHistory: puzzle.moveHistory,
      redoStack: puzzle.redoStack,
      selectedFrame: puzzle.selectedFrame,
      isAnimating: puzzle.isAnimating,
    },
    ui: {
      transparentView: false,
      showGuides: true,
      hoveredFrame: null,
      hoverAffectedIds: new Set(),
      invalidFeedback: null,
      dragPreview: null,
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
    case 'UNDO': {
      const lastMove = state.puzzle.moveHistory[state.puzzle.moveHistory.length - 1];
      if (!lastMove) return state;

      const inverseAngle = (lastMove.angle === 180 ? 180 : -lastMove.angle) as TwistAngle;
      return {
        ...state,
        puzzle: {
          ...state.puzzle,
          cubies: applyTwistToCubies(state.puzzle.cubies, lastMove.frameId, inverseAngle, state.puzzle.frameById),
          moveHistory: state.puzzle.moveHistory.slice(0, -1),
          redoStack: [cloneMove(lastMove), ...state.puzzle.redoStack],
        },
      };
    }
    case 'REDO': {
      const [nextMove, ...rest] = state.puzzle.redoStack;
      if (!nextMove) return state;
      return {
        ...state,
        puzzle: {
          ...state.puzzle,
          cubies: applyTwistToCubies(state.puzzle.cubies, nextMove.frameId, nextMove.angle, state.puzzle.frameById),
          moveHistory: [...state.puzzle.moveHistory, cloneMove(nextMove)],
          redoStack: rest,
        },
      };
    }
    case 'SCRAMBLE': {
      const cubies = action.moves.reduce(
        (acc, move) => applyTwistToCubies(acc, move.frameId, move.angle, state.puzzle.frameById),
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
          frames: puzzle.frames,
          frameById: puzzle.frameById,
          cubies: puzzle.cubies,
          moveHistory: puzzle.moveHistory,
          redoStack: puzzle.redoStack,
          selectedFrame: puzzle.selectedFrame,
          isAnimating: false,
        },
        ui: {
          ...state.ui,
          hoveredFrame: null,
          hoverAffectedIds: new Set(),
          invalidFeedback: null,
          dragPreview: null,
        },
      };
    }
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

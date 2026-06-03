import { useEffect, useMemo, useReducer, useState } from 'react';
import ControlPanel from './components/ControlPanel';
import MoveHistory from './components/MoveHistory';
import Scene, { type CameraPreset } from './components/Scene';
import { createMove, cubieNaturalAxis, getAffectedCubieIds } from './engine/moves';
import { createInitialState, puzzleReducer } from './engine/puzzleState';
import { findKeyboardCommand, ignoresKeyboardControls } from './input/keyboardControls';
import type { FrameId, TwistAngle } from './types/puzzle';

const animationDurationMs = 380;

const randomAngle = (): TwistAngle => {
  const values: TwistAngle[] = [90, -90, 180];
  return values[Math.floor(Math.random() * values.length)]!;
};

export default function App() {
  const [state, dispatch] = useReducer(puzzleReducer, undefined, createInitialState);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('reset');
  const [cameraPresetRequest, setCameraPresetRequest] = useState(0);

  const requestCameraPreset = (preset: CameraPreset) => {
    setCameraPreset(preset);
    setCameraPresetRequest((request) => request + 1);
  };

  const runMove = (frame: FrameId | null, angle: TwistAngle) => {
    if (!frame) {
      dispatch({ type: 'INVALID', message: 'Select a frame before rotating.' });
      return;
    }
    if (state.puzzle.isAnimating) {
      dispatch({ type: 'INVALID', message: 'Animation in progress. Please wait.' });
      return;
    }

    dispatch({ type: 'SET_ANIMATING', isAnimating: true });
    dispatch({ type: 'SET_DRAG_PREVIEW', preview: { frameId: frame, angle: 0 } });

    const start = performance.now();
    const animate = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - start) / animationDurationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      dispatch({ type: 'SET_DRAG_PREVIEW', preview: { frameId: frame, angle: angle * eased } });

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        dispatch({ type: 'COMMIT_MOVE', frameId: frame, angle });
        dispatch({ type: 'SET_ANIMATING', isAnimating: false });
      }
    };

    requestAnimationFrame(animate);
  };

  const runCubieRotation = (cubieId: string | null, angle: TwistAngle) => {
    if (!cubieId) {
      dispatch({ type: 'INVALID', message: 'Select a cubie before rotating.' });
      return;
    }
    if (state.puzzle.isAnimating) {
      dispatch({ type: 'INVALID', message: 'Animation in progress. Please wait.' });
      return;
    }

    const cubie = state.puzzle.cubies.find((c) => c.id === cubieId);
    if (!cubie) return;
    const axis = cubieNaturalAxis(cubie.currentPosition);

    dispatch({ type: 'SET_ANIMATING', isAnimating: true });
    dispatch({ type: 'SET_DRAG_PREVIEW', preview: { cubieId, cubieAxis: axis, angle: 0 } });

    const start = performance.now();
    const animate = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - start) / animationDurationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      dispatch({ type: 'SET_DRAG_PREVIEW', preview: { cubieId, cubieAxis: axis, angle: angle * eased } });

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        dispatch({ type: 'COMMIT_CUBIE_MOVE', cubieId, axis, angle });
        dispatch({ type: 'SET_ANIMATING', isAnimating: false });
      }
    };

    requestAnimationFrame(animate);
  };

  const onMove = (angle: TwistAngle) => {
    if (state.ui.interactionMode === 'cubie') {
      runCubieRotation(state.puzzle.selectedCubie, angle);
    } else {
      runMove(state.puzzle.selectedFrame, angle);
    }
  };

  const scramble = () => {
    if (state.puzzle.isAnimating) return;
    const scrambleMoves = Array.from({ length: 14 }).map(() => {
      const frame = state.puzzle.frames[Math.floor(Math.random() * state.puzzle.frames.length)]!;
      return createMove(frame.id, randomAngle(), state.puzzle.frameById);
    });
    dispatch({ type: 'SCRAMBLE', moves: scrambleMoves });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || ignoresKeyboardControls(event.target)) return;

      const command = findKeyboardCommand(event, state.puzzle.frames);
      if (!command) return;

      event.preventDefault();

      switch (command.type) {
        case 'select-frame':
          dispatch({ type: 'SELECT_FRAME', frameId: command.frameId });
          return;
        case 'cycle-frame': {
          const selected = state.puzzle.selectedFrame;
          const keyboardFrameOrder = state.puzzle.frames.map((frame) => frame.id);
          const currentIndex = selected ? keyboardFrameOrder.indexOf(selected) : -1;
          const nextIndex = (currentIndex + command.direction + keyboardFrameOrder.length) % keyboardFrameOrder.length;
          dispatch({ type: 'SELECT_FRAME', frameId: keyboardFrameOrder[nextIndex]! });
          return;
        }
        case 'rotate-selected':
          if (state.ui.interactionMode === 'cubie') {
            runCubieRotation(state.puzzle.selectedCubie, command.angle);
          } else {
            runMove(state.puzzle.selectedFrame, command.angle);
          }
          return;
        case 'rotate-frame':
          dispatch({ type: 'SELECT_FRAME', frameId: command.frameId });
          runMove(command.frameId, command.angle);
          return;
        case 'undo':
          dispatch({ type: 'UNDO' });
          return;
        case 'redo':
          dispatch({ type: 'REDO' });
          return;
        case 'reset':
          dispatch({ type: 'RESET_PUZZLE' });
          return;
        case 'scramble':
          scramble();
          return;
        case 'toggle-transparent':
          dispatch({ type: 'TOGGLE_TRANSPARENCY' });
          return;
        case 'toggle-guides':
          dispatch({ type: 'TOGGLE_GUIDES' });
          return;
        case 'toggle-mode':
          dispatch({ type: 'TOGGLE_MODE' });
          return;
        case 'camera':
          requestCameraPreset(command.preset);
          return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.puzzle.frames, state.puzzle.frameById, state.puzzle.isAnimating, state.puzzle.selectedFrame, state.puzzle.selectedCubie, state.ui.interactionMode]);

  const hoverPreviewCount = useMemo(() => {
    const frame = state.ui.hoveredFrame ?? state.puzzle.selectedFrame;
    if (!frame) return 0;
    return getAffectedCubieIds(state.puzzle.cubies, frame, state.puzzle.frameById).size;
  }, [state.puzzle.cubies, state.puzzle.frameById, state.puzzle.selectedFrame, state.ui.hoveredFrame]);

  const onGuideDrag = (frameId: FrameId, angle: number | null) => {
    dispatch({ type: 'SELECT_FRAME', frameId });
    if (angle === null) {
      const preview = state.ui.dragPreview;
      if (!preview || Math.abs(preview.angle) < 25) {
        dispatch({ type: 'SET_DRAG_PREVIEW', preview: null });
        return;
      }

      const snapped = (Math.abs(preview.angle) > 65 ? Math.sign(preview.angle) * 90 : Math.sign(preview.angle) * 45) as number;
      const moveAngle = (Math.abs(snapped) === 45 ? (snapped > 0 ? 90 : -90) : snapped) as TwistAngle;
      runMove(frameId, moveAngle);
      return;
    }

    dispatch({ type: 'INVALID', message: null });
    dispatch({ type: 'SET_DRAG_PREVIEW', preview: { frameId, angle } });
  };

  return (
    <div className="relative h-full w-full">
      <Scene
        cubies={state.puzzle.cubies}
        level={state.puzzle.level}
        frames={state.puzzle.frames}
        frameById={state.puzzle.frameById}
        selectedFrame={state.puzzle.selectedFrame}
        selectedCubie={state.puzzle.selectedCubie}
        interactionMode={state.ui.interactionMode}
        hoveredFrame={state.ui.hoveredFrame}
        transparentView={state.ui.transparentView}
        showGuides={state.ui.showGuides}
        dragPreview={state.ui.dragPreview}
        cameraPreset={cameraPreset}
        cameraPresetRequest={cameraPresetRequest}
        onHoverFrame={(frame) => {
          const affected = frame ? getAffectedCubieIds(state.puzzle.cubies, frame, state.puzzle.frameById) : new Set<string>();
          dispatch({ type: 'SET_HOVER', frameId: frame, affectedIds: affected });
        }}
        onSelectFrame={(frameId) => dispatch({ type: 'SELECT_FRAME', frameId })}
        onSelectCubie={(cubieId) => dispatch({ type: 'SELECT_CUBIE', cubieId })}
        onDragPreview={onGuideDrag}
      />

      <div className="pointer-events-none absolute inset-0 flex items-start justify-between gap-3 p-2 sm:p-4">
        <ControlPanel
          selectedFrame={state.puzzle.selectedFrame}
          level={state.puzzle.level}
          cubieCount={state.puzzle.cubies.length}
          frameCount={state.puzzle.frames.length}
          isAnimating={state.puzzle.isAnimating}
          invalidFeedback={state.ui.invalidFeedback}
          onMove={onMove}
          onScramble={scramble}
          onReset={() => dispatch({ type: 'RESET_PUZZLE' })}
          onUndo={() => dispatch({ type: 'UNDO' })}
          onRedo={() => dispatch({ type: 'REDO' })}
          onToggleTransparent={() => dispatch({ type: 'TOGGLE_TRANSPARENCY' })}
          onToggleGuides={() => dispatch({ type: 'TOGGLE_GUIDES' })}
          onSetCameraPreset={requestCameraPreset}
          onSetLevel={(level) => dispatch({ type: 'SET_LEVEL', level })}
        />

        <div className="pointer-events-auto hidden w-[280px] space-y-3 md:block">
          <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-300">
            <p className="mb-1 font-semibold text-slate-100">
              Interaction hints
              <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${state.ui.interactionMode === 'cubie' ? 'bg-amber-500/30 text-amber-300' : 'bg-sky-500/20 text-sky-300'}`}>
                {state.ui.interactionMode === 'cubie' ? 'CUBIE MODE' : 'SLICE MODE'}
              </span>
            </p>
            <ul className="space-y-1">
              <li>• Tab: toggle Slice / Cubie mode</li>
              {state.ui.interactionMode === 'slice' ? (
                <>
                  <li>• Tap cubie face: select and highlight a frame</li>
                  <li>• Drag highlighted cubies: preview and release to turn</li>
                  <li>• 1-9: select frame, Q/E: cycle frame</li>
                  <li>• A/D/S or J/L/K: rotate selected frame</li>
                  <li>• Shift+1-9 / Alt+1-9: quick turn frame</li>
                </>
              ) : (
                <>
                  <li>• Tap non-corner cubie: select it (gold outline)</li>
                  <li>• A/D: rotate selected cubie ±90°</li>
                  <li>• S: rotate selected cubie 180°</li>
                  <li>• Rotation axis: perpendicular to the edge</li>
                </>
              )}
              <li>• Drag empty space: orbit view</li>
              <li>• Hover/drag guide rings work ({hoverPreviewCount})</li>
            </ul>
          </div>
          <MoveHistory moves={state.puzzle.moveHistory} />
        </div>
      </div>
    </div>
  );
}

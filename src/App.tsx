import { useEffect, useMemo, useReducer, useState } from 'react';
import ControlPanel from './components/ControlPanel';
import MoveHistory from './components/MoveHistory';
import Scene, { type CameraPreset } from './components/Scene';
import { frames } from './engine/frameDefinitions';
import { createMove, getAffectedCubieIds } from './engine/moves';
import { createInitialState, puzzleReducer } from './engine/puzzleState';
import { findKeyboardCommand, ignoresKeyboardControls, keyboardFrameOrder } from './input/keyboardControls';
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

  const onMove = (angle: TwistAngle) => {
    runMove(state.puzzle.selectedFrame, angle);
  };

  const scramble = () => {
    if (state.puzzle.isAnimating) return;
    const scrambleMoves = Array.from({ length: 14 }).map(() => {
      const frame = frames[Math.floor(Math.random() * frames.length)]!;
      return createMove(frame.id, randomAngle());
    });
    dispatch({ type: 'SCRAMBLE', moves: scrambleMoves });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || ignoresKeyboardControls(event.target)) return;

      const command = findKeyboardCommand(event);
      if (!command) return;

      event.preventDefault();

      switch (command.type) {
        case 'select-frame':
          dispatch({ type: 'SELECT_FRAME', frameId: command.frameId });
          return;
        case 'cycle-frame': {
          const selected = state.puzzle.selectedFrame;
          const currentIndex = selected ? keyboardFrameOrder.indexOf(selected) : -1;
          const nextIndex = (currentIndex + command.direction + keyboardFrameOrder.length) % keyboardFrameOrder.length;
          dispatch({ type: 'SELECT_FRAME', frameId: keyboardFrameOrder[nextIndex]! });
          return;
        }
        case 'rotate-selected':
          runMove(state.puzzle.selectedFrame, command.angle);
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
        case 'camera':
          requestCameraPreset(command.preset);
          return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.puzzle.isAnimating, state.puzzle.selectedFrame]);

  const hoverPreviewCount = useMemo(() => {
    const frame = state.ui.hoveredFrame ?? state.puzzle.selectedFrame;
    if (!frame) return 0;
    return getAffectedCubieIds(state.puzzle.cubies, frame).size;
  }, [state.puzzle.cubies, state.puzzle.selectedFrame, state.ui.hoveredFrame]);

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
        selectedFrame={state.puzzle.selectedFrame}
        hoveredFrame={state.ui.hoveredFrame}
        transparentView={state.ui.transparentView}
        showGuides={state.ui.showGuides}
        dragPreview={state.ui.dragPreview}
        cameraPreset={cameraPreset}
        cameraPresetRequest={cameraPresetRequest}
        onHoverFrame={(frame) => {
          const affected = frame ? getAffectedCubieIds(state.puzzle.cubies, frame) : new Set<string>();
          dispatch({ type: 'SET_HOVER', frameId: frame, affectedIds: affected });
        }}
        onSelectFrame={(frameId) => dispatch({ type: 'SELECT_FRAME', frameId })}
        onDragPreview={onGuideDrag}
      />

      <div className="pointer-events-none absolute inset-0 flex items-start justify-between gap-3 p-2 sm:p-4">
        <ControlPanel
          selectedFrame={state.puzzle.selectedFrame}
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
        />

        <div className="pointer-events-auto hidden w-[280px] space-y-3 md:block">
          <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-300">
            <p className="mb-1 font-semibold text-slate-100">Interaction hints</p>
            <ul className="space-y-1">
              <li>• Drag empty space: orbit view</li>
              <li>• Tap cubie face: select and highlight a frame</li>
              <li>• Drag highlighted cubies: preview and release to turn</li>
              <li>• Bottom-right axis: tap a direction to reorient view</li>
              <li>• Scroll: zoom</li>
              <li>• Hover/drag guide rings still work ({hoverPreviewCount})</li>
              <li>• 1-9: select frame, Q/E: cycle frame</li>
              <li>• A/D/S or J/L/K: rotate selected frame</li>
              <li>• Shift+1-9 / Alt+1-9: quick turn frame</li>
            </ul>
          </div>
          <MoveHistory moves={state.puzzle.moveHistory} />
        </div>
      </div>
    </div>
  );
}

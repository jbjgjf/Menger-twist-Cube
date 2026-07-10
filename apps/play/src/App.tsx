import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import ControlPanel from './components/ControlPanel';
import MoveHistory from './components/MoveHistory';
import Scene, { type CameraPreset } from './components/Scene';
import SolverPanel from './components/SolverPanel';
import KeyboardGuide from './KeyboardGuide';
import {
  createMove,
  getAffectedCubieIds,
  getAffectedTurnTargetCubieIds,
  availableScalesForLevel,
  isPlayableLevel,
  turnTargetSummaryForLevel,
} from '@menger/engine';
import { createInitialState, puzzleReducer } from './state/puzzleState';
import { findKeyboardCommand, ignoresKeyboardControls } from './input/keyboardControls';
import type { AxisName, DragPreview, FrameId, RotationFrame, TurnTarget, TwistAngle } from './types/puzzle';
import {
  clearBenchmarkRecords,
  isSolverAvailableForLevel,
  loadBenchmarkRecords,
  runAndRecordSolve,
  warmSolverForLevel,
} from './solver/solverController';
import type { SolverMove, SolverRunResult } from '@menger/solver-core';

// --- Frame navigation helpers ---

const findFrameForAxis = (
  axisName: AxisName,
  frames: RotationFrame[],
  currentFrameId: FrameId | null,
  frameById: Map<FrameId, RotationFrame>,
  frameScale: number,
): FrameId | null => {
  const currentFrame = currentFrameId ? frameById.get(currentFrameId) : null;
  if (currentFrame?.axisName === axisName) return currentFrameId; // already on this axis
  const axisFrames = frames.filter((f) => f.axisName === axisName && f.scale === frameScale);
  if (axisFrames.length === 0) return null;
  const targetGroupIndex = Math.min(
    currentFrame?.groupIndex ?? Math.floor(axisFrames.length / 2),
    axisFrames.length - 1,
  );
  return axisFrames.find((f) => f.groupIndex === targetGroupIndex)?.id ?? axisFrames[0]?.id ?? null;
};

const cycleLayerFrame = (
  direction: 1 | -1,
  frames: RotationFrame[],
  currentFrameId: FrameId | null,
  frameById: Map<FrameId, RotationFrame>,
  frameScale: number,
): FrameId | null => {
  const currentFrame = currentFrameId ? frameById.get(currentFrameId) : null;
  const axis = currentFrame?.axisName ?? 'X';
  const axisFrames = frames
    .filter((f) => f.axisName === axis && f.scale === frameScale)
    .sort((a, b) => a.groupIndex - b.groupIndex);
  if (axisFrames.length === 0) return null;
  const currentIndex = currentFrame ? axisFrames.findIndex((f) => f.id === currentFrame.id) : -1;
  const nextIndex = (currentIndex + direction + axisFrames.length) % axisFrames.length;
  return axisFrames[nextIndex]?.id ?? null;
};

const findFrameAtScale = (
  newScale: number,
  frames: RotationFrame[],
  currentFrameId: FrameId | null,
  frameById: Map<FrameId, RotationFrame>,
): FrameId | null => {
  const currentFrame = currentFrameId ? frameById.get(currentFrameId) : null;
  const axis = currentFrame?.axisName ?? 'X';
  const axisFrames = frames.filter((f) => f.axisName === axis && f.scale === newScale);
  if (axisFrames.length === 0) return null;
  if (!currentFrame) return axisFrames[Math.floor(axisFrames.length / 2)]?.id ?? null;
  return axisFrames.reduce((best, f) =>
    Math.abs(f.layer - currentFrame.layer) < Math.abs(best.layer - currentFrame.layer) ? f : best,
  ).id;
};

const extensionTargetsAtDepth = (targets: TurnTarget[], depth: number): TurnTarget[] =>
  targets.filter((target) => target.kind === 'extension' && target.depth === depth);

const extensionDepthsFromTargets = (targets: TurnTarget[]): number[] =>
  Array.from(new Set(
    targets
      .filter((target) => target.kind === 'extension')
      .map((target) => target.depth),
  )).sort((a, b) => a - b);

const cycleExtensionTarget = (
  direction: 1 | -1,
  targets: TurnTarget[],
  currentTargetId: string | null,
  depth: number,
): string | null => {
  const targetList = extensionTargetsAtDepth(targets, depth);
  if (targetList.length === 0) return null;
  const currentIndex = currentTargetId ? targetList.findIndex((target) => target.id === currentTargetId) : -1;
  const nextIndex = (currentIndex + direction + targetList.length) % targetList.length;
  return targetList[nextIndex]?.id ?? null;
};

const animationDurationMs = 380;

const randomAngle = (): TwistAngle => {
  const values: TwistAngle[] = [90, -90, 180];
  return values[Math.floor(Math.random() * values.length)]!;
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => {
  window.setTimeout(resolve, ms);
});

const previewForSolverMove = (move: SolverMove): DragPreview | null => {
  if (move.targetKind === 'frame' && move.frameId) return { frameId: move.frameId, angle: move.angle };
  if (move.targetKind === 'extension' && move.extensionTargetId) {
    return { extensionTargetId: move.extensionTargetId, angle: move.angle };
  }
  return null;
};

function PlayApp() {
  const [state, dispatch] = useReducer(puzzleReducer, undefined, createInitialState);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('reset');
  const [cameraPresetRequest, setCameraPresetRequest] = useState(0);
  const [solverRun, setSolverRun] = useState<SolverRunResult | null>(null);
  const [benchmarkRecords, setBenchmarkRecords] = useState(loadBenchmarkRecords);
  const [stepMoves, setStepMoves] = useState<SolverMove[]>([]);
  const [nextStepIndex, setNextStepIndex] = useState(0);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    warmSolverForLevel(state.puzzle);
  }, []);

  const invalidateSolverState = () => {
    setSolverRun(null);
    setStepMoves([]);
    setNextStepIndex(0);
  };

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

    invalidateSolverState();
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

  const runExtensionRotation = (targetId: string | null, angle: TwistAngle) => {
    if (!targetId) {
      dispatch({ type: 'INVALID', message: 'Select an extension target before rotating.' });
      return;
    }
    if (state.puzzle.isAnimating) {
      dispatch({ type: 'INVALID', message: 'Animation in progress. Please wait.' });
      return;
    }

    const target = state.puzzle.turnTargetById.get(targetId);
    if (!target || target.kind !== 'extension') return;

    invalidateSolverState();
    dispatch({ type: 'SET_ANIMATING', isAnimating: true });
    dispatch({ type: 'SET_DRAG_PREVIEW', preview: { extensionTargetId: targetId, angle: 0 } });

    const start = performance.now();
    const animate = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - start) / animationDurationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      dispatch({ type: 'SET_DRAG_PREVIEW', preview: { extensionTargetId: targetId, angle: angle * eased } });

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        dispatch({ type: 'COMMIT_EXTENSION_MOVE', targetId, angle });
        dispatch({ type: 'SET_ANIMATING', isAnimating: false });
      }
    };

    requestAnimationFrame(animate);
  };

  const onMove = (angle: TwistAngle) => {
    if (state.ui.interactionMode === 'cubie') {
      runExtensionRotation(state.puzzle.selectedExtension, angle);
    } else {
      runMove(state.puzzle.selectedFrame, angle);
    }
  };

  const selectAxis = (axisName: AxisName) => {
    const frameId = findFrameForAxis(
      axisName, state.puzzle.frames, state.puzzle.selectedFrame, state.puzzle.frameById, state.ui.frameScale,
    );
    if (frameId) dispatch({ type: 'SELECT_FRAME', frameId });
  };

  const cycleLayer = (direction: 1 | -1) => {
    const frameId = cycleLayerFrame(
      direction, state.puzzle.frames, state.puzzle.selectedFrame, state.puzzle.frameById, state.ui.frameScale,
    );
    if (frameId) dispatch({ type: 'SELECT_FRAME', frameId });
  };

  const setFrameScale = (scale: number) => {
    const frameId = findFrameAtScale(scale, state.puzzle.frames, state.puzzle.selectedFrame, state.puzzle.frameById);
    dispatch({ type: 'SET_FRAME_SCALE', scale });
    if (frameId) dispatch({ type: 'SELECT_FRAME', frameId });
  };

  const scramble = () => {
    if (state.puzzle.isAnimating) return;
    invalidateSolverState();
    const scrambleMoves = Array.from({ length: 14 }).map(() => {
      const frame = state.puzzle.frames[Math.floor(Math.random() * state.puzzle.frames.length)]!;
      return createMove(frame.id, randomAngle(), state.puzzle.frameById);
    });
    dispatch({ type: 'SCRAMBLE', moves: scrambleMoves });
  };

  const runSolver = async (): Promise<SolverRunResult> => {
    const result = await runAndRecordSolve(stateRef.current.puzzle);
    setSolverRun(result);
    setBenchmarkRecords(loadBenchmarkRecords());
    setStepMoves([]);
    setNextStepIndex(0);
    if (!result.success) {
      dispatch({ type: 'INVALID', message: result.notes });
    }
    return result;
  };

  const applySolverMoveWithPreview = async (move: SolverMove) => {
    const preview = previewForSolverMove(move);
    dispatch({ type: 'SET_ANIMATING', isAnimating: true });
    if (preview) {
      dispatch({ type: 'SET_DRAG_PREVIEW', preview: { ...preview, angle: 0 } });
      await delay(50);
      dispatch({ type: 'SET_DRAG_PREVIEW', preview });
      await delay(120);
    }
    dispatch({ type: 'APPLY_SOLVER_MOVE', move });
    dispatch({ type: 'SET_DRAG_PREVIEW', preview: null });
    dispatch({ type: 'SET_ANIMATING', isAnimating: false });
    await delay(40);
  };

  const solveInstant = () => {
    if (state.puzzle.isAnimating) return;
    void (async () => {
      const result = await runSolver();
      if (result.success) {
        dispatch({ type: 'APPLY_SOLVER_MOVES', moves: result.output_moves });
      }
    })();
  };

  const solveAnimated = async () => {
    if (state.puzzle.isAnimating) return;
    const result = await runSolver();
    if (result.success) {
      for (const move of result.output_moves) {
        await applySolverMoveWithPreview(move);
      }
    }
  };

  const prepareStepSolve = () => {
    if (state.puzzle.isAnimating) return;
    void (async () => {
      const result = await runSolver();
      if (result.success) {
        setStepMoves(result.output_moves);
        setNextStepIndex(0);
      }
    })();
  };

  const applyNextSolverStep = async () => {
    if (state.puzzle.isAnimating) return;
    const move = stepMoves[nextStepIndex];
    if (!move) return;
    await applySolverMoveWithPreview(move);
    setNextStepIndex((index) => index + 1);
  };

  const clearBenchmarks = () => {
    clearBenchmarkRecords();
    invalidateSolverState();
    setBenchmarkRecords([]);
  };

  const resetPuzzle = () => {
    invalidateSolverState();
    dispatch({ type: 'RESET_PUZZLE' });
  };

  const undoMove = () => {
    invalidateSolverState();
    dispatch({ type: 'UNDO' });
  };

  const redoMove = () => {
    invalidateSolverState();
    dispatch({ type: 'REDO' });
  };

  const setLevel = (level: number) => {
    invalidateSolverState();
    dispatch({ type: 'SET_LEVEL', level });
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
          if (state.ui.interactionMode === 'cubie') {
            const targetId = cycleExtensionTarget(
              command.direction,
              state.puzzle.turnTargets,
              state.puzzle.selectedExtension,
              state.ui.extensionDepth,
            );
            if (targetId) dispatch({ type: 'SELECT_EXTENSION', targetId });
            return;
          }
          const selected = state.puzzle.selectedFrame;
          const keyboardFrameOrder = state.puzzle.frames.map((frame) => frame.id);
          const currentIndex = selected ? keyboardFrameOrder.indexOf(selected) : -1;
          const nextIndex = (currentIndex + command.direction + keyboardFrameOrder.length) % keyboardFrameOrder.length;
          dispatch({ type: 'SELECT_FRAME', frameId: keyboardFrameOrder[nextIndex]! });
          return;
        }
        case 'rotate-selected':
          if (state.ui.interactionMode === 'cubie') {
            runExtensionRotation(state.puzzle.selectedExtension, command.angle);
          } else {
            runMove(state.puzzle.selectedFrame, command.angle);
          }
          return;
        case 'rotate-frame':
          dispatch({ type: 'SELECT_FRAME', frameId: command.frameId });
          runMove(command.frameId, command.angle);
          return;
        case 'undo':
          undoMove();
          return;
        case 'redo':
          redoMove();
          return;
        case 'reset':
          resetPuzzle();
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
        case 'select-axis':
          selectAxis(command.axisName);
          return;
        case 'cycle-layer':
          cycleLayer(command.direction);
          return;
        case 'change-scale': {
          if (state.ui.interactionMode === 'cubie') {
            const depths = extensionDepthsFromTargets(state.puzzle.turnTargets);
            const idx = depths.indexOf(state.ui.extensionDepth);
            const newIdx = Math.max(0, Math.min(depths.length - 1, idx + command.direction));
            if (newIdx !== idx) dispatch({ type: 'SET_EXTENSION_DEPTH', depth: depths[newIdx]! });
            return;
          }
          const available = availableScalesForLevel(state.puzzle.level);
          const idx = available.indexOf(state.ui.frameScale);
          const newIdx = Math.max(0, Math.min(available.length - 1, idx + command.direction));
          if (newIdx !== idx) setFrameScale(available[newIdx]!);
          return;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    state.puzzle.frames,
    state.puzzle.frameById,
    state.puzzle.isAnimating,
    state.puzzle.level,
    state.puzzle.selectedExtension,
    state.puzzle.selectedFrame,
    state.puzzle.turnTargetById,
    state.puzzle.turnTargets,
    state.ui.extensionDepth,
    state.ui.frameScale,
    state.ui.interactionMode,
  ]);

  const hoverPreviewCount = useMemo(() => {
    if (state.ui.interactionMode === 'cubie') {
      if (!state.puzzle.selectedExtension) return 0;
      return getAffectedTurnTargetCubieIds(
        state.puzzle.cubies,
        state.puzzle.selectedExtension,
        state.puzzle.turnTargetById,
      ).size;
    }
    const frame = state.ui.hoveredFrame ?? state.puzzle.selectedFrame;
    if (!frame) return 0;
    return getAffectedCubieIds(state.puzzle.cubies, frame, state.puzzle.frameById).size;
  }, [
    state.puzzle.cubies,
    state.puzzle.frameById,
    state.puzzle.selectedExtension,
    state.puzzle.selectedFrame,
    state.puzzle.turnTargetById,
    state.ui.hoveredFrame,
    state.ui.interactionMode,
  ]);

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

  const extensionTargets = useMemo(
    () => state.puzzle.turnTargets.filter((target) => target.kind === 'extension'),
    [state.puzzle.turnTargets],
  );
  const extensionTargetsAtCurrentDepth = useMemo(
    () => extensionTargetsAtDepth(extensionTargets, state.ui.extensionDepth),
    [extensionTargets, state.ui.extensionDepth],
  );
  const extensionDepths = useMemo(
    () => extensionDepthsFromTargets(state.puzzle.turnTargets),
    [state.puzzle.turnTargets],
  );
  const selectedExtensionTarget = state.puzzle.selectedExtension
    ? state.puzzle.turnTargetById.get(state.puzzle.selectedExtension) ?? null
    : null;
  const targetSummary = turnTargetSummaryForLevel(state.puzzle.level);
  const playableLevel = isPlayableLevel(state.puzzle.level);

  return (
    <div className="relative h-full w-full">
      {playableLevel ? (
        <Scene
          cubies={state.puzzle.cubies}
          level={state.puzzle.level}
          frames={state.puzzle.frames}
          frameById={state.puzzle.frameById}
          extensionTargets={extensionTargets}
          turnTargetById={state.puzzle.turnTargetById}
          frameScale={state.ui.frameScale}
          extensionDepth={state.ui.extensionDepth}
          selectedFrame={state.puzzle.selectedFrame}
          selectedCubie={state.puzzle.selectedCubie}
          selectedExtension={state.puzzle.selectedExtension}
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
          onSelectExtension={(targetId) => dispatch({ type: 'SELECT_EXTENSION', targetId })}
          onDragPreview={onGuideDrag}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-slate-950 px-4 text-slate-100 md:pl-[390px]">
          <div className="w-full max-w-3xl rounded-lg border border-slate-700 bg-slate-900/80 p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Research / Evaluation UI</p>
            <h1 className="mt-2 text-2xl font-bold">Level {state.puzzle.level} is outside direct human play.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Full manual rendering is disabled for this level. The same generalized target model is retained for solver
              planning, sequence replay, branching-factor measurement, and scoped visualization.
            </p>
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-md border border-slate-700 bg-slate-950/50 p-3">
                <p className="text-slate-400">Frame targets</p>
                <p className="mt-1 font-mono text-lg text-white">{targetSummary.frames.toLocaleString()}</p>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-950/50 p-3">
                <p className="text-slate-400">Extension targets</p>
                <p className="mt-1 font-mono text-lg text-white">{targetSummary.extensions.toLocaleString()}</p>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-950/50 p-3">
                <p className="text-slate-400">Total turn targets</p>
                <p className="mt-1 font-mono text-lg text-white">{targetSummary.total.toLocaleString()}</p>
              </div>
            </div>
            <div className="mt-4 text-xs leading-5 text-slate-400">
              Recommended next surface: solver-generated move list, scoped block inspector, replay controls, and
              performance metrics instead of direct target picking.
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 flex items-start justify-between gap-3 p-2 sm:p-4">
        <div className="pointer-events-auto flex flex-col items-start gap-2">
          <div className="flex gap-2">
            <button onClick={() => setControlsOpen((open) => !open)}>
              {controlsOpen ? 'Close controls' : 'Controls'}
            </button>
            <a
              href="/keyboard"
              className="rounded-md border border-slate-600 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-100 transition hover:bg-slate-700"
            >
              Keyboard
            </a>
          </div>
          {controlsOpen && (
            <ControlPanel
              selectedFrame={state.puzzle.selectedFrame}
              selectedExtensionTarget={selectedExtensionTarget}
              level={state.puzzle.level}
              interactionTier={state.puzzle.interactionTier}
              cubieCount={state.puzzle.cubies.length}
              frameCount={state.puzzle.frames.filter((f) => f.scale === state.ui.frameScale).length}
              targetSummary={targetSummary}
              isAnimating={state.puzzle.isAnimating}
              invalidFeedback={state.ui.invalidFeedback}
              interactionMode={state.ui.interactionMode}
              frameScale={state.ui.frameScale}
              extensionDepth={state.ui.extensionDepth}
              extensionDepths={extensionDepths}
              extensionTargetsAtDepthCount={extensionTargetsAtCurrentDepth.length}
              availableScales={availableScalesForLevel(state.puzzle.level)}
              frameById={state.puzzle.frameById}
              solverPanel={(
                <SolverPanel
                  lastRun={solverRun}
                  benchmarkRecords={benchmarkRecords}
                  preparedStepCount={stepMoves.length}
                  nextStepIndex={nextStepIndex}
                  disabled={!isSolverAvailableForLevel(state.puzzle.level) || state.puzzle.isAnimating}
                  onSolveInstant={solveInstant}
                  onSolveAnimated={solveAnimated}
                  onPrepareStep={prepareStepSolve}
                  onApplyStep={applyNextSolverStep}
                  onClearBenchmarks={clearBenchmarks}
                />
              )}
              onMove={onMove}
              onScramble={scramble}
              onReset={resetPuzzle}
              onUndo={undoMove}
              onRedo={redoMove}
              onToggleTransparent={() => dispatch({ type: 'TOGGLE_TRANSPARENCY' })}
              onToggleGuides={() => dispatch({ type: 'TOGGLE_GUIDES' })}
              onSetCameraPreset={requestCameraPreset}
              onSetLevel={setLevel}
              onSetFrameScale={setFrameScale}
              onSetExtensionDepth={(depth) => dispatch({ type: 'SET_EXTENSION_DEPTH', depth })}
              onCycleExtension={(direction) => {
                const targetId = cycleExtensionTarget(
                  direction,
                  state.puzzle.turnTargets,
                  state.puzzle.selectedExtension,
                  state.ui.extensionDepth,
                );
                if (targetId) dispatch({ type: 'SELECT_EXTENSION', targetId });
              }}
              onSelectAxis={selectAxis}
              onCycleLayer={cycleLayer}
            />
          )}
        </div>

        {playableLevel && <div className="pointer-events-auto flex flex-col items-end gap-2">
          <button onClick={() => setInfoOpen((open) => !open)}>
            {infoOpen ? 'Close info' : 'Info'}
          </button>
          {infoOpen && <div className="w-[min(280px,calc(100vw-1rem))] space-y-3">
          <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-300">
            <p className="mb-1 font-semibold text-slate-100">
              Interaction hints
              <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${state.ui.interactionMode === 'cubie' ? 'bg-amber-500/30 text-amber-300' : 'bg-sky-500/20 text-sky-300'}`}>
                {state.ui.interactionMode === 'cubie' ? 'EXTENSION MODE' : 'SLICE MODE'}
              </span>
            </p>
            <ul className="space-y-1">
              <li>• Tab: toggle Slice / Extension mode</li>
              {state.ui.interactionMode === 'slice' ? (
                <>
                  <li>• Tap cubie face: select frame (current scale ×{state.ui.frameScale})</li>
                  <li>• Drag highlighted cubies: preview and release to turn</li>
                  <li>• X/Y/Z: select axis &nbsp; [/]: prev/next layer</li>
                  {availableScalesForLevel(state.puzzle.level).length > 1 && (
                    <li>• -/=: thinner/thicker slices</li>
                  )}
                  <li>• A/D/S or J/L/K: rotate selected frame</li>
                  <li>• 1-9: quick select, Q/E: cycle frame</li>
                </>
              ) : (
                <>
                  <li>• Tap an edge block: select extension target</li>
                  <li>• -/=: D block / D.5 slab / deeper target</li>
                  <li>• Q/E: previous/next extension target</li>
                  <li>• A/D/S or J/L/K: rotate selected extension</li>
                </>
              )}
              <li>• Drag empty space: orbit view</li>
              <li>• Current target affects {hoverPreviewCount} cubies</li>
            </ul>
          </div>
          <MoveHistory moves={state.puzzle.moveHistory} />
          </div>}
        </div>}
      </div>
    </div>
  );
}

export default function App() {
  const route = window.location.pathname.replace(/\/+$/, '') || '/';
  return route === '/keyboard' ? <KeyboardGuide /> : <PlayApp />;
}

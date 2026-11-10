import { useEffect, useMemo, useReducer, useState } from 'react';
import Scene, { type CameraPreset } from './components/Scene';
import { Segmented, SettingsAction, SettingsLabel, SettingsMenu } from '@menger/theme';
import {
  createMove,
  getAffectedCubieIds,
  availableScalesForLevel,
  heavyRenderLevels,
  isPlayableLevel,
  supportedLevels,
  turnTargetSummaryForLevel,
  validateFrameRotation,
  validateTurnTargetRotation,
} from '@menger/engine';
import { createInitialState, puzzleReducer } from './state/puzzleState';
import { findKeyboardCommand, ignoresKeyboardControls } from './input/keyboardControls';
import { twistCommitAngle } from './input/twistGesture';
import { useIsDesktop } from './useIsDesktop';
import type { AxisName, FrameId, RotationFrame, TurnTarget, TwistAngle } from './types/puzzle';

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
const animationBusyMessage = 'Animation in progress. Please wait.';

const randomAngle = (): TwistAngle => {
  const values: TwistAngle[] = [90, -90, 180];
  return values[Math.floor(Math.random() * values.length)]!;
};

export default function PlayApp() {
  const [state, dispatch] = useReducer(puzzleReducer, undefined, createInitialState);
  const isDesktop = useIsDesktop();
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('reset');
  const [cameraPresetRequest, setCameraPresetRequest] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [demoSelectedCubies, setDemoSelectedCubies] = useState<Set<string>>(new Set());

  const isDemo = window.location.pathname === '/demo';

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
      dispatch({ type: 'INVALID', message: animationBusyMessage });
      return;
    }
    const selectedFrame = state.puzzle.frameById.get(frame);
    if (!selectedFrame) return;
    const legality = validateFrameRotation(state.puzzle.cubies, selectedFrame, angle);
    if (!legality.legal) {
      dispatch({ type: 'INVALID', message: legality.message });
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

  const runExtensionRotation = (targetId: string | null, angle: TwistAngle) => {
    if (!targetId) {
      dispatch({ type: 'INVALID', message: 'Select an extension target before rotating.' });
      return;
    }
    if (state.puzzle.isAnimating) {
      dispatch({ type: 'INVALID', message: animationBusyMessage });
      return;
    }

    const target = state.puzzle.turnTargetById.get(targetId);
    if (!target || target.kind !== 'extension') return;
    const legality = validateTurnTargetRotation(state.puzzle.cubies, target, angle);
    if (!legality.legal) {
      dispatch({ type: 'INVALID', message: legality.message });
      return;
    }

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
    const scrambleLength = [0, 20, 40, 60, 100, 150][state.puzzle.level] || 20 * state.puzzle.level;
    const scrambleMoves = Array.from({ length: scrambleLength }).map(() => {
      const frame = state.puzzle.frames[Math.floor(Math.random() * state.puzzle.frames.length)]!;
      return createMove(frame.id, randomAngle(), state.puzzle.frameById);
    });
    dispatch({ type: 'SCRAMBLE', moves: scrambleMoves });
  };

  const resetPuzzle = () => {
    dispatch({ type: 'RESET_PUZZLE' });
  };

  const undoMove = () => {
    dispatch({ type: 'UNDO' });
  };

  const redoMove = () => {
    dispatch({ type: 'REDO' });
  };

  const setLevel = (level: number) => {
    dispatch({ type: 'SET_LEVEL', level, allowHeavyRendering: isDesktop });
  };

  // The puzzle's cubies are generated once, at SET_LEVEL time, from whatever
  // `isDesktop` was then. Crossing the desktop threshold mid-session (a window
  // resize, or a trackpad attached to a tablet) has to rebuild the level that
  // depends on it, or Level 4 would either render an empty scene or keep
  // 160,000 cubies alive on a viewport that can no longer afford them.
  useEffect(() => {
    if (heavyRenderLevels.includes(state.puzzle.level as (typeof heavyRenderLevels)[number])) {
      dispatch({ type: 'SET_LEVEL', level: state.puzzle.level, allowHeavyRendering: isDesktop });
    }
    // Only the desktop flag should retrigger this; a level change already
    // dispatches SET_LEVEL with the current flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop]);

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

  const onGuideDrag = (frameId: FrameId, angle: number | null) => {
    dispatch({ type: 'SELECT_FRAME', frameId });
    if (angle === null) {
      const preview = state.ui.dragPreview;
      if (!preview || Math.abs(preview.angle) < twistCommitAngle) {
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
  const invalidFeedback = state.ui.invalidFeedback;
  useEffect(() => {
    if (!invalidFeedback || invalidFeedback === animationBusyMessage) return;
    setToast(invalidFeedback);
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [invalidFeedback]);

  const targetSummary = turnTargetSummaryForLevel(state.puzzle.level);
  const playableLevel = isPlayableLevel(state.puzzle.level, { allowHeavyRendering: isDesktop });

  return (
    <main className="min-h-full bg-slate-950 text-slate-100">
    <section className="relative h-screen w-full" aria-labelledby="game-title">
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
          isDemo={isDemo}
          demoSelectedCubies={demoSelectedCubies}
          onToggleDemoCubie={(cubieId) => {
            setDemoSelectedCubies((prev) => {
              const next = new Set(prev);
              if (next.has(cubieId)) next.delete(cubieId);
              else next.add(cubieId);
              return next;
            });
          }}
          onHoverFrame={(frame) => {
            const affected = frame ? getAffectedCubieIds(state.puzzle.cubies, frame, state.puzzle.frameById) : new Set<string>();
            dispatch({ type: 'SET_HOVER', frameId: frame, affectedIds: affected });
          }}
          onSelectFrame={(frameId) => dispatch({ type: 'SELECT_FRAME', frameId })}
          onSelectCubie={(cubieId) => dispatch({ type: 'SELECT_CUBIE', cubieId })}
          onSelectExtension={(targetId) => dispatch({ type: 'SELECT_EXTENSION', targetId })}
          onDragPreview={onGuideDrag}
          onClearSelection={() => {
            dispatch({ type: 'SELECT_FRAME', frameId: null });
            dispatch({ type: 'SELECT_EXTENSION', targetId: null });
            dispatch({ type: 'SELECT_CUBIE', cubieId: null });
            setDemoSelectedCubies(new Set());
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-slate-950 px-5 text-slate-100">
          <div className="w-full max-w-3xl rounded-3xl bg-slate-900 p-7">
            <p className="text-xs font-medium text-cyan-300">Research / Evaluation</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Level {state.puzzle.level} is outside direct human play.</h1>
            {heavyRenderLevels.includes(state.puzzle.level as (typeof heavyRenderLevels)[number]) && !isDesktop ? (
              <p className="mt-3 text-sm leading-6 text-amber-200">
                Level {state.puzzle.level} renders {(20 ** state.puzzle.level).toLocaleString()} cubies. That is a
                desktop-only view — open this page on a computer (precise pointer, window at least 1024px wide) to see
                the structure itself. The target model below is available on every device.
              </p>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Full manual rendering is disabled for this level. The same generalized target model is retained for solver
                planning, sequence replay, branching-factor measurement, and scoped visualization.
              </p>
            )}
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-950/60 p-4">
                <p className="text-slate-400">Frame targets</p>
                <p className="mt-1 text-xl font-semibold tracking-tight text-white">{targetSummary.frames.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl bg-slate-950/60 p-4">
                <p className="text-slate-400">Extension targets</p>
                <p className="mt-1 text-xl font-semibold tracking-tight text-white">{targetSummary.extensions.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl bg-slate-950/60 p-4">
                <p className="text-slate-400">Total turn targets</p>
                <p className="mt-1 text-xl font-semibold tracking-tight text-white">{targetSummary.total.toLocaleString()}</p>
              </div>
            </div>
            <div className="mt-4 text-xs leading-5 text-slate-400">
              Recommended next surface: solver-generated move list, scoped block inspector, replay controls, and
              performance metrics instead of direct target picking.
            </div>
          </div>
        </div>
      )}

      <header className="pointer-events-none absolute left-5 top-4 z-10 sm:left-7 sm:top-5">
        <h1 id="game-title" className="text-[15px] font-semibold tracking-tight text-slate-100">
          Menger Twist Cube
        </h1>
      </header>

      <div className="absolute right-3 top-3 z-10 sm:right-5 sm:top-4">
        <SettingsMenu>
          <div>
            <SettingsLabel>Level</SettingsLabel>
            <Segmented
              options={supportedLevels.map((level) => ({ id: level, label: String(level) }))}
              value={state.puzzle.level}
              onChange={setLevel}
              disabled={state.puzzle.isAnimating}
            />
          </div>
          <div className="-mx-2 grid grid-cols-2 gap-0.5">
            <SettingsAction onClick={undoMove}>Undo</SettingsAction>
            <SettingsAction onClick={redoMove}>Redo</SettingsAction>
            <SettingsAction onClick={scramble} disabled={!playableLevel}>Scramble</SettingsAction>
            <SettingsAction onClick={resetPuzzle}>Reset</SettingsAction>
          </div>
        </SettingsMenu>
      </div>

      <p
        role="status"
        aria-live="polite"
        className={`pointer-events-none absolute bottom-7 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-900/80 px-4 py-2 text-xs text-slate-200 ring-1 ring-slate-100/10 backdrop-blur-xl transition-opacity duration-300 ${toast ? 'opacity-100' : 'opacity-0'}`}
      >
        {toast ?? '\u00a0'}
      </p>
    </section>

    <article id="about" className="bg-slate-950 px-6 py-24 sm:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-10 lg:grid-cols-[1.35fr_.65fr]">
          <div>
            <p className="text-sm font-medium text-cyan-300">About the puzzle</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white">A twisty cube built from recursive geometry</h2>
            <p className="mt-5 text-base leading-7 text-slate-300">
              Menger Twist Cube is a free interactive 3D puzzle inspired by the Menger sponge, a classic fractal formed by
              repeatedly dividing a cube and removing its central sections. This browser game turns that mathematical idea
              into a playable twisty puzzle: select a slice or extension block, rotate it by 90 or 180 degrees, and discover
              how the structure changes across increasingly deep levels.
            </p>
            <p className="mt-4 text-base leading-7 text-slate-300">
              Start with Level 1 to learn the movement system, then move through Levels 2 and 3 for denser recursive targets.
              Level 4 renders its full 160,000-cubie structure on desktop; Level 5 exposes research and evaluation data
              for a structure too large to draw on any device. Every
              move follows the same geometry and collision rules used by the project&apos;s solver engine.
            </p>
          </div>
          <nav aria-label="Explore Menger Cube" className="rounded-3xl bg-slate-900 p-6">
            <h2 className="text-sm font-semibold text-slate-200">Explore</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li><a className="text-cyan-300 hover:text-cyan-200" href="#game-title">Play the 3D puzzle</a></li>
              <li><a className="text-cyan-300 hover:text-cyan-200" href="/keyboard">Read the keyboard guide</a></li>
              <li><a className="text-cyan-300 hover:text-cyan-200" href="/lab">Open the solver algorithm lab</a></li>
              <li><a className="text-cyan-300 hover:text-cyan-200" href="/octahedron">Try the octahedron puzzle</a></li>
            </ul>
            <p className="mt-5 text-xs leading-5 text-slate-400">
              Runs locally in a modern WebGL browser. No account, download, or installation is required.
            </p>
          </nav>
        </div>

        <section className="mt-24" aria-labelledby="how-to-play">
          <h2 id="how-to-play" className="text-3xl font-semibold tracking-tight text-white">How to play Menger Twist Cube</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl bg-slate-900 p-6">
              <p className="text-sm font-semibold text-cyan-300">1. Choose a target</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">Click a cubie face in Slice mode, or switch to Extension mode and select an edge block.</p>
            </div>
            <div className="rounded-3xl bg-slate-900 p-6">
              <p className="text-sm font-semibold text-cyan-300">2. Rotate the structure</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">Drag the highlighted target, or use A, S, and D for −90°, 180°, and +90° turns.</p>
            </div>
            <div className="rounded-3xl bg-slate-900 p-6">
              <p className="text-sm font-semibold text-cyan-300">3. Experiment freely</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">Scramble with G, undo with U, reset with Backspace, and orbit the camera by dragging empty space.</p>
            </div>
          </div>
        </section>

        <section className="mt-24 max-w-3xl" aria-labelledby="faq-title">
          <h2 id="faq-title" className="text-3xl font-semibold tracking-tight text-white">Frequently asked questions</h2>
          <div className="mt-6 space-y-6">
            <div>
              <h3 className="font-semibold text-slate-100">Is Menger Twist Cube free?</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">Yes. The interactive puzzle and solver lab are free to use in your browser, with no sign-up required.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-100">What is a Menger sponge?</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">A Menger sponge is a three-dimensional fractal created by recursively removing central sub-cubes. This puzzle borrows that recursive structure and adds legal twisty-puzzle rotations.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-100">Can the puzzle be solved automatically?</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">The separate <a className="text-cyan-300 hover:text-cyan-200" href="/lab">Solver Lab</a> runs registered algorithms, replays their moves in 3D, and compares seeded benchmark results.</p>
            </div>
          </div>
        </section>
      </div>
    </article>
    </main>
  );
}

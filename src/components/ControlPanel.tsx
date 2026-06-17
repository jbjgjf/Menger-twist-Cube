import type { AxisName, FrameId, InteractionMode, RotationFrame, TwistAngle } from '../types/puzzle';
import type { CameraPreset } from './Scene';
import { supportedLevels } from '../engine/levels';

interface Props {
  selectedFrame: FrameId | null;
  level: number;
  cubieCount: number;
  frameCount: number;
  isAnimating: boolean;
  invalidFeedback: string | null;
  interactionMode: InteractionMode;
  frameScale: number;
  availableScales: number[];
  frameById: Map<FrameId, RotationFrame>;
  onMove: (angle: TwistAngle) => void;
  onScramble: () => void;
  onReset: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleTransparent: () => void;
  onToggleGuides: () => void;
  onSetCameraPreset: (preset: CameraPreset) => void;
  onSetLevel: (level: number) => void;
  onSetFrameScale: (scale: number) => void;
  onSelectAxis: (axis: AxisName) => void;
  onCycleLayer: (direction: 1 | -1) => void;
}

export default function ControlPanel({
  selectedFrame,
  level,
  cubieCount,
  frameCount,
  isAnimating,
  invalidFeedback,
  interactionMode,
  frameScale,
  availableScales,
  frameById,
  onMove,
  onScramble,
  onReset,
  onUndo,
  onRedo,
  onToggleTransparent,
  onToggleGuides,
  onSetCameraPreset,
  onSetLevel,
  onSetFrameScale,
  onSelectAxis,
  onCycleLayer,
}: Props) {
  const currentFrame = selectedFrame ? frameById.get(selectedFrame) : null;
  const currentAxis = currentFrame?.axisName ?? null;
  const currentFrameLabel = currentFrame?.name ?? 'None';

  return (
    <div className="pointer-events-auto max-h-[calc(100vh-1rem)] w-[min(350px,calc(100vw-1rem))] space-y-3 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/75 p-3 shadow-2xl backdrop-blur-sm sm:max-h-[calc(100vh-2rem)] sm:p-4">
      <div>
        <h1 className="text-lg font-bold tracking-wide text-white sm:text-xl">Menger Twist Cube</h1>
        <p className="text-xs text-slate-400">Tap a face to pick a frame, drag to twist.</p>
      </div>

      <div className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-md border border-slate-700 bg-slate-950/40 p-2 text-xs text-slate-300">
        <span className="font-semibold text-slate-100">Level</span>
        <div className="grid grid-cols-4 gap-2">
          {supportedLevels.map((targetLevel) => (
            <button
              key={targetLevel}
              disabled={isAnimating || level === targetLevel}
              onClick={() => onSetLevel(targetLevel)}
              className={level === targetLevel ? 'border-cyan-400 bg-cyan-900/50 text-cyan-100' : undefined}
            >
              L{targetLevel}
            </button>
          ))}
        </div>
        <span className="text-slate-400">Size</span>
        <span className="font-mono text-slate-200">{cubieCount} cubies / {frameCount} frames</span>
      </div>

      {/* Frame Navigator */}
      {interactionMode === 'slice' ? (
        <div className="rounded-md border border-slate-700 bg-slate-950/40 p-2 text-xs text-slate-300">
          <p className="mb-2 font-semibold text-slate-100">Frame Navigator</p>

          {/* Axis selector */}
          <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Axis</p>
          <div className="mb-2 grid grid-cols-3 gap-1">
            {(['X', 'Y', 'Z'] as AxisName[]).map((axis) => (
              <button
                key={axis}
                onClick={() => onSelectAxis(axis)}
                className={currentAxis === axis ? 'border-cyan-400 bg-cyan-900/50 text-cyan-100' : ''}
              >
                {axis}
              </button>
            ))}
          </div>

          {/* Layer cycler */}
          <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Layer / Group</p>
          <div className="mb-2 grid grid-cols-[2rem_1fr_2rem] gap-1">
            <button onClick={() => onCycleLayer(-1)} className="text-base leading-none">‹</button>
            <div className="flex items-center justify-center rounded border border-slate-700 bg-slate-800/60 px-1 py-1.5 text-center font-mono text-sm text-cyan-300">
              {currentFrameLabel}
            </div>
            <button onClick={() => onCycleLayer(1)} className="text-base leading-none">›</button>
          </div>

          {/* Scale selector — only for L2+ */}
          {availableScales.length > 1 && (
            <>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Thickness ×layers</p>
              <div
                className="mb-2 grid gap-1"
                style={{ gridTemplateColumns: `repeat(${availableScales.length}, 1fr)` }}
              >
                {availableScales.map((s) => (
                  <button
                    key={s}
                    onClick={() => onSetFrameScale(s)}
                    className={frameScale === s ? 'border-cyan-400 bg-cyan-900/50 text-cyan-100' : ''}
                  >
                    ×{s}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Rotation buttons */}
          <div className="grid grid-cols-3 gap-1">
            <button disabled={isAnimating} onClick={() => onMove(-90)}>-90°</button>
            <button disabled={isAnimating} onClick={() => onMove(180)}>180°</button>
            <button disabled={isAnimating} onClick={() => onMove(90)}>+90°</button>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-slate-700 bg-slate-950/40 p-2 text-xs text-slate-300">
          <p className="mb-1 font-semibold text-slate-100">Cubie Rotation</p>
          <p className="mb-2 text-[10px] text-slate-400">Tap a non-corner cubie, then rotate it.</p>
          <div className="grid grid-cols-3 gap-1">
            <button disabled={isAnimating} onClick={() => onMove(-90)}>-90°</button>
            <button disabled={isAnimating} onClick={() => onMove(180)}>180°</button>
            <button disabled={isAnimating} onClick={() => onMove(90)}>+90°</button>
          </div>
        </div>
      )}

      <div className="hidden rounded-md border border-slate-700 bg-slate-950/40 p-2 text-xs text-slate-300 sm:block">
        <p className="mb-1 font-semibold text-slate-100">Keyboard</p>
        {interactionMode === 'slice' ? (
          <>
            <p>X/Y/Z: select axis &nbsp; [/]: prev/next layer</p>
            {availableScales.length > 1 && <p>-/=: thinner/thicker slices</p>}
            <p>A/D or J/L: rotate ±90° &nbsp; S/K: 180°</p>
            <p>1-9: quick select &nbsp; Q/E: cycle all frames</p>
            <p>Shift+1-9 / Alt+1-9: quick turn frame</p>
          </>
        ) : (
          <>
            <p>Tap non-corner cubie to select (gold outline)</p>
            <p>A/D: ±90° &nbsp; S: 180° &nbsp; Tab: back to slice mode</p>
          </>
        )}
        <p className="mt-1 text-slate-500">Tab: toggle Slice / Cubie mode</p>
      </div>

      {invalidFeedback && <div className="rounded-md border border-rose-700 bg-rose-900/40 p-2 text-xs">{invalidFeedback}</div>}

      <div className="grid grid-cols-2 gap-2">
        <button onClick={onScramble}>Scramble</button>
        <button onClick={onReset}>Reset</button>
        <button onClick={onUndo}>Undo</button>
        <button onClick={onRedo}>Redo</button>
        <button onClick={onToggleTransparent}>Toggle transparent</button>
        <button onClick={onToggleGuides}>Toggle frame guides</button>
      </div>

      <div className="hidden sm:block">
        <p className="mb-2 text-xs text-slate-300">Camera presets</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => onSetCameraPreset('reset')} className="col-span-2">Reset camera</button>
          <button onClick={() => onSetCameraPreset('up')}>Up (White)</button>
          <button onClick={() => onSetCameraPreset('down')}>Down (Yellow)</button>
          <button onClick={() => onSetCameraPreset('front')}>Front (Green)</button>
          <button onClick={() => onSetCameraPreset('back')}>Back (Blue)</button>
          <button onClick={() => onSetCameraPreset('right')}>Right (Red)</button>
          <button onClick={() => onSetCameraPreset('left')}>Left (Orange)</button>
        </div>
      </div>
    </div>
  );
}

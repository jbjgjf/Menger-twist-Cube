import type { FrameId, TwistAngle } from '../types/puzzle';
import type { CameraPreset } from './Scene';
import { supportedLevels } from '../engine/levels';

interface Props {
  selectedFrame: FrameId | null;
  level: number;
  cubieCount: number;
  frameCount: number;
  isAnimating: boolean;
  invalidFeedback: string | null;
  onMove: (angle: TwistAngle) => void;
  onScramble: () => void;
  onReset: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleTransparent: () => void;
  onToggleGuides: () => void;
  onSetCameraPreset: (preset: CameraPreset) => void;
  onSetLevel: (level: number) => void;
}

export default function ControlPanel({
  selectedFrame,
  level,
  cubieCount,
  frameCount,
  isAnimating,
  invalidFeedback,
  onMove,
  onScramble,
  onReset,
  onUndo,
  onRedo,
  onToggleTransparent,
  onToggleGuides,
  onSetCameraPreset,
  onSetLevel,
}: Props) {
  return (
    <div className="pointer-events-auto max-h-[calc(100vh-1rem)] w-[min(350px,calc(100vw-1rem))] space-y-3 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/75 p-3 shadow-2xl backdrop-blur-sm sm:max-h-[calc(100vh-2rem)] sm:p-4">
      <div>
        <h1 className="text-lg font-bold tracking-wide text-white sm:text-xl">Menger Twist Cube</h1>
        <p className="text-xs text-slate-400">Swipe the view, tap a frame, then drag the highlight to twist.</p>
      </div>

      <div className="rounded-md bg-slate-800/60 p-2 text-sm">
        Selected Frame:{' '}
        <span className="font-semibold text-cyan-300">{selectedFrame ?? 'None'}</span>
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

      <div className="hidden rounded-md border border-slate-700 bg-slate-950/40 p-2 text-xs text-slate-300 sm:block">
        <p className="mb-1 font-semibold text-slate-100">Touch / mouse</p>
        <p>Drag empty space to orbit. Tap a cubie face to highlight its slice.</p>
        <p>Drag the highlighted cubies to preview, then release for a quarter turn.</p>
        <p>1-9 quick-select the first slices; Q/E cycles every slice.</p>
      </div>

      {invalidFeedback && <div className="rounded-md border border-rose-700 bg-rose-900/40 p-2 text-xs">{invalidFeedback}</div>}

      <div className="hidden grid-cols-3 gap-2 sm:grid">
        <button disabled={isAnimating} onClick={() => onMove(90)}>
          +90
        </button>
        <button disabled={isAnimating} onClick={() => onMove(-90)}>
          -90
        </button>
        <button disabled={isAnimating} onClick={() => onMove(180)}>
          180
        </button>
      </div>

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

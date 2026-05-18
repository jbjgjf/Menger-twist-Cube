import type { FrameId, TwistAngle } from '../types/puzzle';
import type { CameraPreset } from './Scene';

interface Props {
  selectedFrame: FrameId | null;
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
}

export default function ControlPanel({
  selectedFrame,
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
}: Props) {
  return (
    <div className="pointer-events-auto w-[min(350px,calc(100vw-1rem))] space-y-3 rounded-xl border border-slate-700 bg-slate-900/75 p-3 shadow-2xl backdrop-blur-sm sm:p-4">
      <div>
        <h1 className="text-lg font-bold tracking-wide text-white sm:text-xl">Menger Twist Cube</h1>
        <p className="text-xs text-slate-400">Swipe the view, tap a frame, then drag the highlight to twist.</p>
      </div>

      <div className="rounded-md bg-slate-800/60 p-2 text-sm">
        Selected Frame:{' '}
        <span className="font-semibold text-cyan-300">{selectedFrame ?? 'None'}</span>
      </div>

      <div className="hidden rounded-md border border-slate-700 bg-slate-950/40 p-2 text-xs text-slate-300 sm:block">
        <p className="mb-1 font-semibold text-slate-100">Touch / mouse</p>
        <p>Drag empty space to orbit. Tap a cubie face to highlight its frame.</p>
        <p>Drag the highlighted cubies to preview, then release for a quarter turn.</p>
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

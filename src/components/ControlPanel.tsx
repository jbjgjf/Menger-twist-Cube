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
    <div className="pointer-events-auto w-[350px] space-y-3 rounded-xl border border-slate-700 bg-slate-900/75 p-4 shadow-2xl backdrop-blur-sm">
      <div>
        <h1 className="text-xl font-bold tracking-wide text-white">Menger Twist Cube</h1>
        <p className="text-xs text-slate-400">Unity-style 3D rotational puzzle prototype</p>
      </div>

      <div className="rounded-md bg-slate-800/60 p-2 text-sm">
        Selected Frame:{' '}
        <span className="font-semibold text-cyan-300">{selectedFrame ?? 'None'}</span>
      </div>

      <div className="rounded-md border border-slate-700 bg-slate-950/40 p-2 text-xs text-slate-300">
        <p className="mb-1 font-semibold text-slate-100">Keyboard</p>
        <p>1-9 select frames, Q/E cycle, A/D/S or J/L/K rotate.</p>
        <p>Shift+1-9 and Alt+1-9 quick-turn a frame directly.</p>
      </div>

      {invalidFeedback && <div className="rounded-md border border-rose-700 bg-rose-900/40 p-2 text-xs">{invalidFeedback}</div>}

      <div className="grid grid-cols-3 gap-2">
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

      <div>
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

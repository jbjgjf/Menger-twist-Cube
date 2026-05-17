import type { FrameId, TwistAngle } from '../types/puzzle';

export type KeyboardCommand =
  | { type: 'select-frame'; frameId: FrameId }
  | { type: 'cycle-frame'; direction: 1 | -1 }
  | { type: 'rotate-selected'; angle: TwistAngle }
  | { type: 'rotate-frame'; frameId: FrameId; angle: TwistAngle }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' }
  | { type: 'scramble' }
  | { type: 'toggle-transparent' }
  | { type: 'toggle-guides' }
  | { type: 'camera'; preset: 'reset' | 'front' | 'top' | 'side' };

export interface KeyboardBinding {
  code: string;
  label: string;
  description: string;
  command: KeyboardCommand;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
}

const frameOrder: FrameId[] = ['X_PLUS', 'X_MINUS', 'Y_PLUS', 'Y_MINUS', 'Z_PLUS', 'Z_MINUS', 'H_X', 'H_Y', 'H_Z'];

const numberFrameBindings: KeyboardBinding[] = frameOrder.map((frameId, index) => ({
  code: `Digit${index + 1}`,
  label: `${index + 1}`,
  description: `Select ${frameId}`,
  command: { type: 'select-frame', frameId },
}));

const quickTurnBindings: KeyboardBinding[] = frameOrder.flatMap((frameId, index) => [
  {
    code: `Digit${index + 1}`,
    label: `Shift+${index + 1}`,
    description: `Turn ${frameId} +90`,
    shiftKey: true,
    command: { type: 'rotate-frame', frameId, angle: 90 },
  },
  {
    code: `Digit${index + 1}`,
    label: `Alt+${index + 1}`,
    description: `Turn ${frameId} -90`,
    altKey: true,
    command: { type: 'rotate-frame', frameId, angle: -90 },
  },
]);

export const keyboardBindings: KeyboardBinding[] = [
  ...quickTurnBindings,
  ...numberFrameBindings,
  { code: 'KeyQ', label: 'Q', description: 'Previous frame', command: { type: 'cycle-frame', direction: -1 } },
  { code: 'KeyE', label: 'E', description: 'Next frame', command: { type: 'cycle-frame', direction: 1 } },
  { code: 'KeyA', label: 'A', description: 'Turn selected frame -90', command: { type: 'rotate-selected', angle: -90 } },
  { code: 'KeyD', label: 'D', description: 'Turn selected frame +90', command: { type: 'rotate-selected', angle: 90 } },
  { code: 'KeyS', label: 'S', description: 'Turn selected frame 180', command: { type: 'rotate-selected', angle: 180 } },
  { code: 'KeyJ', label: 'J', description: 'Turn selected frame -90', command: { type: 'rotate-selected', angle: -90 } },
  { code: 'KeyL', label: 'L', description: 'Turn selected frame +90', command: { type: 'rotate-selected', angle: 90 } },
  { code: 'KeyK', label: 'K', description: 'Turn selected frame 180', command: { type: 'rotate-selected', angle: 180 } },
  { code: 'KeyU', label: 'U', description: 'Undo', command: { type: 'undo' } },
  { code: 'KeyR', label: 'R', description: 'Redo', command: { type: 'redo' } },
  { code: 'Backspace', label: 'Backspace', description: 'Reset puzzle', command: { type: 'reset' } },
  { code: 'KeyG', label: 'G', description: 'Scramble', command: { type: 'scramble' } },
  { code: 'KeyT', label: 'T', description: 'Toggle transparent view', command: { type: 'toggle-transparent' } },
  { code: 'KeyF', label: 'F', description: 'Toggle frame guides', command: { type: 'toggle-guides' } },
  { code: 'KeyC', label: 'C', description: 'Reset camera', command: { type: 'camera', preset: 'reset' } },
  { code: 'KeyV', label: 'V', description: 'Front camera', command: { type: 'camera', preset: 'front' } },
  { code: 'KeyB', label: 'B', description: 'Top camera', command: { type: 'camera', preset: 'top' } },
  { code: 'KeyN', label: 'N', description: 'Side camera', command: { type: 'camera', preset: 'side' } },
];

export const keyboardFrameOrder = frameOrder;

export const findKeyboardCommand = (event: KeyboardEvent): KeyboardCommand | null => {
  const binding = keyboardBindings.find((candidate) => {
    const modifierMatches =
      Boolean(candidate.shiftKey) === event.shiftKey &&
      Boolean(candidate.altKey) === event.altKey &&
      Boolean(candidate.metaKey) === event.metaKey &&
      Boolean(candidate.ctrlKey) === event.ctrlKey;

    return candidate.code === event.code && modifierMatches;
  });

  return binding?.command ?? null;
};

export const ignoresKeyboardControls = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, button, [contenteditable="true"]'));
};

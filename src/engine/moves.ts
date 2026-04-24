import type { Cubie, FrameId, Move, TwistAngle } from '../types/puzzle';
import { frameById } from './frameDefinitions';
import { angleToNotation, rotatePosition, rotateQuaternion } from './geometry';

export const notationForMove = (frameId: FrameId, angle: TwistAngle): string => {
  const base = frameId
    .replace('PLUS', '+')
    .replace('MINUS', '-')
    .replace('X_', 'X')
    .replace('Y_', 'Y')
    .replace('Z_', 'Z')
    .replace('H_X', 'Hx')
    .replace('H_Y', 'Hy')
    .replace('H_Z', 'Hz');

  return `${base}${angleToNotation(angle)}`;
};

export const getAffectedCubieIds = (cubies: Cubie[], frameId: FrameId): Set<string> => {
  const frame = frameById.get(frameId);
  if (!frame) return new Set();

  const ids = cubies.filter((cubie) => frame.selector(cubie.currentPosition)).map((cubie) => cubie.id);
  return new Set(ids);
};

export const applyTwistToCubies = (cubies: Cubie[], frameId: FrameId, angle: TwistAngle): Cubie[] => {
  const frame = frameById.get(frameId);
  if (!frame) return cubies;

  return cubies.map((cubie) => {
    if (!frame.selector(cubie.currentPosition)) {
      return cubie;
    }

    return {
      ...cubie,
      currentPosition: rotatePosition(cubie.currentPosition, frame.axis, angle),
      orientation: rotateQuaternion(cubie.orientation, frame.axis, angle),
    };
  });
};

export const createMove = (frameId: FrameId, angle: TwistAngle): Move => ({
  frameId,
  angle,
  notation: notationForMove(frameId, angle),
  timestamp: Date.now(),
});

import type { Cubie, FrameId, Move, RotationFrame, TwistAngle } from '../types/puzzle';
import { angleToNotation, rotatePosition, rotateQuaternion } from './geometry';

export const notationForMove = (frame: RotationFrame | undefined, frameId: FrameId, angle: TwistAngle): string => {
  const base = frame?.name ?? frameId;

  return `${base}${angleToNotation(angle)}`;
};

export const getAffectedCubieIds = (
  cubies: Cubie[],
  frameId: FrameId,
  frameById: Map<FrameId, RotationFrame>,
): Set<string> => {
  const frame = frameById.get(frameId);
  if (!frame) return new Set();

  const ids = cubies.filter((cubie) => frame.selector(cubie.currentPosition)).map((cubie) => cubie.id);
  return new Set(ids);
};

export const applyTwistToCubies = (
  cubies: Cubie[],
  frameId: FrameId,
  angle: TwistAngle,
  frameById: Map<FrameId, RotationFrame>,
): Cubie[] => {
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

export const createMove = (
  frameId: FrameId,
  angle: TwistAngle,
  frameById: Map<FrameId, RotationFrame>,
): Move => ({
  frameId,
  angle,
  notation: notationForMove(frameById.get(frameId), frameId, angle),
  timestamp: Date.now(),
});

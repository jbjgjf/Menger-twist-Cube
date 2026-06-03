import type { Cubie, CubieType, FrameId, Move, RotationFrame, TwistAngle } from '../types/puzzle';
import type { Vector3Tuple } from 'three';
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

// Returns the axis perpendicular to both exposed faces for an edge cubie
export const cubieNaturalAxis = (position: Vector3Tuple): Vector3Tuple => {
  if (position[0] === 0) return [1, 0, 0];
  if (position[1] === 0) return [0, 1, 0];
  return [0, 0, 1];
};

export const isSelectableInCubieMode = (type: CubieType): boolean =>
  type !== 'corner' && type !== 'hole';

export const applyCubieRotation = (
  cubies: Cubie[],
  cubieId: string,
  axis: Vector3Tuple,
  angle: TwistAngle,
): Cubie[] =>
  cubies.map((cubie) => {
    if (cubie.id !== cubieId) return cubie;
    return { ...cubie, orientation: rotateQuaternion(cubie.orientation, axis, angle) };
  });

export const createCubieMove = (
  cubie: Cubie,
  axis: Vector3Tuple,
  angle: TwistAngle,
): Move => {
  const axisLabel = axis[0] ? 'X' : axis[1] ? 'Y' : 'Z';
  return {
    frameId: '',
    cubieId: cubie.id,
    cubieAxis: axis,
    angle,
    notation: `C(${cubie.currentPosition.join(',')})${axisLabel}${angleToNotation(angle)}`,
    timestamp: Date.now(),
  };
};

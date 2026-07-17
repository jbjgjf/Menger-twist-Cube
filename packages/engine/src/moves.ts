import type { Cubie, CubieType, FrameId, Move, RotationFrame, TurnTarget, TwistAngle } from './types';
import type { Vector3Tuple } from 'three';
import { angleToNotation, rotatePosition, rotatePositionAroundPivot, rotateQuaternion } from './geometry';
import { validateCubieRotation, validateFrameRotation, validateTurnTargetRotation } from './rotationLegality';

export const notationForMove = (frame: RotationFrame | undefined, frameId: FrameId, angle: TwistAngle): string => {
  const base = frame?.name ?? frameId;

  return `${base}${angleToNotation(angle)}`;
};

export const cloneCubies = (cubies: Cubie[]): Cubie[] =>
  cubies.map((cubie) => ({ ...cubie, orientation: cubie.orientation.clone() }));

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

export const getAffectedTurnTargetCubieIds = (
  cubies: Cubie[],
  targetId: string,
  targetById: Map<string, TurnTarget>,
): Set<string> => {
  const target = targetById.get(targetId);
  if (!target) return new Set();

  return new Set(cubies.filter((cubie) => target.selector(cubie.currentPosition)).map((cubie) => cubie.id));
};

export const applyTwistToCubies = (
  cubies: Cubie[],
  frameId: FrameId,
  angle: TwistAngle,
  frameById: Map<FrameId, RotationFrame>,
): Cubie[] => {
  const frame = frameById.get(frameId);
  if (!frame) return cubies;
  if (!validateFrameRotation(cubies, frame, angle).legal) return cubies;

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
  targetId: `frame:${frameId}`,
  targetKind: 'frame',
  angle,
  notation: notationForMove(frameById.get(frameId), frameId, angle),
  timestamp: Date.now(),
});

// Returns the axis perpendicular to both exposed faces for an edge cubie.
// At any level the edge axis is the component with the smallest magnitude:
// the other two coordinates are pinned to the outer faces (|value| = extent).
export const cubieNaturalAxis = (position: Vector3Tuple): Vector3Tuple => {
  const absX = Math.abs(position[0]);
  const absY = Math.abs(position[1]);
  const absZ = Math.abs(position[2]);
  if (absX <= absY && absX <= absZ) return [1, 0, 0];
  if (absY <= absZ) return [0, 1, 0];
  return [0, 0, 1];
};

export const isSelectableInCubieMode = (type: CubieType): boolean =>
  type !== 'corner' && type !== 'hole';

export const applyCubieRotation = (
  cubies: Cubie[],
  cubieId: string,
  axis: Vector3Tuple,
  angle: TwistAngle,
): Cubie[] => {
  if (!validateCubieRotation(cubies, cubieId, axis, angle).legal) return cubies;
  return cubies.map((cubie) => {
    if (cubie.id !== cubieId) return cubie;
    return { ...cubie, orientation: rotateQuaternion(cubie.orientation, axis, angle) };
  });
};

export const applyExtensionRotation = (
  cubies: Cubie[],
  targetId: string,
  angle: TwistAngle,
  targetById: Map<string, TurnTarget>,
): Cubie[] => {
  const target = targetById.get(targetId);
  if (!target || target.kind !== 'extension') return cubies;
  if (!validateTurnTargetRotation(cubies, target, angle).legal) return cubies;

  return cubies.map((cubie) => {
    if (!target.selector(cubie.currentPosition)) return cubie;
    return {
      ...cubie,
      currentPosition: rotatePositionAroundPivot(cubie.currentPosition, target.axis, angle, target.pivot),
      orientation: rotateQuaternion(cubie.orientation, target.axis, angle),
    };
  });
};

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

export const createExtensionMove = (
  target: TurnTarget,
  angle: TwistAngle,
): Move => ({
  frameId: '',
  targetId: target.id,
  targetKind: 'extension',
  extensionTargetId: target.id,
  angle,
  notation: `${target.name}${angleToNotation(angle)}`,
  timestamp: Date.now(),
});

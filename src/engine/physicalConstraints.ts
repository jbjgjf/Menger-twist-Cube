import type { Cubie, RotationFrame, TurnTarget, TwistAngle } from '../types/puzzle';
import type { Vector3Tuple } from 'three';
import { rotatePosition, rotatePositionAroundPivot, toKey } from './geometry';

const staticPositionSet = (
  cubies: Cubie[],
  selector: (pos: Vector3Tuple) => boolean,
): Set<string> => {
  const positions = new Set<string>();
  for (const cubie of cubies) {
    if (!selector(cubie.currentPosition)) {
      positions.add(toKey(cubie.currentPosition));
    }
  }
  return positions;
};

export const isFrameRotationBlocked = (
  cubies: Cubie[],
  frame: RotationFrame,
  angle: TwistAngle,
): boolean => {
  const statics = staticPositionSet(cubies, frame.selector);
  for (const cubie of cubies) {
    if (!frame.selector(cubie.currentPosition)) continue;
    const newPos = rotatePosition(cubie.currentPosition, frame.axis, angle);
    if (statics.has(toKey(newPos))) return true;
  }
  return false;
};

export const isExtensionRotationBlocked = (
  cubies: Cubie[],
  target: TurnTarget,
  angle: TwistAngle,
): boolean => {
  const statics = staticPositionSet(cubies, target.selector);
  for (const cubie of cubies) {
    if (!target.selector(cubie.currentPosition)) continue;
    const newPos = rotatePositionAroundPivot(cubie.currentPosition, target.axis, angle, target.pivot);
    if (statics.has(toKey(newPos))) return true;
  }
  return false;
};

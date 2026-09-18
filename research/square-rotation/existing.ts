/**
 * The existing move set, described as *actions* so that additional candidates
 * can be compared against it on two independent notions of sameness:
 *
 * - `supportKey`   — same selected cells, axis, pivot and angle.
 * - `actionKey`    — same map on every cell's position and orientation. Two
 *                    operations with different ids, axes or pivots can still
 *                    have the same action, and that is the notion that matters
 *                    for "is this really a new operation".
 *
 * `state.turnTargets` already contains the frame family (`frame:*`, pivot on the
 * axis through the layer centre) and the recursive extension/slab family, which
 * is the whole of the shipped candidate set; legality is asked of the engine.
 */
import { rotatePositionAroundPivot, validateTurnTargetRotation } from '../../packages/engine/src/index';
import type { Cubie, MengerPuzzleState, TurnTarget, TwistAngle } from '../../packages/engine/src/index';
import type { Vector3Tuple } from 'three';
import { allAngles, cellKey } from './model';

/** Integer rotation matrix for a quarter/half turn about a unit axis. */
export const rotationMatrix = (axis: Vector3Tuple, angle: TwistAngle): number[] => {
  const radians = (angle * Math.PI) / 180;
  const cosine = Math.round(Math.cos(radians));
  const sine = Math.round(Math.sin(radians));
  const [x, y, z] = axis;
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const cross = [0, -z, y, z, 0, -x, -y, x, 0];
  const outer = [x * x, x * y, x * z, y * x, y * y, y * z, z * x, z * y, z * z];
  return identity.map((value, index) => cosine * value + sine * cross[index]! + (1 - cosine) * outer[index]!);
};

export interface Operation {
  /** `frame:*` / `extension:*` for shipped moves, `region:*` / `subset:*` for audit candidates. */
  id: string;
  origin: 'existing' | 'additional';
  angle: TwistAngle;
  axis: Vector3Tuple;
  pivot: Vector3Tuple;
  support: Vector3Tuple[];
  supportKey: string;
  actionKey: string;
  /** `from -> to` for every cell the operation moves or twists. */
  map: Array<[string, string]>;
}

export const buildOperation = (
  id: string,
  origin: Operation['origin'],
  axis: Vector3Tuple,
  pivot: Vector3Tuple,
  angle: TwistAngle,
  support: Vector3Tuple[],
): Operation => {
  const map: Array<[string, string]> = support.map((cell) => [
    cellKey(cell),
    cellKey(rotatePositionAroundPivot(cell, axis, angle, pivot)),
  ]);
  const sortedMap = [...map].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const matrix = rotationMatrix(axis, angle).join(',');
  return {
    id,
    origin,
    angle,
    axis,
    pivot,
    support,
    supportKey: `${axis.join(',')}|${pivot.join(',')}|${angle}|${support.map(cellKey).sort().join(';')}`,
    actionKey: `${matrix}|${sortedMap.map(([from, to]) => `${from}>${to}`).join(';')}`,
    map,
  };
};

export const supportOf = (cubies: Cubie[], target: TurnTarget): Vector3Tuple[] =>
  cubies.filter((cubie) => target.selector(cubie.currentPosition)).map((cubie) => cubie.currentPosition);

/** Every legal (existing target, angle) pair, as an action. */
export const existingLegalOperations = (state: MengerPuzzleState): Operation[] => {
  const operations: Operation[] = [];
  for (const target of state.turnTargets) {
    const support = supportOf(state.cubies, target);
    if (support.length === 0) continue;
    for (const angle of allAngles) {
      if (!validateTurnTargetRotation(state.cubies, target, angle).legal) continue;
      operations.push(buildOperation(target.id, 'existing', target.axis, target.pivot, angle, support));
    }
  }
  return operations;
};

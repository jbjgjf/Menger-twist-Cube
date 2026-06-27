import { Matrix4, Quaternion as ThreeQuaternion, Vector3 } from 'three';
import type { Cubie } from '@menger/engine';
import { cubieNaturalAxis, rotateQuaternion } from '@menger/engine';
import type { SolverProgress } from '../algorithm/types';

const solvedOrientationKey = '100|010|001';
const extensionAngles = [0, 90, 180, -90] as const;

const roundAxisComponent = (value: number): -1 | 0 | 1 => {
  if (value > 0.5) return 1;
  if (value < -0.5) return -1;
  return 0;
};

export const vectorKey = ([x, y, z]: readonly [number, number, number]): string => `${x},${y},${z}`;

export const samePosition = (
  a: [number, number, number],
  b: [number, number, number],
): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

export const orientationKey = (quaternion: ThreeQuaternion): string => {
  const matrix = new Matrix4().makeRotationFromQuaternion(quaternion);
  return [
    new Vector3(1, 0, 0).applyMatrix4(matrix),
    new Vector3(0, 1, 0).applyMatrix4(matrix),
    new Vector3(0, 0, 1).applyMatrix4(matrix),
  ].map((axis) => `${roundAxisComponent(axis.x)}${roundAxisComponent(axis.y)}${roundAxisComponent(axis.z)}`).join('|');
};

export const isOrientationSolved = (cubie: Cubie): boolean =>
  orientationKey(cubie.orientation) === solvedOrientationKey;

export const edgeFrameOrientationKey = (cubie: Cubie): string => {
  const axis = cubieNaturalAxis(cubie.currentPosition);
  return extensionAngles
    .map((angle) => orientationKey(rotateQuaternion(cubie.orientation, axis, angle)))
    .sort()[0]!;
};

export const solvedEdgeFrameOrientationKey = (cubie: Cubie): string => {
  const axis = cubieNaturalAxis(cubie.homePosition);
  const identity = new ThreeQuaternion();
  return extensionAngles
    .map((angle) => orientationKey(rotateQuaternion(identity, axis, angle)))
    .sort()[0]!;
};

export const isFrameSolvedCubie = (cubie: Cubie): boolean => {
  if (!samePosition(cubie.currentPosition, cubie.homePosition)) return false;
  if (cubie.type === 'edge') {
    return edgeFrameOrientationKey(cubie) === solvedEdgeFrameOrientationKey(cubie);
  }
  return isOrientationSolved(cubie);
};

export const isExactlySolvedCubie = (cubie: Cubie): boolean =>
  samePosition(cubie.currentPosition, cubie.homePosition) && isOrientationSolved(cubie);

export const isFrameSolved = (cubies: Cubie[]): boolean =>
  cubies.every(isFrameSolvedCubie);

export const isExactlySolved = (cubies: Cubie[]): boolean =>
  cubies.every(isExactlySolvedCubie);

export const stateKey = (cubies: Cubie[], ignoreEdgeExtensionRoll: boolean): string =>
  [...cubies]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((cubie) => {
      const orientation = ignoreEdgeExtensionRoll && cubie.type === 'edge'
        ? edgeFrameOrientationKey(cubie)
        : orientationKey(cubie.orientation);
      return `${cubie.id}@${vectorKey(cubie.currentPosition)}#${orientation}`;
    })
    .join(';');

export const progressForCubies = (cubies: Cubie[]): SolverProgress => {
  const corners = cubies.filter((cubie) => cubie.type === 'corner');
  const edges = cubies.filter((cubie) => cubie.type === 'edge');

  return {
    solvedCubies: cubies.filter(isExactlySolvedCubie).length,
    positionSolved: cubies.filter((cubie) => samePosition(cubie.currentPosition, cubie.homePosition)).length,
    cornerOrientationSolved: corners.filter(isOrientationSolved).length,
    edgeFrameSolved: edges.filter(isFrameSolvedCubie).length,
    extensionSolved: edges.filter(isExactlySolvedCubie).length,
    totalCubies: cubies.length,
    totalCorners: corners.length,
    totalEdges: edges.length,
  };
};

export const progressSummary = (progress: SolverProgress): string =>
  `${progress.solvedCubies}/${progress.totalCubies} cubies solved, ` +
  `${progress.positionSolved}/${progress.totalCubies} positions home, ` +
  `${progress.edgeFrameSolved}/${progress.totalEdges} edge frame targets aligned`;

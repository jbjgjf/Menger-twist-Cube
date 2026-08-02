import { Quaternion as ThreeQuaternion, Vector3 } from 'three';
import type { Vector3Tuple } from 'three';

/**
 * The 24 orientation-preserving rotations of a cube, as exact integer
 * matrices paired with the quaternion a `Cubie.orientation` carries.
 *
 * Every block-quotient solver needs this table: to recognize that a block
 * region is a rigid copy of a home block it has to search the 24 rotations
 * for one that maps home offsets onto current offsets, and to build the
 * macro cubie it needs that rotation as a quaternion. The table is identical
 * at every level, so it lives here instead of being re-derived per solver.
 */
export interface BlockRotation {
  matrix: readonly number[]; // row-major 3x3
  quaternion: ThreeQuaternion;
}

const identityMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;

const rotationGenerators: ReadonlyArray<{ axis: Vector3Tuple; matrix: readonly number[] }> = [
  { axis: [1, 0, 0], matrix: [1, 0, 0, 0, 0, -1, 0, 1, 0] },
  { axis: [0, 1, 0], matrix: [0, 0, 1, 0, 1, 0, -1, 0, 0] },
  { axis: [0, 0, 1], matrix: [0, -1, 0, 1, 0, 0, 0, 0, 1] },
];

export const multiplyMatrices = (a: readonly number[], b: readonly number[]): number[] => {
  const result = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      for (let inner = 0; inner < 3; inner += 1) {
        result[row * 3 + col]! += a[row * 3 + inner]! * b[inner * 3 + col]!;
      }
    }
  }
  return result;
};

export const applyMatrixToVector = (m: readonly number[], v: Vector3Tuple): Vector3Tuple => [
  m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2],
  m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2],
  m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2],
];

export const matrixKey = (m: readonly number[]): string => m.join(',');

const quarterTurnQuaternion = (axis: Vector3Tuple): ThreeQuaternion =>
  new ThreeQuaternion().setFromAxisAngle(new Vector3(axis[0], axis[1], axis[2]), Math.PI / 2);

export const allBlockRotations: readonly BlockRotation[] = (() => {
  const identity: BlockRotation = { matrix: identityMatrix, quaternion: new ThreeQuaternion() };
  const found = new Map<string, BlockRotation>([[matrixKey(identityMatrix), identity]]);
  const queue: BlockRotation[] = [identity];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const generator of rotationGenerators) {
      const matrix = multiplyMatrices(generator.matrix, current.matrix);
      const key = matrixKey(matrix);
      if (found.has(key)) continue;
      const rotation: BlockRotation = {
        matrix,
        quaternion: current.quaternion.clone().premultiply(quarterTurnQuaternion(generator.axis)),
      };
      found.set(key, rotation);
      queue.push(rotation);
    }
  }

  return [...found.values()];
})();

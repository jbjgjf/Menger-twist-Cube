import type { Euler, Quaternion, Vector3Tuple } from 'three';
import { Quaternion as ThreeQuaternion, Vector3 } from 'three';

const epsilon = 1e-4;

export const toKey = (pos: Vector3Tuple): string => pos.map((value) => value.toFixed(3)).join(':');

export const roundToGrid = (value: number): number => {
  if (Math.abs(value) < epsilon) return 0;
  if (Math.abs(value - 1) < epsilon) return 1;
  if (Math.abs(value + 1) < epsilon) return -1;
  return Math.round(value * 1000) / 1000;
};

export const rotatePosition = (
  position: Vector3Tuple,
  axis: Vector3Tuple,
  angleDeg: number,
): Vector3Tuple => {
  const vector = new Vector3(position[0], position[1], position[2]);
  const axisVector = new Vector3(axis[0], axis[1], axis[2]).normalize();
  vector.applyAxisAngle(axisVector, (angleDeg * Math.PI) / 180);
  return [roundToGrid(vector.x), roundToGrid(vector.y), roundToGrid(vector.z)];
};

export const rotateQuaternion = (quaternion: Quaternion, axis: Vector3Tuple, angleDeg: number): Quaternion => {
  const axisVector = new Vector3(axis[0], axis[1], axis[2]).normalize();
  const delta = new ThreeQuaternion().setFromAxisAngle(axisVector, (angleDeg * Math.PI) / 180);
  return quaternion.clone().premultiply(delta);
};

export const angleToNotation = (angle: number): string => {
  if (angle === 180) return '2';
  if (angle === -90) return "'";
  return '';
};

export const eulerToQuaternion = (euler: Euler): Quaternion => new ThreeQuaternion().setFromEuler(euler);

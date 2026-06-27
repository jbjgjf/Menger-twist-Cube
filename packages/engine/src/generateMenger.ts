import { Quaternion } from 'three';
import type { Vector3Tuple } from 'three';
import type { Cubie, CubieType } from './types';
import { normalizePuzzleLevel } from './levels';

export interface PuzzleConfig {
  level: number;
  gridSize: number;
  extent: number;
  coordinates: number[];
}

export const createPuzzleConfig = (level: number): PuzzleConfig => {
  const safeLevel = normalizePuzzleLevel(level);
  const gridSize = 3 ** safeLevel;
  const extent = (gridSize - 1) / 2;
  const coordinates = Array.from({ length: gridSize }, (_, index) => index - extent);
  return { level: safeLevel, gridSize, extent, coordinates };
};

const isRemovedAtScale = (x: number, y: number, z: number, scale: number, extent: number): boolean => {
  const toDigit = (value: number) => Math.floor((value + extent) / scale) % 3;
  const middleDigits = [toDigit(x), toDigit(y), toDigit(z)].filter((digit) => digit === 1).length;
  return middleDigits >= 2;
};

export const isMengerCell = ([x, y, z]: Vector3Tuple, config: PuzzleConfig): boolean => {
  for (let scale = 1; scale < config.gridSize; scale *= 3) {
    if (isRemovedAtScale(x, y, z, scale, config.extent)) return false;
  }
  return true;
};

const classifyType = (position: Vector3Tuple, config: PuzzleConfig): CubieType => {
  const exposedFaces = position.filter((value) => Math.abs(value) === config.extent).length;
  if (exposedFaces >= 3) return 'corner';
  if (exposedFaces === 2) return 'edge';
  if (exposedFaces === 1) return 'outer';
  return 'innerWall';
};

export const generateMenger = (level: number): Cubie[] => {
  const config = createPuzzleConfig(level);
  const cubies: Cubie[] = [];

  for (const x of config.coordinates) {
    for (const y of config.coordinates) {
      for (const z of config.coordinates) {
        const position: Vector3Tuple = [x, y, z];
        if (!isMengerCell(position, config)) continue;

        cubies.push({
          id: `L${config.level}_${x}_${y}_${z}`,
          homePosition: position,
          currentPosition: position,
          orientation: new Quaternion(),
          type: classifyType(position, config),
        });
      }
    }
  }

  return cubies;
};

export const generateMengerLevel1 = (): Cubie[] => generateMenger(1);

import { Quaternion } from 'three';
import type { Cubie, CubieType } from '../types/puzzle';

const classifyType = ([x, y, z]: [number, number, number]): CubieType => {
  const absSum = Math.abs(x) + Math.abs(y) + Math.abs(z);
  const zeros = [x, y, z].filter((value) => value === 0).length;

  if (absSum === 3) return 'corner';
  if (zeros === 1) return 'edge';
  if (zeros === 2) return 'innerWall';
  if (zeros === 1 && absSum === 1) return 'hole';
  return 'outer';
};

export const generateMengerLevel1 = (): Cubie[] => {
  const cubies: Cubie[] = [];

  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        const zeroCount = [x, y, z].filter((v) => v === 0).length;
        if (zeroCount >= 2) {
          continue;
        }

        const position: [number, number, number] = [x, y, z];
        cubies.push({
          id: `cubie_${x}_${y}_${z}`,
          homePosition: position,
          currentPosition: position,
          orientation: new Quaternion(),
          type: classifyType(position),
        });
      }
    }
  }

  return cubies;
};

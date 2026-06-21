import type { AxisName, RotationFrame, TurnTarget } from '../types/puzzle';
import type { Vector3Tuple } from 'three';
import { createPuzzleConfig, isMengerCell } from './generateMenger';
import { frameTargetCountForLevel, extensionTargetCountForLevel } from './levels';

const axisNames = ['X', 'Y', 'Z'] as const;
const axisVectors: Record<AxisName, Vector3Tuple> = {
  X: [1, 0, 0],
  Y: [0, 1, 0],
  Z: [0, 0, 1],
};

const childSlots = (() => {
  const slots: Array<{ digits: Vector3Tuple; axisName: AxisName }> = [];
  for (const x of [0, 1, 2]) {
    for (const y of [0, 1, 2]) {
      for (const z of [0, 1, 2]) {
        const digits = [x, y, z] as Vector3Tuple;
        const middleIndex = digits.findIndex((digit) => digit === 1);
        if (middleIndex === -1) continue;
        const middleCount = digits.filter((digit) => digit === 1).length;
        if (middleCount !== 1) continue;
        const edgeCount = digits.filter((digit) => digit !== 1).length;
        if (edgeCount !== 2) continue;
        slots.push({ digits, axisName: axisNames[middleIndex]! });
      }
    }
  }
  return slots;
})();

const selectorForIndexRange = (
  minIndex: Vector3Tuple,
  scale: number,
  extent: number,
): ((position: Vector3Tuple) => boolean) =>
  (position) => {
    for (let axis = 0; axis < 3; axis += 1) {
      const index = position[axis]! + extent;
      if (index < minIndex[axis]! || index >= minIndex[axis]! + scale) return false;
    }
    return true;
  };

const centerForIndexRange = (minIndex: Vector3Tuple, scale: number, extent: number): Vector3Tuple => [
  minIndex[0] + (scale - 1) / 2 - extent,
  minIndex[1] + (scale - 1) / 2 - extent,
  minIndex[2] + (scale - 1) / 2 - extent,
];

const countCellsInBlock = (scale: number): number => {
  if (scale === 1) return 1;
  return 20 ** Math.round(Math.log(scale) / Math.log(3));
};

export const frameToTurnTarget = (frame: RotationFrame): TurnTarget => ({
  id: `frame:${frame.id}`,
  kind: 'frame',
  name: frame.name,
  axisName: frame.axisName,
  axis: frame.axis,
  scale: frame.scale,
  depth: 0,
  pivot: [frame.axis[0] * frame.layer, frame.axis[1] * frame.layer, frame.axis[2] * frame.layer],
  selector: frame.selector,
  affectedCountEstimate: frame.scale,
});

export const generateExtensionTurnTargets = (level: number): TurnTarget[] => {
  const config = createPuzzleConfig(level);
  const targets: TurnTarget[] = [];

  const visitParent = (parentMin: Vector3Tuple, parentScale: number, path: string[]) => {
    if (parentScale < 3) return;

    const childScale = parentScale / 3;
    const depth = level - Math.round(Math.log(childScale) / Math.log(3));

    for (const slot of childSlots) {
      const childMin = [
        parentMin[0] + slot.digits[0] * childScale,
        parentMin[1] + slot.digits[1] * childScale,
        parentMin[2] + slot.digits[2] * childScale,
      ] as Vector3Tuple;
      const center = centerForIndexRange(childMin, childScale, config.extent);
      const slotKey = slot.digits.join('');

      targets.push({
        id: `extension:d${depth}:p${path.join('.') || 'root'}:s${slotKey}`,
        kind: 'extension',
        name: `E${depth}:${slotKey}`,
        axisName: slot.axisName,
        axis: axisVectors[slot.axisName],
        scale: childScale,
        depth,
        pivot: center,
        selector: selectorForIndexRange(childMin, childScale, config.extent),
        affectedCountEstimate: countCellsInBlock(childScale),
      });
    }

    for (const x of [0, 1, 2]) {
      for (const y of [0, 1, 2]) {
        for (const z of [0, 1, 2]) {
          const childMin = [
            parentMin[0] + x * childScale,
            parentMin[1] + y * childScale,
            parentMin[2] + z * childScale,
          ] as Vector3Tuple;
          const childCenter = centerForIndexRange(childMin, childScale, config.extent);
          if (!isMengerCell(childCenter, config)) continue;
          visitParent(childMin, childScale, [...path, `${x}${y}${z}`]);
        }
      }
    }
  };

  visitParent([0, 0, 0], config.gridSize, []);
  return targets;
};

export const generateTurnTargets = (
  level: number,
  frames: RotationFrame[],
  includeExtensions: boolean,
): TurnTarget[] => [
  ...frames.map(frameToTurnTarget),
  ...(includeExtensions ? generateExtensionTurnTargets(level) : []),
];

export const createTurnTargetMap = (targets: TurnTarget[]): Map<string, TurnTarget> =>
  new Map(targets.map((target) => [target.id, target]));

export const turnTargetSummaryForLevel = (level: number) => ({
  frames: frameTargetCountForLevel(level),
  extensions: extensionTargetCountForLevel(level),
  total: frameTargetCountForLevel(level) + extensionTargetCountForLevel(level),
});

import type { AxisName, FrameId, RotationFrame } from '../types/puzzle';
import { createPuzzleConfig } from './generateMenger';

const axisVector = {
  X: [1, 0, 0],
  Y: [0, 1, 0],
  Z: [0, 0, 1],
} as const;

const axisIndex: Record<AxisName, 0 | 1 | 2> = { X: 0, Y: 1, Z: 2 };
const axisColor: Record<AxisName, string> = { X: '#fb7185', Y: '#38bdf8', Z: '#4ade80' };

const layerLabel = (layer: number): string => {
  if (layer > 0) return `+${layer}`;
  return `${layer}`;
};

const frameId = (axisName: AxisName, layer: number): FrameId => `${axisName}_${layerLabel(layer)}`;

export const generateRotationFrames = (level: number): RotationFrame[] => {
  const config = createPuzzleConfig(level);
  const radius = (config.gridSize / 2) * 0.96;

  return (['X', 'Y', 'Z'] as AxisName[]).flatMap((axisName) => {
    const index = axisIndex[axisName];
    return config.coordinates.map((layer) => ({
      id: frameId(axisName, layer),
      name: `${axisName}${layerLabel(layer)}`,
      axisName,
      axis: [...axisVector[axisName]],
      layer,
      extent: config.extent,
      kind: 'slice' as const,
      selector: (position) => position[index] === layer,
      color: axisColor[axisName],
      radius,
    }));
  });
};

export const createFrameMap = (frames: RotationFrame[]): Map<FrameId, RotationFrame> =>
  new Map(frames.map((frame) => [frame.id, frame]));

export const frames = generateRotationFrames(1);
export const frameById = createFrameMap(frames);

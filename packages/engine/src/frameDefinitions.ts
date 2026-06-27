import type { AxisName, FrameId, RotationFrame } from './types';
import type { Vector3Tuple } from 'three';
import { createPuzzleConfig } from './generateMenger';
import { availableScalesForLevel } from './levels';

const axisVector: Record<AxisName, Vector3Tuple> = {
  X: [1, 0, 0],
  Y: [0, 1, 0],
  Z: [0, 0, 1],
};

const axisIndex: Record<AxisName, 0 | 1 | 2> = { X: 0, Y: 1, Z: 2 };
const axisColor: Record<AxisName, string> = { X: '#fb7185', Y: '#38bdf8', Z: '#4ade80' };

const layerLabel = (layer: number): string => (layer > 0 ? `+${layer}` : `${layer}`);

export const generateRotationFrames = (level: number): RotationFrame[] => {
  const config = createPuzzleConfig(level);
  const baseRadius = (config.gridSize / 2) * 0.96;
  const scales = availableScalesForLevel(level);
  const frames: RotationFrame[] = [];

  for (const scale of scales) {
    const numGroups = config.gridSize / scale;

    for (const axisName of ['X', 'Y', 'Z'] as AxisName[]) {
      const index = axisIndex[axisName];

      for (let groupIndex = 0; groupIndex < numGroups; groupIndex++) {
        const groupMinCoord = groupIndex * scale - config.extent;
        const groupMaxCoord = (groupIndex + 1) * scale - 1 - config.extent;
        const centerCoord = (groupMinCoord + groupMaxCoord) / 2;

        // Keep existing single-layer frame ID format for backward compat
        const id: FrameId = scale === 1
          ? `${axisName}_${layerLabel(groupMinCoord)}`
          : `${axisName}_s${scale}_g${groupIndex}`;

        const name = scale === 1
          ? `${axisName}${layerLabel(groupMinCoord)}`
          : `${axisName}[${groupIndex + 1}/${numGroups}]`;

        frames.push({
          id,
          name,
          axisName,
          axis: axisVector[axisName],
          layer: centerCoord,
          scale,
          groupIndex,
          extent: config.extent,
          kind: 'slice',
          selector: scale === 1
            ? (position) => position[index] === groupMinCoord
            : (position) => {
                const coord = position[index];
                return coord >= groupMinCoord && coord <= groupMaxCoord;
              },
          color: axisColor[axisName],
          radius: baseRadius,
        });
      }
    }
  }

  return frames;
};

export const createFrameMap = (frames: RotationFrame[]): Map<FrameId, RotationFrame> =>
  new Map(frames.map((frame) => [frame.id, frame]));

export const frames = generateRotationFrames(1);
export const frameById = createFrameMap(frames);

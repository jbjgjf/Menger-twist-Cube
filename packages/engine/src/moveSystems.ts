import type { AxisName, TurnTarget } from './types';
import type { Vector3Tuple } from 'three';

/**
 * A move system is a named generator set for the same physical cube.
 *
 * - `standard`: the shipped set (frames + recursive block/slab/cell extensions).
 *   Every existing proof, move id and solver is stated for this system.
 * - `inner-square`: `standard` plus the single-layer inner square rotations
 *   found by the exhaustive audit in `docs/research/square-region-rotation-*.md`.
 *   It is opt-in and never the default, so nothing that was true of `standard`
 *   changes by its existence.
 */
export type MoveSystem = 'standard' | 'inner-square';

export const moveSystems: readonly MoveSystem[] = ['standard', 'inner-square'];

/** Levels a system is defined for; `null` means "every level the engine supports". */
export const moveSystemLevels: Record<MoveSystem, readonly number[] | null> = {
  standard: null,
  // Only Level 2 has been audited exhaustively. Level 3 has such rotations too
  // (e.g. the four cells (+-5,+-5,0)) but their full list is not established.
  'inner-square': [2],
};

export const isMoveSystemAvailable = (system: MoveSystem, level: number): boolean =>
  moveSystemLevels[system]?.includes(level) ?? true;

const axisNames: readonly AxisName[] = ['X', 'Y', 'Z'];
const axisVectors: Record<AxisName, Vector3Tuple> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
// In-plane coordinate indices, in the same order as `rotationLegality.ts`.
const perpIndices: Record<AxisName, [number, number]> = { X: [1, 2], Y: [2, 0], Z: [0, 1] };

/**
 * The 18 Level 2 ring targets. In each "middle" plane (layer -3, 0 or +3 of
 * each axis) the occupied cells form two concentric square rings about the
 * plane centre; their union is the existing scale-1 slice. Each ring turns on
 * its own:
 *
 *   inner — cells within the central 5x5 square (4 cells at layer 0, 12 at +-3)
 *   outer — the rest of the plane          (12 cells at layer 0, 20 at +-3)
 *
 * The audit proved these are all the single-layer square rotations missing
 * from the standard system, and proved each one interference-free exactly.
 */
export const generateInnerSquareTurnTargets = (level: number): TurnTarget[] => {
  if (level !== 2) return [];
  const targets: TurnTarget[] = [];
  for (const axisName of axisNames) {
    const axisIndex = axisNames.indexOf(axisName);
    const [iu, iv] = perpIndices[axisName];
    for (const layer of [-3, 0, 3]) {
      const pivot: Vector3Tuple = [0, 0, 0];
      pivot[axisIndex] = layer;
      const layerLabel = layer > 0 ? `+${layer}` : `${layer}`;
      for (const ring of ['inner', 'outer'] as const) {
        const cellCount = layer === 0 ? (ring === 'inner' ? 4 : 12) : ring === 'inner' ? 12 : 20;
        targets.push({
          id: `ring:${axisName}${layerLabel}:${ring}`,
          kind: 'extension',
          family: 'ring',
          name: `R${axisName}${layerLabel}${ring === 'inner' ? 'i' : 'o'}`,
          axisName,
          axis: axisVectors[axisName],
          scale: 1,
          // Outside the block/slab/cell depth ladder (1, 1.5, 2) on purpose, so
          // code that picks extensions by depth never picks a ring by accident.
          depth: 0,
          pivot,
          selector: (position) => {
            if (position[axisIndex] !== layer) return false;
            const radius = Math.max(Math.abs(position[iu]!), Math.abs(position[iv]!));
            return ring === 'inner' ? radius <= 2 : radius > 2;
          },
          affectedCountEstimate: cellCount,
        });
      }
    }
  }
  return targets;
};

export const generateMoveSystemTurnTargets = (system: MoveSystem, level: number): TurnTarget[] =>
  system === 'inner-square' ? generateInnerSquareTurnTargets(level) : [];

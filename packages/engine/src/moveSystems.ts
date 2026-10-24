import catalog from './data/innerSquareCatalog.json';
import type { AxisName, TurnTarget } from './types';
import type { Vector3Tuple } from 'three';

/** Named, explicitly different generator sets on the same occupied geometry.
 * `standard` is retained for historical comparisons and its existing proofs.
 * `inner-square` adds the exhaustive single-plane square-subset catalog; only
 * levels with a complete checked-in catalog are exposed.
 */
export type MoveSystem = 'standard' | 'inner-square';

export const moveSystems: readonly MoveSystem[] = ['standard', 'inner-square'];

/** Levels a system is defined for; `null` means "every level the engine supports". */
export const moveSystemLevels: Record<MoveSystem, readonly number[] | null> = {
  standard: null,
  // Level2 keeps its stable 18 audited IDs; higher levels come from the exhaustive catalog.
  'inner-square': [1, 2, ...Object.keys(catalog).map(Number)],
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
  if (level === 1) return [];
  if (level !== 2) {
    const data = (catalog as Record<string, { profiles: Array<{ pattern: number; targets: Array<{ pivot: number[]; cells: number[][]; angles: number[] }> }> }>)[level];
    if (!data) throw new Error(`No exhaustive inner-square catalog for Level ${level}`);
    const size = 3 ** level; const extent = (size - 1) / 2;
    const targets: TurnTarget[] = [];
    for (const axisName of axisNames) {
      const axis = axisNames.indexOf(axisName); const [u,v] = perpIndices[axisName];
      for (let layer = -extent; layer <= extent; layer++) {
        let digits = layer + extent; let pattern = 0;
        for (let d=0; d<level; d++) { if (digits % 3 !== 1) pattern |= 1 << d; digits = Math.floor(digits / 3); }
        for (const [i,t] of data.profiles[pattern]!.targets.entries()) {
          const pivot: Vector3Tuple = [0,0,0]; pivot[axis] = layer; pivot[u] = t.pivot[0]!; pivot[v] = t.pivot[1]!;
          const selected = new Set(t.cells.map(p => (p[0]! + extent) * size + p[1]! + extent));
          const side = Math.max(...t.cells.map(p => p[0]!)) - Math.min(...t.cells.map(p => p[0]!)) + 1;
          const id = `ring:n${level}:${axisName}${layer}:i${i}`;
          targets.push({ id, name: id, kind: 'extension', family: 'ring', axisName, axis: axisVectors[axisName],
            scale: side, depth: 0, pivot, affectedCountEstimate: t.cells.length,
            selector: p => p[axis] === layer && selected.has((p[u]! + extent) * size + p[v]! + extent) });
        }
      }
    }
    return targets;
  }
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
          scale: ring === 'inner' ? 5 : 9,
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

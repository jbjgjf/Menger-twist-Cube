/**
 * The extended rotation model: "rotate the blocks of one axial plane whose
 * outer shape is a square, about the axis through that square's centre".
 *
 * This module is **audit-only**. It imports the engine's geometry and legality
 * judge and never modifies them, so the shipped move set, the move ids, Play
 * and the solvers are untouched by anything here.
 *
 * Two separate concepts, kept separate on purpose:
 *
 * 1. *Candidate generation* — what we enumerate. Two families:
 *    - `region`: every occupied cell of an axis-parallel square lattice region
 *      inside one plane. Holes and disconnected parts come for free because the
 *      Menger set decides which cells of the region exist.
 *    - `subset`: any subset whose outer bounding box is a square centred on the
 *      axis. Enumerated exhaustively (not sampled) via the closure argument in
 *      `enumerateSubsetCandidates`.
 * 2. *Legality* — decided exclusively by the engine's
 *    `validateTurnTargetRotation`, i.e. by the same outer-envelope, endpoint
 *    closure and continuous-sweep checks the puzzle itself uses.
 *
 * Out of scope here, by decision, and never mixed into the primary counts:
 * non-X/Y/Z axes (the judge rejects them as `unsupported-axis`), multi-layer
 * thickness (`thickness.ts`), and 180-degree turns of rectangular cross
 * sections (`rectangle180.ts`).
 */
import { Quaternion } from 'three';
import type { Vector3Tuple } from 'three';
import {
  createPuzzleConfig,
  rotatePositionAroundPivot,
  validateTurnTargetRotation,
} from '../../packages/engine/src/index';
import type { Cubie, TurnTarget, TwistAngle } from '../../packages/engine/src/index';

export type AxisIndex = 0 | 1 | 2;
export const allAngles: TwistAngle[] = [90, -90, 180];
export const axisNames = ['X', 'Y', 'Z'] as const;
export const axisVectorFor: Record<AxisIndex, Vector3Tuple> = {
  0: [1, 0, 0],
  1: [0, 1, 0],
  2: [0, 0, 1],
};
/** The two in-plane coordinate indices, in the engine's own basis order. */
export const perpIndicesFor: Record<AxisIndex, [number, number]> = {
  0: [1, 2],
  1: [2, 0],
  2: [0, 1],
};

export const cellKey = (position: Vector3Tuple): string => position.join(',');

export interface Plane {
  axisIndex: AxisIndex;
  layer: number;
  /** Occupied cells of this plane, keyed by `cellKey`. */
  cells: Map<string, Vector3Tuple>;
}

export const buildPlane = (cubies: Cubie[], axisIndex: AxisIndex, layer: number): Plane => {
  const cells = new Map<string, Vector3Tuple>();
  for (const cubie of cubies) {
    if (cubie.currentPosition[axisIndex] !== layer) continue;
    cells.set(cellKey(cubie.currentPosition), cubie.currentPosition);
  }
  return { axisIndex, layer, cells };
};

/**
 * Candidate axis positions within a plane. The pivot of a legal candidate is
 * the centre of its cells' bounding box, so both in-plane coordinates are
 * either integers (odd side length) or half-integers (even side length); a
 * mixed pivot cannot be a square's centre. Half-integer pivots are kept: a
 * quarter turn about one still maps the integer lattice onto itself.
 */
export const pivotsInPlane = (extent: number): Array<[number, number]> => {
  const pivots: Array<[number, number]> = [];
  for (let u = -extent; u <= extent; u += 1) {
    for (let v = -extent; v <= extent; v += 1) pivots.push([u, v]);
  }
  for (let u = -extent + 0.5; u <= extent - 0.5; u += 1) {
    for (let v = -extent + 0.5; v <= extent - 0.5; v += 1) pivots.push([u, v]);
  }
  return pivots;
};

export const pivot3D = (
  axisIndex: AxisIndex,
  layer: number,
  [u, v]: [number, number],
): Vector3Tuple => {
  const [iu, iv] = perpIndicesFor[axisIndex];
  const pivot: Vector3Tuple = [0, 0, 0];
  pivot[axisIndex] = layer;
  pivot[iu] = u;
  pivot[iv] = v;
  return pivot;
};

/** A cell's orbit under repeated rotation by `angle` about `pivot`. */
export const rotationOrbit = (
  cell: Vector3Tuple,
  axis: Vector3Tuple,
  angle: TwistAngle,
  pivot: Vector3Tuple,
): Vector3Tuple[] => {
  const orbit: Vector3Tuple[] = [cell];
  const start = cellKey(cell);
  let current = cell;
  for (let step = 0; step < 4; step += 1) {
    current = rotatePositionAroundPivot(current, axis, angle, pivot);
    if (cellKey(current) === start) break;
    orbit.push(current);
  }
  return orbit;
};

export const boundingBox = (
  cells: Vector3Tuple[],
  axisIndex: AxisIndex,
): { min: [number, number]; max: [number, number]; centre: [number, number]; side: [number, number] } => {
  const [iu, iv] = perpIndicesFor[axisIndex];
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (const cell of cells) {
    minU = Math.min(minU, cell[iu]!);
    maxU = Math.max(maxU, cell[iu]!);
    minV = Math.min(minV, cell[iv]!);
    maxV = Math.max(maxV, cell[iv]!);
  }
  return {
    min: [minU, minV],
    max: [maxU, maxV],
    centre: [(minU + maxU) / 2, (minV + maxV) / 2],
    side: [maxU - minU + 1, maxV - minV + 1],
  };
};

/** The engine's own outer-shape condition, restated for reporting. */
export const envelopeIsSquareOnAxis = (
  cells: Vector3Tuple[],
  axisIndex: AxisIndex,
  pivot: [number, number],
): boolean => {
  const box = boundingBox(cells, axisIndex);
  return box.side[0] === box.side[1] && box.centre[0] === pivot[0] && box.centre[1] === pivot[1];
};

export interface Candidate {
  id: string;
  family: 'region' | 'subset';
  axisIndex: AxisIndex;
  axisName: (typeof axisNames)[number];
  /** Layer coordinates the candidate occupies (one entry for the primary model). */
  layers: number[];
  pivot: Vector3Tuple;
  pivotInPlane: [number, number];
  /** Side length of the enumerated square region, when the family has one. */
  regionSide?: number;
  regionMin?: [number, number];
  cells: Vector3Tuple[];
}

/** A `TurnTarget` selecting exactly `cells`, for the engine to judge. */
export const targetForCells = (candidate: Candidate): TurnTarget => {
  const keys = new Set(candidate.cells.map(cellKey));
  return {
    id: candidate.id,
    kind: 'extension',
    family: 'block',
    name: candidate.id,
    axisName: candidate.axisName,
    axis: axisVectorFor[candidate.axisIndex],
    scale: 1,
    depth: Number.NaN,
    pivot: candidate.pivot,
    selector: (position) => keys.has(cellKey(position)),
    affectedCountEstimate: candidate.cells.length,
  };
};

const syntheticCubie = (position: Vector3Tuple): Cubie => ({
  id: `probe_${cellKey(position)}`,
  homePosition: position,
  currentPosition: position,
  orientation: new Quaternion(),
  type: 'outer',
});

/**
 * Does the rigid rotation of `moving` sweep through any cell of `blockers`?
 *
 * Asked of the engine, not reimplemented: the probe builds a world containing
 * only `moving ∪ blockers`, so the only possible blocking cubies are the ones
 * asked about. `moving` must be a union of full rotation orbits — that is what
 * makes the probe pass the envelope and endpoint-closure stages, leaving the
 * swept-collision stage as the only thing it can fail.
 */
export const orbitCollides = (
  moving: Vector3Tuple[],
  blockers: Vector3Tuple[],
  axisIndex: AxisIndex,
  pivot: Vector3Tuple,
  angle: TwistAngle,
): boolean => {
  if (blockers.length === 0) return false;
  const world = [...moving, ...blockers].map(syntheticCubie);
  const candidate: Candidate = {
    id: `probe:${cellKey(pivot)}:${angle}:${moving.map(cellKey).join('/')}`,
    family: 'subset',
    axisIndex,
    axisName: axisNames[axisIndex],
    layers: [pivot[axisIndex]!],
    pivot,
    pivotInPlane: [0, 0],
    cells: moving,
  };
  const verdict = validateTurnTargetRotation(world, targetForCells(candidate), angle);
  if (verdict.legal) return false;
  if (verdict.code === 'sweep-collision') return true;
  throw new Error(`probe rejected for a non-collision reason: ${verdict.code} (${verdict.message})`);
};

export interface RegionEnumeration {
  candidates: Candidate[];
  /** Regions that produced no occupied cell at all. */
  emptyRegions: number;
  /** Regions whose occupied cells duplicate an already-emitted candidate. */
  duplicateRegions: number;
}

/**
 * Family `region`: for every plane, every axis-parallel square lattice region,
 * take all its occupied cells. Regions whose cell set (with the same pivot)
 * repeats an earlier region are dropped — a smaller region with the same
 * occupancy is the same operation, not a second one.
 */
export const enumerateRegionCandidates = (cubies: Cubie[], level: number): RegionEnumeration => {
  const config = createPuzzleConfig(level);
  const { extent, gridSize } = config;
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  let emptyRegions = 0;
  let duplicateRegions = 0;

  for (const axisIndex of [0, 1, 2] as AxisIndex[]) {
    const [iu, iv] = perpIndicesFor[axisIndex];
    for (const layer of config.coordinates) {
      const plane = buildPlane(cubies, axisIndex, layer);
      for (let side = 1; side <= gridSize; side += 1) {
        for (let minU = -extent; minU + side - 1 <= extent; minU += 1) {
          for (let minV = -extent; minV + side - 1 <= extent; minV += 1) {
            const cells: Vector3Tuple[] = [];
            for (const cell of plane.cells.values()) {
              const u = cell[iu]!;
              const v = cell[iv]!;
              if (u < minU || u > minU + side - 1) continue;
              if (v < minV || v > minV + side - 1) continue;
              cells.push(cell);
            }
            if (cells.length === 0) {
              emptyRegions += 1;
              continue;
            }
            const pivotInPlane: [number, number] = [
              minU + (side - 1) / 2,
              minV + (side - 1) / 2,
            ];
            const pivot = pivot3D(axisIndex, layer, pivotInPlane);
            const signature = `${axisIndex}:${layer}:${pivotInPlane.join(',')}:${cells
              .map(cellKey)
              .sort()
              .join('|')}`;
            if (seen.has(signature)) {
              duplicateRegions += 1;
              continue;
            }
            seen.add(signature);
            candidates.push({
              id: `region:${axisNames[axisIndex]}${layer}:c${pivotInPlane.join('_')}:s${side}`,
              family: 'region',
              axisIndex,
              axisName: axisNames[axisIndex],
              layers: [layer],
              pivot,
              pivotInPlane,
              regionSide: side,
              regionMin: [minU, minV],
              cells,
            });
          }
        }
      }
    }
  }

  return { candidates, emptyRegions, duplicateRegions };
};

export interface SubsetEnumerationStats {
  planes: number;
  /** Cells whose rotation orbit is not fully occupied: they can never move. */
  nonClosableCells: number;
  /** Orbits removed because they collide with a cell that can never move. */
  hardBlockedOrbits: number;
  /** Collision implications "if this orbit moves, that one must move too". */
  implications: number;
  closedSets: number;
  /** Pivot/angle pairs abandoned because the closed-set count hit the cap. */
  cappedPivots: Array<{ axisIndex: AxisIndex; layer: number; pivot: [number, number]; angle: TwistAngle; orbits: number }>;
}

/**
 * Family `subset`, enumerated exhaustively rather than sampled.
 *
 * Three facts from `rotationLegality.ts` make this finite and complete:
 *
 * 1. **Endpoint closure** forces the selected set to be a union of full
 *    rotation orbits about the pivot, and only orbits whose every cell is
 *    occupied can qualify. Cells failing this are permanent blockers.
 * 2. **Collisions are pairwise.** The judge tests each moving cube against each
 *    stationary cube; moving cubes cannot collide with each other (they share
 *    one rigid motion). So a set is sweep-legal iff no selected orbit sweeps
 *    through an unselected cell, i.e. iff it is closed under the implication
 *    "if O moves then O' must move too". Sets containing an orbit that sweeps a
 *    permanent blocker are excluded outright.
 * 3. **A union of orbits is automatically square-centred for quarter turns**:
 *    each orbit's bounding box is a square centred on the pivot, and a union of
 *    concentric squares is a concentric square. For 180 degrees orbits have
 *    size 2 and the box has to be checked.
 *
 * Every set the enumeration emits is then re-judged by the engine against the
 * *full* puzzle, so the reasoning above is checked rather than trusted.
 */
export const enumerateSubsetCandidates = (
  cubies: Cubie[],
  level: number,
  options: { closedSetCap?: number; planeFilter?: (axisIndex: AxisIndex, layer: number) => boolean } = {},
): { candidates: Candidate[]; stats: SubsetEnumerationStats } => {
  const cap = options.closedSetCap ?? 1_000_000;
  const planeFilter = options.planeFilter ?? (() => true);
  const config = createPuzzleConfig(level);
  const candidates: Candidate[] = [];
  const stats: SubsetEnumerationStats = {
    planes: 0,
    nonClosableCells: 0,
    hardBlockedOrbits: 0,
    implications: 0,
    closedSets: 0,
    cappedPivots: [],
  };
  const emitted = new Set<string>();

  for (const axisIndex of [0, 1, 2] as AxisIndex[]) {
    const axis = axisVectorFor[axisIndex];
    for (const layer of config.coordinates) {
      if (!planeFilter(axisIndex, layer)) continue;
      const plane = buildPlane(cubies, axisIndex, layer);
      if (plane.cells.size === 0) continue;
      stats.planes += 1;

      for (const pivotInPlane of pivotsInPlane(config.extent)) {
        const pivot = pivot3D(axisIndex, layer, pivotInPlane);

        for (const angle of allAngles) {
          // 1. orbits that can close on occupied sites
          const orbits: Vector3Tuple[][] = [];
          const orbitIndexByCell = new Map<string, number>();
          const permanent: Vector3Tuple[] = [];
          for (const cell of plane.cells.values()) {
            if (orbitIndexByCell.has(cellKey(cell))) continue;
            const orbit = rotationOrbit(cell, axis, angle, pivot);
            const closable = orbit.every((site) => plane.cells.has(cellKey(site)));
            if (!closable) {
              stats.nonClosableCells += 1;
              permanent.push(cell);
              continue;
            }
            const index = orbits.length;
            orbits.push(orbit);
            for (const site of orbit) orbitIndexByCell.set(cellKey(site), index);
          }
          if (orbits.length === 0) continue;

          // 2. orbits blocked by cells that can never move, propagated to a fixpoint
          const alive = orbits.map(() => true);
          const permanentCells = [...permanent];
          let changed = true;
          while (changed) {
            changed = false;
            for (let index = 0; index < orbits.length; index += 1) {
              if (!alive[index]) continue;
              if (!orbitCollides(orbits[index]!, permanentCells, axisIndex, pivot, angle)) continue;
              alive[index] = false;
              stats.hardBlockedOrbits += 1;
              permanentCells.push(...orbits[index]!);
              changed = true;
            }
          }
          const live = orbits.map((_, index) => index).filter((index) => alive[index]);
          if (live.length === 0) continue;

          // 3. implication graph among the survivors
          const successors = new Map<number, number[]>();
          for (const index of live) {
            const targets: number[] = [];
            for (const other of live) {
              if (other === index) continue;
              if (orbitCollides(orbits[index]!, orbits[other]!, axisIndex, pivot, angle)) {
                targets.push(other);
              }
            }
            stats.implications += targets.length;
            successors.set(index, targets);
          }

          // 4. forward closure of each orbit, then all unions of closures
          const closureOf = new Map<number, Set<number>>();
          for (const index of live) {
            const reached = new Set<number>([index]);
            const stack = [index];
            while (stack.length > 0) {
              const current = stack.pop()!;
              for (const next of successors.get(current) ?? []) {
                if (reached.has(next)) continue;
                reached.add(next);
                stack.push(next);
              }
            }
            closureOf.set(index, reached);
          }

          // Condense mutually-implying orbits, then walk the resulting DAG with
          // successors decided first. Including a component is allowed only once
          // all of its successors are in, and excluding is always allowed, so
          // every partial assignment completes to at least one closed set and the
          // walk costs O(closed sets x components) instead of O(2^orbits).
          const componentOf = new Map<number, number>();
          const components: number[][] = [];
          for (const index of live) {
            if (componentOf.has(index)) continue;
            const mutual = [...closureOf.get(index)!].filter(
              (other) => live.includes(other) && closureOf.get(other)!.has(index),
            );
            const component = components.length;
            components.push(mutual);
            for (const member of mutual) componentOf.set(member, component);
          }
          const componentClosureSize = components.map((members) => closureOf.get(members[0]!)!.size);
          const componentOrder = components
            .map((_, index) => index)
            .sort((a, b) => componentClosureSize[a]! - componentClosureSize[b]!);
          const componentSuccessors = components.map((members) => {
            const targets = new Set<number>();
            for (const member of members) {
              for (const next of successors.get(member) ?? []) {
                const component = componentOf.get(next)!;
                if (component !== componentOf.get(member)!) targets.add(component);
              }
            }
            return [...targets];
          });

          const closedSets: number[][] = [];
          let capped = false;
          const walk = (position: number, chosen: boolean[]): void => {
            if (capped) return;
            if (position === componentOrder.length) {
              const selected = components.flatMap((members, index) => (chosen[index] ? members : []));
              if (selected.length > 0) closedSets.push(selected);
              if (closedSets.length > cap) capped = true;
              return;
            }
            const component = componentOrder[position]!;
            walk(position + 1, chosen);
            if (capped) return;
            if (componentSuccessors[component]!.every((successor) => chosen[successor])) {
              const next = [...chosen];
              next[component] = true;
              walk(position + 1, next);
            }
          };
          walk(0, components.map(() => false));
          if (capped) {
            stats.cappedPivots.push({ axisIndex, layer, pivot: pivotInPlane, angle, orbits: live.length });
            continue;
          }
          stats.closedSets += closedSets.length;

          for (const indices of closedSets) {
            const cells = indices.flatMap((index) => orbits[index]!);
            if (!envelopeIsSquareOnAxis(cells, axisIndex, pivotInPlane)) continue;
            const signature = `${axisIndex}:${layer}:${pivotInPlane.join(',')}:${cells
              .map(cellKey)
              .sort()
              .join('|')}`;
            if (emitted.has(signature)) continue;
            emitted.add(signature);
            const box = boundingBox(cells, axisIndex);
            candidates.push({
              id: `subset:${axisNames[axisIndex]}${layer}:c${pivotInPlane.join('_')}:n${cells.length}:${indices.join('-')}`,
              family: 'subset',
              axisIndex,
              axisName: axisNames[axisIndex],
              layers: [layer],
              pivot,
              pivotInPlane,
              regionSide: box.side[0],
              regionMin: box.min,
              cells,
            });
          }
        }
      }
    }
  }

  return { candidates, stats };
};

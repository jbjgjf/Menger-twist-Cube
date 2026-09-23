/**
 * The other half of the rigour question: are the judge's *collision* verdicts,
 * on which the exhaustiveness of family `subset` rests, real collisions?
 *
 * Run: `node --import tsx research/square-rotation/rejection-certificates.ts`
 * Writes `research/square-rotation/out/l2-rejection-certificates.json`.
 *
 * `enumerateSubsetCandidates` drops a set for exactly four reasons: an orbit
 * does not close on occupied sites (integer arithmetic, exact), the square-box
 * filter (exact), an orbit sweeps a cell that can never move, or an orbit
 * sweeps a cell of another orbit that is left behind. The last two are
 * "collides" answers from the judge. If any of them were false, a legal set
 * could have been missed. This script re-runs those probes in the same order,
 * takes the judge's witness (moving cell, blocking cell, angle), and proves the
 * collision exactly:
 *
 *   pick a rational t = p/q near tan(φ/2); then cos φ' = (q²-p²)/(q²+p²) and
 *   sin φ' = 2pq/(q²+p²) are rational, all square vertices are rational, and
 *   the separating-axis test over the four edge normals decides interior
 *   overlap of two convex polygons exactly (BigInt arithmetic).
 *
 * A collision at one angle φ' strictly inside the swept range is a genuine
 * positive-volume intrusion. If the witness angle does not verify, the whole
 * range is scanned at 4096 rational angles before giving up.
 *
 * Direction of 180-degree turns. The judge sweeps a half turn in the positive
 * sense only. Physically either sense reaches the same end state, so a set
 * whose +180 sweep collides but whose -180 sweep is free would be a missed
 * move. -180 is checked by mirroring the plane across the line v = c_v through
 * the pivot (an integer-lattice symmetry, since 2c_v is an integer): a +180
 * sweep in the mirrored plane is the -180 sweep of the original.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { Quaternion } from 'three';
import type { Vector3Tuple } from 'three';
import { createMengerPuzzleState, createPuzzleConfig, validateTurnTargetRotation } from '../../packages/engine/src/index';
import type { Cubie, TwistAngle } from '../../packages/engine/src/index';
import {
  allAngles,
  axisNames,
  axisVectorFor,
  buildPlane,
  cellKey,
  enumerateSubsetCandidates,
  envelopeIsSquareOnAxis,
  perpIndicesFor,
  pivot3D,
  pivotsInPlane,
  rotationOrbit,
  targetForCells,
} from './model';
import type { AxisIndex, Candidate } from './model';

// ------------------------------------------------ exact collision witness

type Point = [bigint, bigint];

/** Doubled in-plane offset of a cell from the pivot, in the engine's basis order. */
const doubledOffset = (cell: Vector3Tuple, pivot: Vector3Tuple, axisIndex: AxisIndex): [number, number] => {
  const [iu, iv] = perpIndicesFor[axisIndex];
  return [2 * (cell[iu]! - pivot[iu]!), 2 * (cell[iv]! - pivot[iv]!)];
};

/**
 * Exact interior-overlap test of the moving square (doubled centre `m`,
 * rotated by the angle with tan(φ/2) = p/q) against the static square (doubled
 * centre `s`). All coordinates are multiplied by D = q² + p² to stay integral.
 */
export const interiorsOverlapAt = (m: [number, number], s: [number, number], p: bigint, q: bigint): boolean => {
  const D = q * q + p * p;
  const c = q * q - p * p; // D·cos
  const n = 2n * p * q; // D·sin
  const corners: Array<[bigint, bigint]> = [[-1n, -1n], [1n, -1n], [1n, 1n], [-1n, 1n]];
  const moving: Point[] = corners.map(([dx, dy]) => {
    const x = BigInt(m[0]) + dx;
    const y = BigInt(m[1]) + dy;
    return [c * x - n * y, n * x + c * y];
  });
  const fixed: Point[] = corners.map(([dx, dy]) => [(BigInt(s[0]) + dx) * D, (BigInt(s[1]) + dy) * D]);
  const axes: Point[] = [[1n, 0n], [0n, 1n], [c, n], [-n, c]];
  for (const [ax, ay] of axes) {
    const project = (points: Point[]) => points.map(([x, y]) => x * ax + y * ay);
    const a = project(moving);
    const b = project(fixed);
    const maxA = a.reduce((x, y) => (x > y ? x : y));
    const minA = a.reduce((x, y) => (x < y ? x : y));
    const maxB = b.reduce((x, y) => (x > y ? x : y));
    const minB = b.reduce((x, y) => (x < y ? x : y));
    // Touching projections (maxA == minB) separate the interiors.
    if (maxA <= minB || maxB <= minA) return false;
  }
  return true;
};

const scale = 1n << 24n;
const rationalTanHalf = (radians: number): [bigint, bigint] => [BigInt(Math.round(Math.tan(radians / 2) * Number(scale))), scale];

/** Proves an interior overlap somewhere strictly inside (0, end) (radians, |end| <= π). */
export const certifyCollision = (
  m: [number, number],
  s: [number, number],
  end: number,
  witness: number | undefined,
): { certified: boolean; angleDeg?: number; via?: 'witness' | 'scan' } => {
  const tryAngle = (radians: number): boolean => {
    if (!(radians * Math.sign(end) > 0 && Math.abs(radians) < Math.abs(end))) return false;
    // |φ| < π strictly, so tan(φ/2) is finite.
    const [p, q] = rationalTanHalf(radians);
    return interiorsOverlapAt(m, s, p, q);
  };
  if (witness !== undefined && tryAngle(witness)) return { certified: true, angleDeg: (witness * 180) / Math.PI, via: 'witness' };
  const steps = 4096;
  for (let k = 1; k < steps; k += 1) {
    const radians = (end * k) / steps;
    if (tryAngle(radians)) return { certified: true, angleDeg: (radians * 180) / Math.PI, via: 'scan' };
  }
  return { certified: false };
};

// ------------------------------------------------------ probing the judge

const syntheticCubie = (position: Vector3Tuple): Cubie => ({
  id: `probe_${cellKey(position)}`,
  homePosition: position,
  currentPosition: position,
  orientation: new Quaternion(),
  type: 'outer',
});

const parseProbeId = (id: string): Vector3Tuple => id.replace('probe_', '').split(',').map(Number) as Vector3Tuple;

interface ClaimStats {
  claims: number;
  certifiedByWitness: number;
  certifiedByScan: number;
  uncertified: Array<{ plane: string; pivot: string; angle: number; moving: string; blocking: string; mirrored: boolean }>;
}

const stats: ClaimStats = { claims: 0, certifiedByWitness: 0, certifiedByScan: 0, uncertified: [] };

/** `orbitCollides` from model.ts, plus an exact proof of every "collides" answer. */
const collides = (
  moving: Vector3Tuple[],
  blockers: Vector3Tuple[],
  axisIndex: AxisIndex,
  pivot: Vector3Tuple,
  angle: TwistAngle,
  mirrored: boolean,
): boolean => {
  if (blockers.length === 0) return false;
  const world = [...moving, ...blockers].map(syntheticCubie);
  const candidate: Candidate = {
    id: `rprobe:${mirrored ? 'm' : ''}${cellKey(pivot)}:${angle}:${moving.map(cellKey).join('/')}:${blockers.length}`,
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
  if (verdict.code !== 'sweep-collision') throw new Error(`probe rejected for ${verdict.code}`);

  stats.claims += 1;
  const movingCell = parseProbeId(verdict.movingCubieId!);
  const blockingCell = parseProbeId(verdict.blockingCubieId!);
  const end = (angle * Math.PI) / 180; // unit axes are all positive here
  const witness = verdict.collisionAngleDeg === undefined ? undefined : (verdict.collisionAngleDeg * Math.PI) / 180;
  const proof = certifyCollision(doubledOffset(movingCell, pivot, axisIndex), doubledOffset(blockingCell, pivot, axisIndex), end, witness);
  if (proof.via === 'witness') stats.certifiedByWitness += 1;
  else if (proof.via === 'scan') stats.certifiedByScan += 1;
  else {
    stats.uncertified.push({
      plane: `${axisNames[axisIndex]}${pivot[axisIndex]}`,
      pivot: cellKey(pivot),
      angle,
      moving: cellKey(movingCell),
      blocking: cellKey(blockingCell),
      mirrored,
    });
  }
  return true;
};

// ------------------------------------------- the enumeration, re-derived

/** Closed sets of one (plane, pivot, angle); mirrors phases 1-4 of `enumerateSubsetCandidates`. */
const closedSetsAt = (
  planeCells: Map<string, Vector3Tuple>,
  axisIndex: AxisIndex,
  pivot: Vector3Tuple,
  angle: TwistAngle,
  mirrored: boolean,
): Vector3Tuple[][] => {
  const axis = axisVectorFor[axisIndex];
  const orbits: Vector3Tuple[][] = [];
  const seen = new Set<string>();
  const permanent: Vector3Tuple[] = [];
  for (const cell of planeCells.values()) {
    if (seen.has(cellKey(cell))) continue;
    const orbit = rotationOrbit(cell, axis, angle, pivot);
    if (!orbit.every((site) => planeCells.has(cellKey(site)))) {
      permanent.push(cell);
      continue;
    }
    orbits.push(orbit);
    for (const site of orbit) seen.add(cellKey(site));
  }
  if (orbits.length === 0) return [];

  const alive = orbits.map(() => true);
  const blocked = [...permanent];
  for (let changed = true; changed; ) {
    changed = false;
    for (let index = 0; index < orbits.length; index += 1) {
      if (!alive[index] || !collides(orbits[index]!, blocked, axisIndex, pivot, angle, mirrored)) continue;
      alive[index] = false;
      blocked.push(...orbits[index]!);
      changed = true;
    }
  }
  const live = orbits.map((_, index) => index).filter((index) => alive[index]);
  const successors = new Map<number, number[]>();
  for (const index of live) {
    successors.set(index, live.filter((other) => other !== index && collides(orbits[index]!, orbits[other]!, axisIndex, pivot, angle, mirrored)));
  }

  // Closed sets = downward-closed sets of the implication relation. Plain
  // backtracking over orbits is fine at this size: at most a few dozen live
  // orbits per pivot and 591 closed sets in total at Level 2.
  const closure = (start: number): Set<number> => {
    const reached = new Set([start]);
    const stack = [start];
    while (stack.length > 0) for (const next of successors.get(stack.pop()!)!) if (!reached.has(next)) (reached.add(next), stack.push(next));
    return reached;
  };
  const closures = new Map(live.map((index) => [index, closure(index)]));
  const results = new Set<string>();
  const found: number[][] = [];
  const grow = (chosen: Set<number>, from: number): void => {
    for (let position = from; position < live.length; position += 1) {
      const index = live[position]!;
      if (chosen.has(index)) continue;
      const next = new Set([...chosen, ...closures.get(index)!]);
      const key = [...next].sort((x, y) => x - y).join(',');
      if (results.has(key)) continue;
      results.add(key);
      found.push([...next]);
      grow(next, position + 1);
    }
  };
  grow(new Set(), 0);
  return found.map((indices) => indices.flatMap((index) => orbits[index]!));
};

const mirrorCell = (cell: Vector3Tuple, axisIndex: AxisIndex, pivot: Vector3Tuple): Vector3Tuple => {
  const [, iv] = perpIndicesFor[axisIndex];
  const image: Vector3Tuple = [cell[0], cell[1], cell[2]];
  image[iv] = 2 * pivot[iv]! - cell[iv]!;
  return image;
};

const main = (): void => {
  const started = performance.now();
  const level = 2;
  const config = createPuzzleConfig(level);
  const cubies = createMengerPuzzleState(level).cubies as Cubie[];

  const signature = (axisIndex: AxisIndex, pivot: Vector3Tuple, angle: TwistAngle, cells: Vector3Tuple[]) =>
    `${axisIndex}|${cellKey(pivot)}|${angle}|${cells.map(cellKey).sort().join(';')}`;

  // Reference: the audit's own enumeration, per angle.
  const reference = enumerateSubsetCandidates(cubies, level);
  const referenceKeys = new Set<string>();
  for (const candidate of reference.candidates) {
    for (const angle of allAngles) {
      if (validateTurnTargetRotation(cubies, targetForCells({ ...candidate, id: `${candidate.id}#ref${angle}` }), angle).legal) {
        referenceKeys.add(signature(candidate.axisIndex, candidate.pivot, angle, candidate.cells));
      }
    }
  }

  const rederived = new Set<string>();
  const minusHalfTurnOnly: Array<{ plane: string; pivot: string; cells: string[] }> = [];
  let minusHalfTurnSets = 0;
  for (const axisIndex of [0, 1, 2] as AxisIndex[]) {
    for (const layer of config.coordinates) {
      const plane = buildPlane(cubies, axisIndex, layer);
      if (plane.cells.size === 0) continue;
      for (const pivotInPlane of pivotsInPlane(config.extent)) {
        const pivot = pivot3D(axisIndex, layer, pivotInPlane);
        const plusHalf = new Set<string>();
        for (const angle of allAngles) {
          for (const cells of closedSetsAt(plane.cells, axisIndex, pivot, angle, false)) {
            if (!envelopeIsSquareOnAxis(cells, axisIndex, pivotInPlane)) continue;
            rederived.add(signature(axisIndex, pivot, angle, cells));
            if (angle === 180) plusHalf.add(cells.map(cellKey).sort().join(';'));
          }
        }
        // -180: the +180 sweep of the mirrored plane.
        const mirroredCells = new Map<string, Vector3Tuple>();
        for (const cell of plane.cells.values()) {
          const image = mirrorCell(cell, axisIndex, pivot);
          mirroredCells.set(cellKey(image), image);
        }
        for (const mirroredSet of closedSetsAt(mirroredCells, axisIndex, pivot, 180, true)) {
          const cells = mirroredSet.map((cell) => mirrorCell(cell, axisIndex, pivot));
          if (!envelopeIsSquareOnAxis(cells, axisIndex, pivotInPlane)) continue;
          minusHalfTurnSets += 1;
          const key = cells.map(cellKey).sort().join(';');
          if (!plusHalf.has(key)) {
            minusHalfTurnOnly.push({ plane: `${axisNames[axisIndex]}${layer}`, pivot: pivotInPlane.join(','), cells: cells.map(cellKey) });
          }
        }
      }
    }
  }

  const missingFromRederived = [...referenceKeys].filter((key) => !rederived.has(key));
  const extraInRederived = [...rederived].filter((key) => !referenceKeys.has(key));
  const elapsedMs = Math.round(performance.now() - started);

  console.log('=== Level 2: exact certificates for the collision verdicts behind family "subset" ===');
  console.log(
    `collision claims ${stats.claims}: proved at the judge's witness angle ${stats.certifiedByWitness}, ` +
      `proved by rational scan ${stats.certifiedByScan}, unproved ${stats.uncertified.length}`,
  );
  console.log(
    `re-derived legal (set, angle) pairs ${rederived.size} vs audit ${referenceKeys.size}: ` +
      `missing ${missingFromRederived.length}, extra ${extraInRederived.length}`,
  );
  console.log(
    `-180 sweeps (mirrored): square-box closed sets ${minusHalfTurnSets}; sets free at -180 but not at +180: ${minusHalfTurnOnly.length}`,
  );
  for (const row of minusHalfTurnOnly.slice(0, 10)) console.log(`  ${row.plane} pivot (${row.pivot}): ${row.cells.join(' ')}`);
  for (const row of stats.uncertified.slice(0, 10)) console.log(`  unproved: ${JSON.stringify(row)}`);
  console.log(`elapsed ${elapsedMs}ms, heap ${Math.round(process.memoryUsage().heapUsed / 1e6)}MB`);

  const outDir = 'research/square-rotation/out';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    `${outDir}/l2-rejection-certificates.json`,
    `${JSON.stringify(
      {
        level,
        method:
          'Every "collides" answer used by the subset enumeration is re-proved by an exact rational separating-axis ' +
          'test at a rational angle (tan(φ/2) = p/2^24) strictly inside the sweep. -180 checked via the mirrored plane.',
        claims: { ...stats, uncertifiedCount: stats.uncertified.length },
        rederivedVsAudit: { rederived: rederived.size, audit: referenceKeys.size, missing: missingFromRederived, extra: extraInRederived },
        minusHalfTurn: { closedSquareSets: minusHalfTurnSets, freeOnlyAtMinus180: minusHalfTurnOnly },
        elapsedMs,
      },
      null,
      1,
    )}\n`,
  );
  console.log(`wrote ${outDir}/l2-rejection-certificates.json`);
};

if (import.meta.url === `file://${process.argv[1]}`) main();

import type { Vector3Tuple } from 'three';
import type { Cubie, RotationFrame, TurnTarget, TwistAngle } from './types';
import { rotatePositionAroundPivot } from './geometry';

const halfUnit = 0.5;
const geometryEpsilon = 1e-9;
const maxSweepSubdivisionDepth = 16;

export type RotationBlockCode =
  | 'empty-target'
  | 'unsupported-axis'
  | 'outer-envelope-not-square'
  | 'endpoint-not-closed'
  | 'sweep-collision';

export interface RotationLegality {
  legal: boolean;
  code?: RotationBlockCode;
  message: string;
  movingCubieId?: string;
  blockingCubieId?: string;
  collisionAngleDeg?: number;
}

interface RigidRotationCandidate {
  id: string;
  axis: Vector3Tuple;
  pivot: Vector3Tuple;
  selector: (position: Vector3Tuple) => boolean;
}

interface AxisBasis {
  axis: Vector3Tuple;
  first: Vector3Tuple;
  second: Vector3Tuple;
  sign: 1 | -1;
}

interface Bounds2 {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

type Point2 = readonly [number, number];

const legalResult = (): RotationLegality => ({ legal: true, message: 'Rotation is physically admissible.' });

const dot = (a: Vector3Tuple, b: Vector3Tuple): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const axisBasis = (axis: Vector3Tuple): AxisBasis | null => {
  const nonZero = axis
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => Math.abs(value) > geometryEpsilon);
  if (nonZero.length !== 1 || Math.abs(Math.abs(nonZero[0]!.value) - 1) > geometryEpsilon) return null;

  const sign: 1 | -1 = nonZero[0]!.value > 0 ? 1 : -1;
  if (nonZero[0]!.index === 0) {
    return { axis: [1, 0, 0], first: [0, 1, 0], second: [0, 0, 1], sign };
  }
  if (nonZero[0]!.index === 1) {
    return { axis: [0, 1, 0], first: [0, 0, 1], second: [1, 0, 0], sign };
  }
  return { axis: [0, 0, 1], first: [1, 0, 0], second: [0, 1, 0], sign };
};

const project = (position: Vector3Tuple, basis: AxisBasis): Point2 => [
  dot(position, basis.first),
  dot(position, basis.second),
];

const rotate2 = ([x, y]: Point2, angle: number): Point2 => {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [cosine * x - sine * y, sine * x + cosine * y];
};

const positionKey = (position: Vector3Tuple): string => position.join(',');

const outerEnvelopeIsSquare = (
  moving: Cubie[],
  pivot: Vector3Tuple,
  basis: AxisBasis,
): boolean => {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const cubie of moving) {
    const [x, y] = project(cubie.currentPosition, basis);
    minX = Math.min(minX, x - halfUnit);
    maxX = Math.max(maxX, x + halfUnit);
    minY = Math.min(minY, y - halfUnit);
    maxY = Math.max(maxY, y + halfUnit);
  }
  const [pivotX, pivotY] = project(pivot, basis);
  return (
    Math.abs((maxX - minX) - (maxY - minY)) <= geometryEpsilon &&
    Math.abs((minX + maxX) / 2 - pivotX) <= geometryEpsilon &&
    Math.abs((minY + maxY) / 2 - pivotY) <= geometryEpsilon
  );
};

const endpointCloses = (
  moving: Cubie[],
  candidate: RigidRotationCandidate,
  angle: TwistAngle,
): boolean => {
  const movingPositions = new Set(moving.map((cubie) => positionKey(cubie.currentPosition)));
  const destinations = new Set<string>();
  for (const cubie of moving) {
    const destination = rotatePositionAroundPivot(cubie.currentPosition, candidate.axis, angle, candidate.pivot);
    const key = positionKey(destination);
    if (!movingPositions.has(key) || destinations.has(key)) return false;
    destinations.add(key);
  }
  return destinations.size === movingPositions.size;
};

const updateBounds = (bounds: Bounds2, [x, y]: Point2): void => {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxY = Math.max(bounds.maxY, y);
};

const criticalAngles = (base: number, period: number, start: number, end: number): number[] => {
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  const first = Math.ceil((low - base) / period);
  const last = Math.floor((high - base) / period);
  const result: number[] = [];
  for (let k = first; k <= last; k += 1) result.push(base + k * period);
  return result;
};

/** Exact axis-aligned bounds of a rotating unit square over an angle interval. */
const sweptSquareBounds = (center: Point2, start: number, end: number): Bounds2 => {
  const bounds: Bounds2 = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  for (const dx of [-halfUnit, halfUnit]) {
    for (const dy of [-halfUnit, halfUnit]) {
      const vertex: Point2 = [center[0] + dx, center[1] + dy];
      const phase = Math.atan2(vertex[1], vertex[0]);
      const angles = new Set<number>([start, end]);
      for (const value of criticalAngles(-phase, Math.PI, start, end)) angles.add(value);
      for (const value of criticalAngles(Math.PI / 2 - phase, Math.PI, start, end)) angles.add(value);
      for (const value of angles) updateBounds(bounds, rotate2(vertex, value));
    }
  }
  return bounds;
};

const boundsOverlapStationarySquare = (bounds: Bounds2, center: Point2): boolean =>
  bounds.minX < center[0] + halfUnit - geometryEpsilon &&
  bounds.maxX > center[0] - halfUnit + geometryEpsilon &&
  bounds.minY < center[1] + halfUnit - geometryEpsilon &&
  bounds.maxY > center[1] - halfUnit + geometryEpsilon;

/** Strict SAT overlap: boundary-only contact is intentionally legal. */
const squaresHaveInteriorOverlap = (movingCenter: Point2, stationaryCenter: Point2, angle: number): boolean => {
  const rotatedCenter = rotate2(movingCenter, angle);
  const deltaX = stationaryCenter[0] - rotatedCenter[0];
  const deltaY = stationaryCenter[1] - rotatedCenter[1];
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const absoluteCosine = Math.abs(cosine);
  const absoluteSine = Math.abs(sine);
  const worldAxisRadius = halfUnit * (absoluteCosine + absoluteSine) + halfUnit;

  if (Math.abs(deltaX) >= worldAxisRadius - geometryEpsilon) return false;
  if (Math.abs(deltaY) >= worldAxisRadius - geometryEpsilon) return false;

  const movingAxisXDistance = Math.abs(deltaX * cosine + deltaY * sine);
  const movingAxisYDistance = Math.abs(-deltaX * sine + deltaY * cosine);
  const movingAxisRadius = halfUnit + halfUnit * (absoluteCosine + absoluteSine);
  return (
    movingAxisXDistance < movingAxisRadius - geometryEpsilon &&
    movingAxisYDistance < movingAxisRadius - geometryEpsilon
  );
};

const collisionAngleForPair = (
  movingCenter: Point2,
  stationaryCenter: Point2,
  endAngle: number,
): number | null => {
  const stack: Array<{ start: number; end: number; depth: number }> = [{ start: 0, end: endAngle, depth: 0 }];
  while (stack.length > 0) {
    const interval = stack.pop()!;
    const bounds = sweptSquareBounds(movingCenter, interval.start, interval.end);
    if (!boundsOverlapStationarySquare(bounds, stationaryCenter)) continue;

    const middle = (interval.start + interval.end) / 2;
    if (squaresHaveInteriorOverlap(movingCenter, stationaryCenter, middle)) return middle;
    if (interval.depth >= maxSweepSubdivisionDepth) continue;

    stack.push({ start: middle, end: interval.end, depth: interval.depth + 1 });
    stack.push({ start: interval.start, end: middle, depth: interval.depth + 1 });
  }
  return null;
};

const validateRigidRotationUncached = (
  cubies: Cubie[],
  candidate: RigidRotationCandidate,
  angle: TwistAngle,
): RotationLegality => {
  const basis = axisBasis(candidate.axis);
  if (!basis) {
    return {
      legal: false,
      code: 'unsupported-axis',
      message: `Rotation ${candidate.id} is blocked because its axis is not a unit X/Y/Z axis.`,
    };
  }

  const moving = cubies.filter((cubie) => candidate.selector(cubie.currentPosition));
  if (moving.length === 0) {
    return {
      legal: false,
      code: 'empty-target',
      message: `Rotation ${candidate.id} is blocked because it selects no cubies.`,
    };
  }

  if (Math.abs(angle) === 90 && !outerEnvelopeIsSquare(moving, candidate.pivot, basis)) {
    return {
      legal: false,
      code: 'outer-envelope-not-square',
      message: `Rotation ${candidate.id} is blocked because its outer quarter-turn envelope is not a square centered on the axis.`,
    };
  }

  if (!endpointCloses(moving, candidate, angle)) {
    return {
      legal: false,
      code: 'endpoint-not-closed',
      message: `Rotation ${candidate.id} is blocked because its endpoint does not close on the selected lattice sites.`,
    };
  }

  const movingIds = new Set(moving.map((cubie) => cubie.id));
  const pivotProjection = project(candidate.pivot, basis);
  const effectiveAngle = (angle * basis.sign * Math.PI) / 180;
  const stationaryByAxisCoordinate = new Map<number, Cubie[]>();
  for (const cubie of cubies) {
    if (movingIds.has(cubie.id)) continue;
    const coordinate = dot(cubie.currentPosition, basis.axis);
    const list = stationaryByAxisCoordinate.get(coordinate) ?? [];
    list.push(cubie);
    stationaryByAxisCoordinate.set(coordinate, list);
  }

  for (const movingCubie of moving) {
    const axisCoordinate = dot(movingCubie.currentPosition, basis.axis);
    const stationary = stationaryByAxisCoordinate.get(axisCoordinate) ?? [];
    if (stationary.length === 0) continue;

    const movingProjection = project(movingCubie.currentPosition, basis);
    const movingCenter: Point2 = [
      movingProjection[0] - pivotProjection[0],
      movingProjection[1] - pivotProjection[1],
    ];
    const broadBounds = sweptSquareBounds(movingCenter, 0, effectiveAngle);

    for (const blockingCubie of stationary) {
      const blockingProjection = project(blockingCubie.currentPosition, basis);
      const blockingCenter: Point2 = [
        blockingProjection[0] - pivotProjection[0],
        blockingProjection[1] - pivotProjection[1],
      ];
      if (!boundsOverlapStationarySquare(broadBounds, blockingCenter)) continue;

      const collisionAngle = collisionAngleForPair(movingCenter, blockingCenter, effectiveAngle);
      if (collisionAngle === null) continue;
      const progress = effectiveAngle === 0 ? 0 : collisionAngle / effectiveAngle;
      const collisionAngleDeg = angle * progress;
      return {
        legal: false,
        code: 'sweep-collision',
        message:
          `Rotation ${candidate.id} is blocked: ${movingCubie.id} sweeps through ` +
          `${blockingCubie.id} near ${collisionAngleDeg.toFixed(2)} degrees.`,
        movingCubieId: movingCubie.id,
        blockingCubieId: blockingCubie.id,
        collisionAngleDeg,
      };
    }
  }

  return legalResult();
};

const targetCache = new WeakMap<TurnTarget, Map<TwistAngle, RotationLegality>>();
const frameCache = new WeakMap<RotationFrame, Map<TwistAngle, RotationLegality>>();

const cachedValidation = <T extends object>(
  cache: WeakMap<T, Map<TwistAngle, RotationLegality>>,
  key: T,
  angle: TwistAngle,
  validate: () => RotationLegality,
): RotationLegality => {
  let byAngle = cache.get(key);
  if (!byAngle) {
    byAngle = new Map();
    cache.set(key, byAngle);
  }
  const cached = byAngle.get(angle);
  if (cached) return cached;
  const result = validate();
  byAngle.set(angle, result);
  // Once a quarter-turn closes on the same occupied support, +90, -90 and
  // 180 traverse the same geometric sweep (possibly reversed/repeated).
  // Sharing this result keeps legal-move enumeration from running CCD three times.
  if (Math.abs(angle) === 90 && (result.legal || result.code === 'sweep-collision')) {
    for (const equivalentAngle of [90, -90, 180] as const) {
      if (equivalentAngle === angle || result.legal) {
        byAngle.set(equivalentAngle, result);
      } else {
        byAngle.set(equivalentAngle, {
          legal: false,
          code: 'sweep-collision',
          message: 'Rotation is blocked by the same swept-volume collision as its equivalent quarter-turn.',
        });
      }
    }
  }
  return result;
};

/**
 * Validates a generated frame against the same rigid-body rule as extensions.
 * Results are cached because every legal move preserves the occupied lattice set.
 */
export const validateFrameRotation = (
  cubies: Cubie[],
  frame: RotationFrame,
  angle: TwistAngle,
): RotationLegality =>
  cachedValidation(frameCache, frame, angle, () =>
    validateRigidRotationUncached(
      cubies,
      {
        id: `frame:${frame.id}`,
        axis: frame.axis,
        pivot: [frame.axis[0] * frame.layer, frame.axis[1] * frame.layer, frame.axis[2] * frame.layer],
        selector: frame.selector,
      },
      angle,
    ));

/** Validates an extension/slab target using endpoint closure and swept-volume collision. */
export const validateTurnTargetRotation = (
  cubies: Cubie[],
  target: TurnTarget,
  angle: TwistAngle,
): RotationLegality =>
  cachedValidation(targetCache, target, angle, () =>
    validateRigidRotationUncached(
      cubies,
      { id: target.id, axis: target.axis, pivot: target.pivot, selector: target.selector },
      angle,
    ));

/** Covers the legacy one-cubie path so it cannot bypass the shared physical rule. */
export const validateCubieRotation = (
  cubies: Cubie[],
  cubieId: string,
  axis: Vector3Tuple,
  angle: TwistAngle,
): RotationLegality => {
  const cubie = cubies.find((candidate) => candidate.id === cubieId);
  if (!cubie) {
    return { legal: false, code: 'empty-target', message: `Rotation cubie:${cubieId} selects no cubie.` };
  }
  return validateRigidRotationUncached(
    cubies,
    {
      id: `cubie:${cubieId}`,
      axis,
      pivot: cubie.currentPosition,
      selector: (position) => positionKey(position) === positionKey(cubie.currentPosition),
    },
    angle,
  );
};

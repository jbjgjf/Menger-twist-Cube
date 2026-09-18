/**
 * Step 1 of the square-region rotation audit: reproduce the two rotations the
 * request describes, using nothing but the engine's own legality judge.
 *
 * Run: `npx tsx research/square-rotation/reproduce-four-block.ts` from the repo root.
 *
 * The claim under test is that at the solved state
 *   - Level 2: the four cells (+-2, +-2, 0) rotate 90 degrees about the Z axis
 *     through the origin, and
 *   - Level 3: the four cells (+-5, +-5, 0) do the same,
 * both pass `validateTurnTargetRotation`, while no *existing* turn target
 * selects that same set of cells. Nothing here is asserted from the request; the
 * verdicts and the cell sets are recomputed from the engine.
 */
import {
  createMengerPuzzleState,
  validateTurnTargetRotation,
} from '../../packages/engine/src/index';
import type { MengerPuzzleState, TurnTarget, TwistAngle } from '../../packages/engine/src/index';
import type { Vector3Tuple } from 'three';

const angles: TwistAngle[] = [90, -90, 180];

const key = (position: Vector3Tuple): string => position.join(',');

/**
 * A `TurnTarget` that selects exactly `cells`. The engine caches legality in a
 * `WeakMap` keyed by the target object, so a freshly built object can never read
 * a stale verdict left by a generated target.
 */
const candidateForCells = (
  id: string,
  cells: Vector3Tuple[],
  axisName: TurnTarget['axisName'],
  axis: Vector3Tuple,
  pivot: Vector3Tuple,
): TurnTarget => {
  const keys = new Set(cells.map(key));
  return {
    id,
    kind: 'extension',
    family: 'block',
    name: id,
    axisName,
    axis,
    scale: 1,
    depth: Number.NaN,
    pivot,
    selector: (position) => keys.has(key(position)),
    affectedCountEstimate: cells.length,
  };
};

const selectedCells = (state: MengerPuzzleState, target: TurnTarget): Vector3Tuple[] =>
  state.cubies
    .filter((cubie) => target.selector(cubie.currentPosition))
    .map((cubie) => cubie.currentPosition);

/** Every occupied cell of the plane `axisIndex = layer`, as a set of keys. */
const layerCells = (state: MengerPuzzleState, axisIndex: 0 | 1 | 2, layer: number): Vector3Tuple[] =>
  state.cubies
    .filter((cubie) => cubie.currentPosition[axisIndex] === layer)
    .map((cubie) => cubie.currentPosition);

const layerMap = (cells: Vector3Tuple[], extent: number): string => {
  const occupied = new Set(cells.map((cell) => `${cell[0]},${cell[1]}`));
  const lines: string[] = [];
  for (let y = extent; y >= -extent; y -= 1) {
    let line = '';
    for (let x = -extent; x <= extent; x += 1) line += occupied.has(`${x},${y}`) ? '#' : '.';
    lines.push(line);
  }
  return lines.join('\n');
};

const report = (level: number, corner: number) => {
  const state = createMengerPuzzleState(level);
  const extent = (3 ** level - 1) / 2;
  const cells: Vector3Tuple[] = [
    [corner, corner, 0],
    [-corner, corner, 0],
    [-corner, -corner, 0],
    [corner, -corner, 0],
  ];

  console.log(`\n=== Level ${level}: four cells (+-${corner}, +-${corner}, 0), Z axis through the origin ===`);

  const present = cells.filter((cell) => state.cubies.some((cubie) => key(cubie.currentPosition) === key(cell)));
  console.log(`cells that exist in the solved Menger set: ${present.length}/4`);

  const target = candidateForCells(`audit:L${level}:corners${corner}`, cells, 'Z', [0, 0, 1], [0, 0, 0]);
  const selected = selectedCells(state, target);
  console.log(`selector picks ${selected.length} cubies: ${selected.map(key).join(' | ')}`);

  for (const angle of angles) {
    const verdict = validateTurnTargetRotation(state.cubies, target, angle);
    console.log(`  angle ${angle}: legal=${verdict.legal}${verdict.code ? ` code=${verdict.code}` : ''}`);
  }

  // Is this set "all Menger cells of a square region", or a strict subset of one?
  const inRegion = layerCells(state, 2, 0).filter(
    (cell) => Math.abs(cell[0]) <= corner && Math.abs(cell[1]) <= corner,
  );
  console.log(
    `occupied cells of the ${2 * corner + 1}x${2 * corner + 1} region [-${corner},${corner}]^2 at z=0: ${inRegion.length}`,
  );
  console.log(`  region == the four cells: ${inRegion.length === 4 && inRegion.every((cell) => cells.some((c) => key(c) === key(cell)))}`);

  const plane = layerCells(state, 2, 0);
  console.log(`occupied cells in the whole z=0 plane: ${plane.length}`);
  console.log(layerMap(plane, extent));

  // Does any existing candidate select exactly these four cells?
  const wanted = new Set(cells.map(key));
  const sameSupport = state.turnTargets.filter((existing) => {
    const support = selectedCells(state, existing);
    return support.length === wanted.size && support.every((cell) => wanted.has(key(cell)));
  });
  console.log(`existing turn targets with the same support: ${sameSupport.length}`);

  // The weaker question: which existing targets are single-layer in z and how small do they get?
  const zSingleLayer = state.turnTargets.filter((existing) => {
    const support = selectedCells(state, existing);
    if (support.length === 0) return false;
    return support.every((cell) => cell[2] === 0) && existing.axisName === 'Z';
  });
  console.log(
    `existing Z-axis targets confined to the z=0 plane: ${zSingleLayer.length}` +
      (zSingleLayer.length > 0
        ? ` (support sizes ${[...new Set(zSingleLayer.map((t) => selectedCells(state, t).length))].sort((a, b) => a - b).join(',')})`
        : ''),
  );
};

report(2, 2);
report(3, 5);

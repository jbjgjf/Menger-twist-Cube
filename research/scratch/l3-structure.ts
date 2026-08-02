/**
 * Structure verification behind the Level 3 block-quotient solver
 * (`packages/solver-core/src/algorithms/level3BlockQuotientSolver.ts` and
 * `docs/algorithms/level3-block-quotient-solver.md`).
 *
 * Run: `npx tsx research/scratch/l3-structure.ts` from the repo root.
 *
 * Checks, in order:
 *   1. mid-block partition — the 8000 cells fall into 400 regions of 20 that are
 *      exactly the Level 2 site set;
 *   2. quotient exactness — every Level 2 turn target has a Level 3 target that
 *      moves precisely the cells of the blocks the macro target moves;
 *   3. legality lift — every macro-legal move lifts to a physically legal
 *      Level 3 move, so a macro solution never contains a blocked turn;
 *   4. the roll-orbit theorem — roll-legality is constant on every site orbit of
 *      the full move group, so a cell that can be rolled anywhere can be rolled
 *      at home. This is what lets the solver's last phase be a lookup.
 */
import type { Vector3Tuple } from 'three';
import {
  createMengerPuzzleState,
  rotatePosition,
  rotatePositionAroundPivot,
  validateFrameRotation,
  validateTurnTargetRotation,
} from '@menger/engine';

const angles = [90, -90, 180] as const;
const key = (p: Vector3Tuple) => p.join(',');
const failures: string[] = [];
const check = (ok: boolean, label: string, detail: string) => {
  if (!ok) failures.push(`${label}: ${detail}`);
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label} — ${detail}`);
};

const l2 = createMengerPuzzleState(2);
const l3 = createMengerPuzzleState(3);
const midBlockOf = (p: Vector3Tuple): Vector3Tuple => [
  Math.floor((p[0] + 13) / 3) - 4,
  Math.floor((p[1] + 13) / 3) - 4,
  Math.floor((p[2] + 13) / 3) - 4,
];

console.log('1. mid-block partition');
{
  const regions = new Map<string, number>();
  for (const cubie of l3.cubies) {
    const block = key(midBlockOf(cubie.homePosition as Vector3Tuple));
    regions.set(block, (regions.get(block) ?? 0) + 1);
  }
  const sizes = new Set(regions.values());
  const l2Sites = new Set(l2.cubies.map((cubie) => key(cubie.homePosition as Vector3Tuple)));
  const unmatched = [...regions.keys()].filter((block) => !l2Sites.has(block));
  check(
    regions.size === 400 && sizes.size === 1 && sizes.has(20) && unmatched.length === 0,
    'partition',
    `${regions.size} regions, cells per region ${[...sizes].join('/')}, ${unmatched.length} region(s) off the Level 2 lattice`,
  );
}

console.log('2. quotient exactness (macro selector == lifted selector)');
{
  const l3ById = new Map(l3.turnTargets.map((target) => [target.id, target]));
  let missing = 0;
  let mismatched = 0;
  let checked = 0;
  for (const macro of l2.turnTargets) {
    if (macro.kind !== 'extension') continue;
    const lifted = l3ById.get(macro.id);
    if (!lifted) {
      missing += 1;
      continue;
    }
    checked += 1;
    const geometryOk =
      lifted.scale === macro.scale * 3 &&
      lifted.depth === macro.depth &&
      lifted.axisName === macro.axisName &&
      lifted.pivot.every((value, axis) => Math.abs(value - macro.pivot[axis]! * 3) < 1e-9);
    const selectorOk = l3.cubies.every((cubie) => {
      const p = cubie.homePosition as Vector3Tuple;
      return lifted.selector(p) === macro.selector(midBlockOf(p));
    });
    if (!geometryOk || !selectorOk) mismatched += 1;
  }
  check(missing === 0 && mismatched === 0, 'extension targets', `${checked} shared ids, ${missing} missing, ${mismatched} mismatched`);

  let frameMismatch = 0;
  let frameChecked = 0;
  for (const macro of l2.frames) {
    const lifted = l3.frames.find(
      (frame) => frame.scale === macro.scale * 3 && frame.axisName === macro.axisName && frame.layer === macro.layer * 3,
    );
    if (!lifted) {
      frameMismatch += 1;
      continue;
    }
    frameChecked += 1;
    const selectorOk = l3.cubies.every((cubie) => {
      const p = cubie.homePosition as Vector3Tuple;
      return lifted.selector(p) === macro.selector(midBlockOf(p));
    });
    if (!selectorOk) frameMismatch += 1;
  }
  check(frameMismatch === 0, 'frames', `${frameChecked}/${l2.frames.length} lifted, ${frameMismatch} mismatched`);
}

console.log('3. legality lift (macro-legal implies Level 3 legal)');
{
  const l3ById = new Map(l3.turnTargets.map((target) => [target.id, target]));
  let macroLegal = 0;
  let violations = 0;
  for (const angle of angles) {
    for (const macro of l2.frames) {
      const lifted = l3.frames.find(
        (frame) => frame.scale === macro.scale * 3 && frame.axisName === macro.axisName && frame.layer === macro.layer * 3,
      )!;
      if (!validateFrameRotation(l2.cubies, macro, angle).legal) continue;
      macroLegal += 1;
      if (!validateFrameRotation(l3.cubies, lifted, angle).legal) violations += 1;
    }
    for (const macro of l2.turnTargets) {
      if (macro.kind !== 'extension') continue;
      if (!validateTurnTargetRotation(l2.cubies, macro, angle).legal) continue;
      macroLegal += 1;
      if (!validateTurnTargetRotation(l3.cubies, l3ById.get(macro.id)!, angle).legal) violations += 1;
    }
  }
  check(violations === 0, 'legality lift', `${macroLegal} macro-legal turns, ${violations} lift to a blocked Level 3 turn`);
}

console.log('4. roll-orbit theorem (roll-legality is constant on site orbits)');
{
  const sites = l3.cubies.map((cubie) => cubie.homePosition as Vector3Tuple);
  const indexOf = new Map(sites.map((p, i) => [key(p), i]));

  const parent = new Int32Array(sites.length).map((_, i) => i);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[x] !== root) {
      const next = parent[x]!;
      parent[x] = root;
      x = next;
    }
    return root;
  };
  const union = (from: number, to: number) => {
    const a = find(from);
    const b = find(to);
    if (a !== b) parent[a] = b;
  };

  let generators = 0;
  for (const frame of l3.frames) {
    for (const angle of angles) {
      if (!validateFrameRotation(l3.cubies, frame, angle).legal) continue;
      generators += 1;
      sites.forEach((p, i) => {
        if (frame.selector(p)) union(i, indexOf.get(key(rotatePosition(p, frame.axis, angle)))!);
      });
    }
  }
  for (const target of l3.turnTargets) {
    // depth-3 turns never move a cell, so they contribute nothing to site orbits
    if (target.kind !== 'extension' || target.depth === 3) continue;
    for (const angle of angles) {
      if (!validateTurnTargetRotation(l3.cubies, target, angle).legal) continue;
      generators += 1;
      sites.forEach((p, i) => {
        if (target.selector(p)) {
          union(i, indexOf.get(key(rotatePositionAroundPivot(p, target.axis, angle, target.pivot)))!);
        }
      });
    }
  }

  const rollStatus = new Array<string>(sites.length).fill('no-target');
  for (const target of l3.turnTargets) {
    if (target.kind !== 'extension' || target.depth !== 3 || target.scale !== 1) continue;
    const index = indexOf.get(key(target.pivot as Vector3Tuple));
    if (index === undefined) continue;
    rollStatus[index] = validateTurnTargetRotation(l3.cubies, target, 90).legal ? 'legal' : 'blocked';
  }

  const orbitStatuses = new Map<number, Set<string>>();
  for (let i = 0; i < sites.length; i += 1) {
    const root = find(i);
    const statuses = orbitStatuses.get(root) ?? new Set<string>();
    statuses.add(rollStatus[i]!);
    orbitStatuses.set(root, statuses);
  }
  const mixed = [...orbitStatuses.values()].filter((statuses) => statuses.size > 1).length;
  const counts = rollStatus.reduce<Record<string, number>>(
    (acc, status) => ({ ...acc, [status]: (acc[status] ?? 0) + 1 }),
    {},
  );
  check(
    mixed === 0,
    'roll-orbit theorem',
    `${generators} legal generators, ${orbitStatuses.size} site orbits, ${mixed} orbit(s) mixing legal and blocked rolls ` +
      `(sites: ${JSON.stringify(counts)})`,
  );
}

console.log(`\n${failures.length === 0 ? 'all structure checks passed' : `${failures.length} check(s) FAILED`}`);
if (failures.length > 0) process.exitCode = 1;

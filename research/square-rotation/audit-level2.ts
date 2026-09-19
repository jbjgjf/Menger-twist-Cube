/**
 * The Level 2 exhaustive audit: enumerate the extended model's candidates over
 * every axis, plane and axis position, judge each with the engine, and diff the
 * legal ones against the shipped move set.
 *
 * Run: `npx tsx research/square-rotation/audit-level2.ts` from the repo root.
 * Writes `research/square-rotation/out/l2-extended-moves.json` for the group
 * analysis that follows.
 *
 * Nothing here changes the shipped model: candidates are synthetic
 * `TurnTarget`s built in this module, and legality is the engine's verdict.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  createMengerPuzzleState,
  rotatePositionAroundPivot,
  validateTurnTargetRotation,
} from '../../packages/engine/src/index';
import type { TwistAngle } from '../../packages/engine/src/index';
import type { Vector3Tuple } from 'three';
import {
  allAngles,
  boundingBox,
  cellKey,
  enumerateRegionCandidates,
  enumerateSubsetCandidates,
  envelopeIsSquareOnAxis,
  targetForCells,
  type Candidate,
} from './model';
import { buildOperation, existingLegalOperations, type Operation } from './existing';

const level = 2;
const state = createMengerPuzzleState(level);
const cellSet = new Set(state.cubies.map((cubie) => cellKey(cubie.currentPosition)));

console.log(`=== Level ${level} extended-model audit ===`);
console.log(`cells ${state.cubies.length}, existing candidates ${state.turnTargets.length}`);

// ---------------------------------------------------------------- region family
const regions = enumerateRegionCandidates(state.cubies, level);
const censusByAngle = new Map<TwistAngle, Map<string, number>>();
const legalRegion: Array<{ candidate: Candidate; angle: TwistAngle }> = [];

/**
 * `rotationLegality.ts` runs the outer-envelope test only for `|angle| === 90`,
 * so a *rectangular* cross section can pass a 180-degree turn. That is outside
 * the model under audit ("a square whose centre the axis passes through"), so
 * the square condition is applied here explicitly at every angle and the
 * rectangles are counted as their own category instead of as primary legal
 * operations.
 */
const rectangle180: Array<{ candidate: Candidate; angle: TwistAngle }> = [];

for (const angle of allAngles) censusByAngle.set(angle, new Map());
for (const candidate of regions.candidates) {
  const target = targetForCells(candidate);
  const squareEnvelope = envelopeIsSquareOnAxis(candidate.cells, candidate.axisIndex, candidate.pivotInPlane);
  for (const angle of allAngles) {
    const verdict = validateTurnTargetRotation(state.cubies, target, angle);
    const code = verdict.legal
      ? squareEnvelope
        ? 'legal'
        : 'out-of-model:rectangle-180'
      : (verdict.code ?? 'unknown');
    const census = censusByAngle.get(angle)!;
    census.set(code, (census.get(code) ?? 0) + 1);
    if (!verdict.legal) continue;
    if (squareEnvelope) legalRegion.push({ candidate, angle });
    else rectangle180.push({ candidate, angle });
  }
}

console.log(
  `\n-- family "region": all occupied cells of an axis-parallel square region in one plane --`,
);
console.log(
  `enumerated regions: 3 axes x ${3 ** level} planes x ${
    Array.from({ length: 3 ** level }, (_, index) => (3 ** level - index) ** 2).reduce((a, b) => a + b, 0)
  } regions = ${3 * 3 ** level * Array.from({ length: 3 ** level }, (_, index) => (3 ** level - index) ** 2).reduce((a, b) => a + b, 0)}`,
);
console.log(
  `  empty (no occupied cell): ${regions.emptyRegions}; duplicate of a smaller region: ${regions.duplicateRegions}; distinct candidates: ${regions.candidates.length}`,
);
for (const angle of allAngles) {
  const census = censusByAngle.get(angle)!;
  const parts = [...census.entries()].sort((a, b) => b[1] - a[1]).map(([code, count]) => `${code}=${count}`);
  console.log(`  angle ${String(angle).padStart(3)}: ${parts.join(', ')}`);
}

const rectangleTargets = new Set(
  rectangle180.map((entry) => `${entry.candidate.axisIndex}:${entry.candidate.layers[0]}:${entry.candidate.cells.map(cellKey).sort().join(';')}`),
);
console.log(
  `  separate category, rectangular cross section at 180 degrees (outside the primary model, the judge does not ` +
    `test the envelope at 180): ${rectangle180.length} (candidate, angle) pairs over ${rectangleTargets.size} distinct supports`,
);

// ---------------------------------------------------------------- subset family
const subsets = enumerateSubsetCandidates(state.cubies, level);
console.log(`\n-- family "subset": any set whose outer box is a square centred on the axis --`);
console.log(
  `planes visited ${subsets.stats.planes}, orbit-pair implications ${subsets.stats.implications}, ` +
    `hard-blocked orbits ${subsets.stats.hardBlockedOrbits}, closed sets ${subsets.stats.closedSets}, ` +
    `candidates after the square-box filter ${subsets.candidates.length}, capped pivots ${subsets.stats.cappedPivots.length}`,
);

// Re-judge every enumerated subset against the *full* puzzle. The enumeration
// argued legality from pairwise orbit probes; this is the check of that argument.
const legalSubset: Array<{ candidate: Candidate; angle: TwistAngle }> = [];
const subsetRejections = new Map<string, number>();
for (const candidate of subsets.candidates) {
  const target = targetForCells(candidate);
  for (const angle of allAngles) {
    const verdict = validateTurnTargetRotation(state.cubies, target, angle);
    if (verdict.legal) legalSubset.push({ candidate, angle });
    else subsetRejections.set(verdict.code ?? 'unknown', (subsetRejections.get(verdict.code ?? 'unknown') ?? 0) + 1);
  }
}
console.log(
  `engine verdicts on the subset family: legal ${legalSubset.length} of ${subsets.candidates.length * 3} ` +
    `(candidate, angle) pairs; rejections ${[...subsetRejections.entries()].map(([code, count]) => `${code}=${count}`).join(', ') || 'none'}`,
);

// ------------------------------------------------- additional operation set
const additional = new Map<
  string,
  Operation & { family: string; side: number; boxMin: [number, number]; boxSide: [number, number] }
>();
for (const { candidate, angle } of [...legalRegion, ...legalSubset]) {
  const operation = buildOperation(
    candidate.id,
    'additional',
    [0, 0, 0].map((_, index) => (index === candidate.axisIndex ? 1 : 0)) as Vector3Tuple,
    candidate.pivot,
    angle,
    candidate.cells,
  );
  const box = boundingBox(candidate.cells, candidate.axisIndex);
  if (!additional.has(operation.supportKey)) {
    additional.set(operation.supportKey, {
      ...operation,
      family: candidate.family,
      side: box.side[0],
      boxMin: box.min,
      boxSide: box.side,
    });
  }
}

const legalRegionKeys = new Set(
  legalRegion.map(({ candidate, angle }) =>
    buildOperation(
      candidate.id,
      'additional',
      [0, 0, 0].map((_, index) => (index === candidate.axisIndex ? 1 : 0)) as Vector3Tuple,
      candidate.pivot,
      angle,
      candidate.cells,
    ).supportKey,
  ),
);
const legalSubsetKeys = new Set(
  legalSubset.map(({ candidate, angle }) =>
    buildOperation(
      candidate.id,
      'additional',
      [0, 0, 0].map((_, index) => (index === candidate.axisIndex ? 1 : 0)) as Vector3Tuple,
      candidate.pivot,
      angle,
      candidate.cells,
    ).supportKey,
  ),
);
const regionNotInSubset = [...legalRegionKeys].filter((key) => !legalSubsetKeys.has(key));
console.log(
  `\nlegal region operations ${legalRegionKeys.size}, legal subset operations ${legalSubsetKeys.size}; ` +
    `region-legal missing from the subset enumeration: ${regionNotInSubset.length} (must be 0 if the closure argument is exhaustive)`,
);

// ---------------------------------------------------------------- the diff
const existing = existingLegalOperations(state);
const existingBySupport = new Map(existing.map((operation) => [operation.supportKey, operation]));
const existingByAction = new Map(existing.map((operation) => [operation.actionKey, operation]));

const sameSupport = [...additional.values()].filter((operation) => existingBySupport.has(operation.supportKey));
const sameAction = [...additional.values()].filter((operation) => existingByAction.has(operation.actionKey));
const genuinelyNew = [...additional.values()].filter((operation) => !existingByAction.has(operation.actionKey));

console.log(`\n-- diff against the shipped move set --`);
console.log(`existing legal atomic moves: ${existing.length}`);
console.log(`extended-model legal atomic moves: ${additional.size}`);
console.log(`  duplicates by support (same cells, axis, pivot, angle): ${sameSupport.length}`);
console.log(`  duplicates by action (same map on every cell's position and orientation): ${sameAction.length}`);
console.log(`  additional atomic moves not matching any existing action: ${genuinelyNew.length}`);
const newActions = new Set(genuinelyNew.map((operation) => operation.actionKey));
console.log(`  distinct additional actions: ${newActions.size}`);
const newTargets = new Set(genuinelyNew.map((operation) => operation.supportKey.split('|').slice(0, 2).concat(operation.support.map(cellKey).sort()).join('|')));
console.log(`  distinct additional targets (support + axis + pivot, angles collapsed): ${newTargets.size}`);

// ---------------------------------------------------------------- examples
const targetsOnly = new Map<string, (typeof genuinelyNew)[number]>();
for (const operation of genuinelyNew) {
  const key = `${operation.axis.join(',')}|${operation.pivot.join(',')}|${operation.support.map(cellKey).sort().join(';')}`;
  if (!targetsOnly.has(key)) targetsOnly.set(key, operation);
}
const ordered = [...targetsOnly.values()].sort(
  (a, b) =>
    a.axis.findIndex((v) => v === 1) - b.axis.findIndex((v) => v === 1) ||
    a.pivot[a.axis.findIndex((v) => v === 1)]! - b.pivot[b.axis.findIndex((v) => v === 1)]! ||
    a.support.length - b.support.length,
);
console.log(`\n-- every additional target (all ${ordered.length}); each is legal at 90, -90 and 180 --`);
console.log('axis layer  in-plane square range      in-plane centre  cells  cell coordinates');
for (const operation of ordered) {
  const axisIndex = operation.axis.findIndex((value) => value === 1);
  const layer = operation.pivot[axisIndex]!;
  const [iu, iv] = [
    [1, 2],
    [2, 0],
    [0, 1],
  ][axisIndex]!;
  const range = `[${operation.boxMin[0]}..${operation.boxMin[0] + operation.boxSide[0] - 1}]x[${operation.boxMin[1]}..${operation.boxMin[1] + operation.boxSide[1] - 1}]`;
  const centre = `(${operation.pivot[iu]},${operation.pivot[iv]})`;
  const coords = operation.support
    .map((cell) => `(${cell[iu]},${cell[iv]})`)
    .sort()
    .join(' ');
  console.log(
    `${['X', 'Y', 'Z'][axisIndex]}    ${String(layer).padStart(3)}   ${range.padEnd(24)} ${centre.padEnd(15)} ${String(operation.support.length).padStart(4)}   ${coords.length > 110 ? `${coords.slice(0, 110)}...` : coords}`,
  );
}

const perPlane = new Map<string, number>();
for (const operation of ordered) {
  const axisIndex = operation.axis.findIndex((value) => value === 1);
  const key = `${['X', 'Y', 'Z'][axisIndex]}${operation.pivot[axisIndex]}`;
  perPlane.set(key, (perPlane.get(key) ?? 0) + 1);
}
console.log(
  `\nadditional targets per plane: ${[...perPlane.entries()].map(([plane, count]) => `${plane}=${count}`).join(', ')}`,
);
const offCentre = ordered.filter((operation) => {
  const axisIndex = operation.axis.findIndex((value) => value === 1);
  const [iu, iv] = [
    [1, 2],
    [2, 0],
    [0, 1],
  ][axisIndex]!;
  return operation.pivot[iu] !== 0 || operation.pivot[iv] !== 0;
});
console.log(
  `additional targets whose in-plane axis is NOT the plane centre: ${offCentre.length} ` +
    `(the enumeration covered ${((2 * 4 + 1) ** 2 + (2 * 4) ** 2)} in-plane axis positions per plane, ` +
    `including half-integer centres)`,
);

// ------------------------------------------------- reversibility and cell count
let roundTripFailures = 0;
let cellCountFailures = 0;
for (const operation of genuinelyNew) {
  const moved = operation.support.map((cell) =>
    rotatePositionAroundPivot(cell, operation.axis, operation.angle, operation.pivot),
  );
  const movedKeys = new Set(moved.map(cellKey));
  if (movedKeys.size !== operation.support.length) cellCountFailures += 1;
  if ([...movedKeys].some((key) => !cellSet.has(key))) cellCountFailures += 1;
  const back = moved.map((cell) =>
    rotatePositionAroundPivot(cell, operation.axis, (-operation.angle) as TwistAngle, operation.pivot),
  );
  const backKeys = back.map(cellKey).sort().join(';');
  if (backKeys !== operation.support.map(cellKey).sort().join(';')) roundTripFailures += 1;
}
console.log(
  `\nround trip (apply then inverse) failures: ${roundTripFailures}; ` +
    `cell loss/duplication failures: ${cellCountFailures} (over ${genuinelyNew.length} additional moves)`,
);

// ---------------------------------------------------------------- handoff
const outDir = new URL('./out/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const payload = {
  level,
  generatedAt: new Date().toISOString(),
  cells: state.cubies.map((cubie) => cubie.currentPosition),
  existing: existing.map((operation) => ({
    id: operation.id,
    axis: operation.axis,
    pivot: operation.pivot,
    angle: operation.angle,
    support: operation.support,
  })),
  additional: [...additional.values()]
    .filter((operation) => !existingByAction.has(operation.actionKey))
    .map((operation) => ({
      id: operation.id,
      family: operation.family,
      axis: operation.axis,
      pivot: operation.pivot,
      angle: operation.angle,
      side: operation.side,
      support: operation.support,
    })),
};
writeFileSync(new URL('l2-extended-moves.json', outDir), `${JSON.stringify(payload)}\n`);
console.log(
  `\nwrote research/square-rotation/out/l2-extended-moves.json ` +
    `(${payload.existing.length} existing + ${payload.additional.length} additional atomic moves)`,
);

/**
 * The two extensions that are deliberately kept *out* of the primary
 * single-layer square model, counted separately so they never enter its diff.
 *
 * Run: `npx tsx research/square-rotation/extensions-count.ts` from the repo root.
 *
 * A. **Thick square prisms.** A contiguous range of layers, the same
 *    axis-parallel square region in each, all occupied cells selected. The
 *    single-layer case is the primary model and is excluded here. Only
 *    *prisms* are enumerated: a rigid body whose cross section differs from
 *    layer to layer, or whose layers are non-contiguous, is also physically
 *    rigid but is out of scope for this count.
 * B. **Rectangular cross section at 180 degrees.** The judge tests the outer
 *    envelope only for `|angle| === 90`, so a rectangle can pass a half turn.
 *    Outside the model ("a square whose centre the axis passes through"), but
 *    it is what the current implementation permits, so it is worth a number.
 */
import {
  createMengerPuzzleState,
  createPuzzleConfig,
  validateTurnTargetRotation,
} from '../../packages/engine/src/index';
import type { TwistAngle } from '../../packages/engine/src/index';
import type { Vector3Tuple } from 'three';
import {
  allAngles,
  axisNames,
  axisVectorFor,
  boundingBox,
  cellKey,
  enumerateRegionCandidates,
  envelopeIsSquareOnAxis,
  perpIndicesFor,
  pivot3D,
  targetForCells,
  type AxisIndex,
  type Candidate,
} from './model';
import { buildOperation, existingLegalOperations } from './existing';

const level = 2;
const state = createMengerPuzzleState(level);
const config = createPuzzleConfig(level);
const existing = existingLegalOperations(state);
const existingByAction = new Map(existing.map((operation) => [operation.actionKey, operation]));

console.log(`=== Level ${level}: extensions counted apart from the primary model ===`);

// ------------------------------------------------------- A. thick square prisms
let thickCandidates = 0;
let thickEmpty = 0;
const thickCensus = new Map<string, number>();
const thickLegal: Array<{ candidate: Candidate; angle: TwistAngle }> = [];
const thickSeen = new Set<string>();

for (const axisIndex of [0, 1, 2] as AxisIndex[]) {
  const [iu, iv] = perpIndicesFor[axisIndex];
  for (let lowIndex = 0; lowIndex < config.gridSize; lowIndex += 1) {
    for (let highIndex = lowIndex + 1; highIndex < config.gridSize; highIndex += 1) {
      const layers = config.coordinates.slice(lowIndex, highIndex + 1);
      const inRange = state.cubies.filter((cubie) => layers.includes(cubie.currentPosition[axisIndex]!));
      for (let side = 1; side <= config.gridSize; side += 1) {
        for (let minU = -config.extent; minU + side - 1 <= config.extent; minU += 1) {
          for (let minV = -config.extent; minV + side - 1 <= config.extent; minV += 1) {
            const cells = inRange
              .filter((cubie) => {
                const u = cubie.currentPosition[iu]!;
                const v = cubie.currentPosition[iv]!;
                return u >= minU && u <= minU + side - 1 && v >= minV && v <= minV + side - 1;
              })
              .map((cubie) => cubie.currentPosition);
            if (cells.length === 0) {
              thickEmpty += 1;
              continue;
            }
            const pivotInPlane: [number, number] = [minU + (side - 1) / 2, minV + (side - 1) / 2];
            const signature = `${axisIndex}:${layers[0]}-${layers[layers.length - 1]}:${pivotInPlane.join(',')}:${cells
              .map(cellKey)
              .sort()
              .join('|')}`;
            if (thickSeen.has(signature)) continue;
            thickSeen.add(signature);
            thickCandidates += 1;

            const candidate: Candidate = {
              id: `prism:${axisNames[axisIndex]}${layers[0]}..${layers[layers.length - 1]}:c${pivotInPlane.join('_')}:s${side}`,
              family: 'region',
              axisIndex,
              axisName: axisNames[axisIndex],
              layers,
              pivot: pivot3D(axisIndex, layers[0]!, pivotInPlane),
              pivotInPlane,
              regionSide: side,
              regionMin: [minU, minV],
              cells,
            };
            const squareEnvelope = envelopeIsSquareOnAxis(cells, axisIndex, pivotInPlane);
            const target = targetForCells(candidate);
            for (const angle of allAngles) {
              const verdict = validateTurnTargetRotation(state.cubies, target, angle);
              const code = verdict.legal
                ? squareEnvelope
                  ? 'legal'
                  : 'out-of-model:rectangle-180'
                : (verdict.code ?? 'unknown');
              thickCensus.set(code, (thickCensus.get(code) ?? 0) + 1);
              if (verdict.legal && squareEnvelope) thickLegal.push({ candidate, angle });
            }
          }
        }
      }
    }
  }
}

const thickOperations = new Map<string, ReturnType<typeof buildOperation>>();
for (const { candidate, angle } of thickLegal) {
  const operation = buildOperation(
    candidate.id,
    'additional',
    axisVectorFor[candidate.axisIndex],
    candidate.pivot,
    angle,
    candidate.cells,
  );
  if (!thickOperations.has(operation.supportKey)) thickOperations.set(operation.supportKey, operation);
}
const thickNew = [...thickOperations.values()].filter((operation) => !existingByAction.has(operation.actionKey));
const thickNewTargets = new Set(
  thickNew.map((operation) => `${operation.axis.join(',')}|${operation.support.map(cellKey).sort().join(';')}`),
);

console.log(`\n-- A. thick square prisms (thickness >= 2 layers, contiguous, same cross section) --`);
console.log(`distinct candidates ${thickCandidates} (empty regions skipped: ${thickEmpty})`);
console.log(
  `  verdicts: ${[...thickCensus.entries()].sort((a, b) => b[1] - a[1]).map(([code, count]) => `${code}=${count}`).join(', ')}`,
);
console.log(
  `  legal atomic moves ${thickOperations.size}; of those matching no existing action ${thickNew.length} ` +
    `over ${thickNewTargets.size} distinct targets`,
);
const thickByShape = new Map<string, number>();
for (const operation of thickNew) {
  const axisIndex = operation.axis.findIndex((value) => value === 1);
  const layers = new Set(operation.support.map((cell) => cell[axisIndex]!));
  const box = boundingBox(operation.support, axisIndex as AxisIndex);
  const shape = `thickness ${layers.size} x side ${box.side[0]} (${operation.support.length} cells)`;
  thickByShape.set(shape, (thickByShape.get(shape) ?? 0) + 1);
}
for (const [shape, count] of [...thickByShape.entries()].sort()) {
  console.log(`    ${shape}: ${count} atomic moves`);
}

// --------------------------------------------- B. rectangular 180-degree turns
const regions = enumerateRegionCandidates(state.cubies, level);
const rectangleOperations = new Map<string, ReturnType<typeof buildOperation>>();
for (const candidate of regions.candidates) {
  if (envelopeIsSquareOnAxis(candidate.cells, candidate.axisIndex, candidate.pivotInPlane)) continue;
  const target = targetForCells(candidate);
  if (!validateTurnTargetRotation(state.cubies, target, 180).legal) continue;
  const operation = buildOperation(
    candidate.id,
    'additional',
    axisVectorFor[candidate.axisIndex],
    candidate.pivot,
    180,
    candidate.cells,
  );
  if (!rectangleOperations.has(operation.supportKey)) rectangleOperations.set(operation.supportKey, operation);
}
const rectangleNew = [...rectangleOperations.values()].filter(
  (operation) => !existingByAction.has(operation.actionKey),
);
console.log(`\n-- B. rectangular cross section, 180 degrees only, single layer --`);
console.log(
  `legal under the current judge: ${rectangleOperations.size} atomic moves; matching no existing action: ${rectangleNew.length}`,
);
const rectShapes = new Map<string, number>();
for (const operation of rectangleNew) {
  const axisIndex = operation.axis.findIndex((value) => value === 1) as AxisIndex;
  const box = boundingBox(operation.support, axisIndex);
  const shape = `${Math.min(...box.side)}x${Math.max(...box.side)} box, ${operation.support.length} cells`;
  rectShapes.set(shape, (rectShapes.get(shape) ?? 0) + 1);
}
for (const [shape, count] of [...rectShapes.entries()].sort()) console.log(`    ${shape}: ${count}`);
const sample = rectangleNew.slice(0, 4);
for (const operation of sample) {
  const axisIndex = operation.axis.findIndex((value) => value === 1) as AxisIndex;
  const [iu, iv] = perpIndicesFor[axisIndex];
  console.log(
    `    example ${axisNames[axisIndex]} layer ${operation.pivot[axisIndex]}, centre (${operation.pivot[iu]},${operation.pivot[iv]}), ` +
      `cells ${operation.support.map((cell) => `(${cell[iu]},${cell[iv]})`).sort().join(' ')}`,
  );
}
const rectVector: Vector3Tuple[] = [];
console.log(
  `\nNeither extension is included in the primary model's counts. Thick prisms would add ` +
    `${thickNewTargets.size} targets and rectangle-180 would add ${rectangleNew.length} atomic moves if adopted.` +
    `${rectVector.length === 0 ? '' : ''}`,
);

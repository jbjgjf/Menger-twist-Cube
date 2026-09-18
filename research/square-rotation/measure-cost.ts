/**
 * Cost and size measurement before the full audit runs, per the instruction to
 * start heavy computations small and estimate time and memory first.
 *
 * Run: `npx tsx research/square-rotation/measure-cost.ts` from the repo root.
 */
import { createMengerPuzzleState } from '../../packages/engine/src/index';
import {
  allAngles,
  enumerateRegionCandidates,
  enumerateSubsetCandidates,
  targetForCells,
  type AxisIndex,
} from './model';
import { validateTurnTargetRotation } from '../../packages/engine/src/index';

const heapMb = () => Math.round(process.memoryUsage().heapUsed / 1e5) / 10;

/**
 * Level 3 is measured on a sample only. Its region family is two orders of
 * magnitude larger than Level 2's and each verdict scans 8,000 cells, so the
 * full Level 3 sweep belongs to the next phase, not to this measurement.
 */
const legalitySampleSize = 2000;

for (const level of [2, 3]) {
  const state = createMengerPuzzleState(level);
  console.log(`\n=== level ${level}: ${state.cubies.length} cells ===`);

  let start = Date.now();
  const regions = enumerateRegionCandidates(state.cubies, level);
  const regionMs = Date.now() - start;
  console.log(
    `region family: ${regions.candidates.length} candidates ` +
      `(empty regions ${regions.emptyRegions}, duplicate regions ${regions.duplicateRegions}) in ${regionMs} ms`,
  );

  const sample =
    regions.candidates.length <= legalitySampleSize
      ? regions.candidates
      : regions.candidates.filter(
          (_, index) => index % Math.ceil(regions.candidates.length / legalitySampleSize) === 0,
        );
  start = Date.now();
  let legal = 0;
  for (const candidate of sample) {
    const target = targetForCells(candidate);
    for (const angle of allAngles) {
      if (validateTurnTargetRotation(state.cubies, target, angle).legal) legal += 1;
    }
  }
  const legalityMs = Date.now() - start;
  console.log(
    `region legality pass over ${sample.length} sampled candidates: ${legal} legal (candidate, angle) pairs ` +
      `in ${legalityMs} ms; full family extrapolates to ` +
      `~${Math.round((legalityMs * regions.candidates.length) / sample.length / 1000)} s`,
  );

  // The subset family is the expensive one: it probes orbit pairs through the
  // engine. Measure one plane, then extrapolate over planes and axes.
  start = Date.now();
  const onePlane = enumerateSubsetCandidates(state.cubies, level, {
    planeFilter: (axisIndex: AxisIndex, layer: number) => axisIndex === 2 && layer === 0,
  });
  const planeMs = Date.now() - start;
  const planes = 3 * 3 ** level;
  console.log(
    `subset family, Z0 plane only: ${onePlane.candidates.length} candidates in ${planeMs} ms ` +
      `(orbit-pair implications ${onePlane.stats.implications}, closed sets ${onePlane.stats.closedSets}, ` +
      `hard-blocked orbits ${onePlane.stats.hardBlockedOrbits}, capped pivots ${onePlane.stats.cappedPivots.length})`,
  );
  console.log(
    `  extrapolated over ${planes} planes: ~${Math.round((planeMs * planes) / 1000)} s, heap now ${heapMb()} MB`,
  );
}

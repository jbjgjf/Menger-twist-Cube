/**
 * Does the engine's legality cache change any verdict in this audit?
 *
 * Run: `npx tsx research/square-rotation/cache-assumption.ts` from the repo root.
 *
 * `cachedValidation` in `rotationLegality.ts` stores results per (target object,
 * angle) in a `WeakMap`, and when a quarter turn comes back `legal` or
 * `sweep-collision` it *also* writes that verdict under the other two angles:
 *
 *   if (Math.abs(angle) === 90 && (result.legal || result.code === 'sweep-collision'))
 *
 * So whichever angle is asked first can decide the other two. For a set closed
 * under the quarter turn the sharing is sound — R(90) maps the selected set onto
 * itself, so the 180-degree sweep is the 90-degree sweep traversed twice over
 * the same region, and the -90 sweep is the same region traversed backwards —
 * but the audit should not *depend* on that argument being right. Two things are
 * checked here:
 *
 * 1. Asking 180 first (on a fresh target, so the cache is empty) gives the same
 *    verdict as asking it after 90 and -90. This is the case that matters: the
 *    rectangular cross sections are only reachable at 180, and the envelope
 *    stage is skipped there.
 * 2. Every angle order over {90, -90, 180} gives the same three verdicts.
 */
import { createMengerPuzzleState, validateTurnTargetRotation } from '../../packages/engine/src/index';
import type { TwistAngle } from '../../packages/engine/src/index';
import { allAngles, enumerateRegionCandidates, targetForCells } from './model';

const orders: TwistAngle[][] = [
  [90, -90, 180],
  [180, 90, -90],
  [-90, 180, 90],
  [180, -90, 90],
];

for (const level of [2]) {
  const state = createMengerPuzzleState(level);
  const regions = enumerateRegionCandidates(state.cubies, level);
  console.log(`=== level ${level}: ${regions.candidates.length} region candidates, ${orders.length} angle orders ===`);

  let disagreements = 0;
  const verdictsByOrder = orders.map(() => new Map<string, string>());

  orders.forEach((order, orderIndex) => {
    for (const candidate of regions.candidates) {
      // A fresh target per order: the WeakMap is keyed by object identity, so
      // this is what makes each order start from an empty cache.
      const target = targetForCells(candidate);
      for (const angle of order) {
        const verdict = validateTurnTargetRotation(state.cubies, target, angle);
        verdictsByOrder[orderIndex]!.set(
          `${candidate.id}@${angle}`,
          verdict.legal ? 'legal' : `illegal:${verdict.code}`,
        );
      }
    }
  });

  const reference = verdictsByOrder[0]!;
  for (const [key, value] of reference) {
    for (let orderIndex = 1; orderIndex < orders.length; orderIndex += 1) {
      if (verdictsByOrder[orderIndex]!.get(key) !== value) {
        if (disagreements < 5) {
          console.log(
            `  disagreement on ${key}: order ${orders[0]!.join('/')} says ${value}, ` +
              `order ${orders[orderIndex]!.join('/')} says ${verdictsByOrder[orderIndex]!.get(key)}`,
          );
        }
        disagreements += 1;
      }
    }
  }

  const legalCounts = orders.map((_order, orderIndex) =>
    allAngles.map(
      (angle) =>
        [...verdictsByOrder[orderIndex]!.entries()].filter(
          ([key, value]) => key.endsWith(`@${angle}`) && value === 'legal',
        ).length,
    ),
  );
  orders.forEach((order, orderIndex) => {
    console.log(
      `  order ${order.join('/').padEnd(12)} legal counts per angle (90,-90,180): ${legalCounts[orderIndex]!.join(', ')}`,
    );
  });
  console.log(`  verdict disagreements across angle orders: ${disagreements}`);
}

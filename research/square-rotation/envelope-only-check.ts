/**
 * Is checking only the cells on the outer square (the "envelope") enough, or
 * must every selected cell be checked for sweep collisions?
 *
 * Run: `node --import tsx research/square-rotation/envelope-only-check.ts`
 *
 * For every Level 2 candidate of both families whose endpoint closes, compare
 *   full:          the judge on the real selection (every selected cell moves
 *                  and is checked against every unselected cell);
 *   envelope-only: the judge on a world holding only the boundary cells of the
 *                  selection's bounding square plus the unselected cells, with
 *                  the boundary cells as the selection. Interior selected cells
 *                  are left out entirely, i.e. never checked.
 * The boundary of a square centred on the pivot maps to itself under 90 and
 * 180 degree turns, so the envelope-only selection still closes and the judge
 * can only disagree through the sweep stage.
 *
 * A candidate that is envelope-only legal but fully illegal is a counterexample
 * to "the envelope check suffices". The reverse cannot happen (fewer moving
 * cells, fewer pairs), which is checked too.
 */
import { Quaternion } from 'three';
import type { Vector3Tuple } from 'three';
import { createMengerPuzzleState, validateTurnTargetRotation } from '../../packages/engine/src/index';
import type { Cubie, TwistAngle } from '../../packages/engine/src/index';
import { allAngles, boundingBox, cellKey, enumerateRegionCandidates, enumerateSubsetCandidates, perpIndicesFor, targetForCells } from './model';
import type { Candidate } from './model';

const probeCubie = (position: Vector3Tuple): Cubie => ({
  id: `probe_${cellKey(position)}`,
  homePosition: position,
  currentPosition: position,
  orientation: new Quaternion(),
  type: 'outer',
});

export interface EnvelopeComparison {
  compared: number;
  bothLegal: number;
  bothIllegal: number;
  envelopeOnlyLegalButFullyIllegal: Array<{ id: string; angle: TwistAngle; cells: number; boundaryCells: number; blocker: string; mover: string }>;
  fullyLegalButEnvelopeIllegal: number;
}

export const compareEnvelopeOnly = (level: number): EnvelopeComparison => {
  const cubies = createMengerPuzzleState(level).cubies as Cubie[];
  const candidates: Candidate[] = [
    ...enumerateRegionCandidates(cubies, level).candidates,
    ...enumerateSubsetCandidates(cubies, level).candidates,
  ];
  const result: EnvelopeComparison = {
    compared: 0,
    bothLegal: 0,
    bothIllegal: 0,
    envelopeOnlyLegalButFullyIllegal: [],
    fullyLegalButEnvelopeIllegal: 0,
  };
  for (const candidate of candidates) {
    const [iu, iv] = perpIndicesFor[candidate.axisIndex];
    const box = boundingBox(candidate.cells, candidate.axisIndex);
    // Only square boxes centred on the pivot have a rotation-invariant boundary.
    if (box.side[0] !== box.side[1] || box.centre[0] !== candidate.pivotInPlane[0] || box.centre[1] !== candidate.pivotInPlane[1]) continue;
    const boundary = candidate.cells.filter(
      (cell) => cell[iu] === box.min[0] || cell[iu] === box.max[0] || cell[iv] === box.min[1] || cell[iv] === box.max[1],
    );
    const selected = new Set(candidate.cells.map(cellKey));
    const unselected = cubies.map((cubie) => cubie.currentPosition).filter((position) => !selected.has(cellKey(position)));
    for (const angle of allAngles) {
      const full = validateTurnTargetRotation(cubies, targetForCells({ ...candidate, id: `${candidate.id}#full${angle}` }), angle);
      if (!full.legal && full.code !== 'sweep-collision') continue; // closure or envelope failure: not a sweep question
      const envelopeWorld = [...boundary, ...unselected].map(probeCubie);
      const envelope = validateTurnTargetRotation(
        envelopeWorld,
        targetForCells({ ...candidate, id: `${candidate.id}#env${angle}`, cells: boundary }),
        angle,
      );
      if (!envelope.legal && envelope.code !== 'sweep-collision') {
        throw new Error(`envelope-only probe failed for ${envelope.code} on ${candidate.id}@${angle}`);
      }
      result.compared += 1;
      if (full.legal && envelope.legal) result.bothLegal += 1;
      else if (!full.legal && !envelope.legal) result.bothIllegal += 1;
      else if (full.legal) result.fullyLegalButEnvelopeIllegal += 1;
      else {
        const mover = cubies.find((cubie) => cubie.id === full.movingCubieId)?.currentPosition;
        const blocker = cubies.find((cubie) => cubie.id === full.blockingCubieId)?.currentPosition;
        result.envelopeOnlyLegalButFullyIllegal.push({
          id: candidate.id,
          angle,
          cells: candidate.cells.length,
          boundaryCells: boundary.length,
          mover: mover ? cellKey(mover) : String(full.movingCubieId),
          blocker: blocker ? cellKey(blocker) : String(full.blockingCubieId),
        });
      }
    }
  }
  return result;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const started = performance.now();
  const result = compareEnvelopeOnly(2);
  console.log('=== Level 2: envelope-only sweep check vs full sweep check ===');
  console.log(
    `compared ${result.compared} (candidate, angle) pairs that pass closure: both legal ${result.bothLegal}, both illegal ` +
      `${result.bothIllegal}, envelope-only legal but fully illegal ${result.envelopeOnlyLegalButFullyIllegal.length}, ` +
      `fully legal but envelope-only illegal ${result.fullyLegalButEnvelopeIllegal}`,
  );
  for (const row of result.envelopeOnlyLegalButFullyIllegal.slice(0, 8)) {
    console.log(`  ${row.id}@${row.angle}: ${row.cells} cells (${row.boundaryCells} on the boundary); interior ${row.mover} sweeps ${row.blocker}`);
  }
  console.log(`elapsed ${Math.round(performance.now() - started)}ms`);
}

/**
 * An exact, engine-independent sufficient condition for "this rotation sweeps
 * through no stationary cell", applied to every atom of H (468 existing + 54
 * additional, read from `out/l2-extended-moves.json`).
 *
 * Run: `node --import tsx research/square-rotation/exact-sweep-certificate.ts`
 * Writes `research/square-rotation/out/l2-exact-sweep.json`.
 *
 * Why this exists. The engine's "legal" verdict is an implementation verdict:
 * floating-point SAT tests at interval midpoints, subdivided to depth 16. It is
 * not a proof of collision-freeness. This script tries to *prove* it with
 * integer arithmetic only, so the audit can say, per atom, whether the verdict
 * is backed by a proof or only by the judge.
 *
 * The argument (annulus separation). Work in the plane perpendicular to the
 * axis, coordinates relative to the pivot, doubled so every centre is an
 * integer (pivots may be half-integers). A unit square with doubled centre
 * (U, V) has half-width 1, and the distances from the axis to its points fill
 * exactly [rMin, rMax] with
 *
 *   rMin^2 = max(0,|U|-1)^2 + max(0,|V|-1)^2,   rMax^2 = (|U|+1)^2 + (|V|+1)^2.
 *
 * Rotation about the axis preserves distance, so for *every* angle the moving
 * square stays inside the closed annulus [rMin(m), rMax(m)]. An interior point
 * of a square is strictly farther than rMin and strictly nearer than rMax (it
 * has a whole disc around it inside the square). Hence if
 *
 *   rMax(m)^2 <= rMin(q)^2   or   rMin(m)^2 >= rMax(q)^2,
 *
 * the swept set of m never meets the interior of q, at any angle and in either
 * direction. Cells in a different axial layer cannot overlap in positive
 * volume at all (their axial intervals [l-1/2, l+1/2] share at most a face),
 * so only same-layer (moving, stationary) pairs are examined. The moving body
 * is a union of cells and the stationary body too, so pairwise separation of
 * all such pairs proves the whole sweep is interference-free.
 *
 * This is a *sufficient* condition only. A pair it cannot separate is reported
 * as "judge-only": the engine said legal, but no exact proof is given here.
 *
 * Endpoint closure and the square envelope are re-checked exactly as well.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Vector3Tuple } from 'three';
import type { TwistAngle } from '../../packages/engine/src/index';
import { cellKey, perpIndicesFor } from './model';
import type { AxisIndex } from './model';

export interface MoveRecord {
  id: string;
  axis: Vector3Tuple;
  pivot: Vector3Tuple;
  angle: TwistAngle;
  support: Vector3Tuple[];
}

export interface ExactVerdict {
  id: string;
  origin: 'existing' | 'additional';
  angle: TwistAngle;
  axis: string;
  supportSize: number;
  endpointClosesExactly: boolean;
  /** Only meaningful for quarter turns; `null` for 180. */
  squareEnvelopeExact: boolean | null;
  samePlanePairs: number;
  separatedPairs: number;
  /** Pairs the annulus test could not separate (the judge's verdict stands alone there). */
  unseparatedPairs: Array<{ moving: string; stationary: string }>;
  status: 'exact-certified' | 'judge-only';
}

const axisIndexOf = (axis: Vector3Tuple): AxisIndex => {
  const index = axis.findIndex((component) => component !== 0);
  if (index < 0 || Math.abs(axis[index]!) !== 1 || axis.filter((c) => c !== 0).length !== 1) {
    throw new Error(`not a unit coordinate axis: ${axis.join(',')}`);
  }
  return index as AxisIndex;
};

/** Exact integer rotation of a doubled in-plane offset by a multiple of 90 degrees. */
const rotateDoubled = ([u, v]: [number, number], quarterTurns: number): [number, number] => {
  let point: [number, number] = [u, v];
  for (let step = 0; step < ((quarterTurns % 4) + 4) % 4; step += 1) point = [-point[1], point[0]];
  return point;
};

const radialSquared = ([u, v]: [number, number]): { min: number; max: number } => {
  const du = Math.max(0, Math.abs(u) - 1);
  const dv = Math.max(0, Math.abs(v) - 1);
  return { min: du * du + dv * dv, max: (Math.abs(u) + 1) ** 2 + (Math.abs(v) + 1) ** 2 };
};

export const certifyMove = (
  move: MoveRecord,
  origin: ExactVerdict['origin'],
  occupied: Vector3Tuple[],
): ExactVerdict => {
  const axisIndex = axisIndexOf(move.axis);
  const [iu, iv] = perpIndicesFor[axisIndex];
  // The axis sign flips the sense of rotation; the quarter-turn count only
  // matters for closure, where the orbit of a set is sign-independent anyway,
  // but keep it honest.
  const sign = move.axis[axisIndex]! > 0 ? 1 : -1;
  const quarterTurns = ((move.angle / 90) * sign + 4) % 4;
  const doubled = (cell: Vector3Tuple): [number, number] => [
    2 * cell[iu]! - 2 * move.pivot[iu]!,
    2 * cell[iv]! - 2 * move.pivot[iv]!,
  ];
  for (const value of [...move.pivot]) {
    if (!Number.isInteger(2 * value)) throw new Error(`pivot is not on the half-integer lattice: ${move.pivot}`);
  }

  const supportKeys = new Set(move.support.map(cellKey));

  // Exact endpoint closure: the rotated doubled offsets of the support, mapped
  // back to cells, must be the support again (as a set, bijectively).
  const images = new Set<string>();
  let closes = true;
  for (const cell of move.support) {
    const [ru, rv] = rotateDoubled(doubled(cell), quarterTurns);
    const image: Vector3Tuple = [cell[0], cell[1], cell[2]];
    const iuValue = (ru + 2 * move.pivot[iu]!) / 2;
    const ivValue = (rv + 2 * move.pivot[iv]!) / 2;
    if (!Number.isInteger(iuValue) || !Number.isInteger(ivValue)) {
      closes = false;
      break;
    }
    image[iu] = iuValue;
    image[iv] = ivValue;
    const key = cellKey(image);
    if (!supportKeys.has(key) || images.has(key)) {
      closes = false;
      break;
    }
    images.add(key);
  }
  closes = closes && images.size === supportKeys.size;

  // Exact square envelope centred on the pivot (quarter turns only, as in the judge).
  let squareEnvelopeExact: boolean | null = null;
  if (Math.abs(move.angle) === 90) {
    const offsets = move.support.map(doubled);
    const minU = Math.min(...offsets.map(([u]) => u));
    const maxU = Math.max(...offsets.map(([u]) => u));
    const minV = Math.min(...offsets.map(([, v]) => v));
    const maxV = Math.max(...offsets.map(([, v]) => v));
    squareEnvelopeExact = maxU - minU === maxV - minV && minU + maxU === 0 && minV + maxV === 0;
  }

  const layers = new Set(move.support.map((cell) => cell[axisIndex]!));
  const stationaryByLayer = new Map<number, Vector3Tuple[]>();
  for (const cell of occupied) {
    if (!layers.has(cell[axisIndex]!) || supportKeys.has(cellKey(cell))) continue;
    const list = stationaryByLayer.get(cell[axisIndex]!) ?? [];
    list.push(cell);
    stationaryByLayer.set(cell[axisIndex]!, list);
  }

  let samePlanePairs = 0;
  let separatedPairs = 0;
  const unseparatedPairs: ExactVerdict['unseparatedPairs'] = [];
  for (const moving of move.support) {
    const m = radialSquared(doubled(moving));
    for (const stationary of stationaryByLayer.get(moving[axisIndex]!) ?? []) {
      samePlanePairs += 1;
      const q = radialSquared(doubled(stationary));
      if (m.max <= q.min || m.min >= q.max) separatedPairs += 1;
      else unseparatedPairs.push({ moving: cellKey(moving), stationary: cellKey(stationary) });
    }
  }

  return {
    id: move.id,
    origin,
    angle: move.angle,
    axis: move.axis.join(','),
    supportSize: move.support.length,
    endpointClosesExactly: closes,
    squareEnvelopeExact,
    samePlanePairs,
    separatedPairs,
    unseparatedPairs,
    status: closes && unseparatedPairs.length === 0 ? 'exact-certified' : 'judge-only',
  };
};

interface ExtendedMovesFile {
  level: number;
  cells: Vector3Tuple[];
  existing: MoveRecord[];
  additional: MoveRecord[];
}

const main = (): void => {
  const outDir = 'research/square-rotation/out';
  const file = JSON.parse(readFileSync(`${outDir}/l2-extended-moves.json`, 'utf8')) as ExtendedMovesFile;
  const verdicts = [
    ...file.existing.map((move) => certifyMove(move, 'existing', file.cells)),
    ...file.additional.map((move) => certifyMove(move, 'additional', file.cells)),
  ];

  const summarize = (origin: ExactVerdict['origin']) => {
    const rows = verdicts.filter((row) => row.origin === origin);
    return {
      atoms: rows.length,
      endpointClosesExactly: rows.filter((row) => row.endpointClosesExactly).length,
      squareEnvelopeExactOfQuarterTurns: `${rows.filter((row) => row.squareEnvelopeExact === true).length}/${
        rows.filter((row) => row.squareEnvelopeExact !== null).length
      }`,
      exactCertified: rows.filter((row) => row.status === 'exact-certified').length,
      judgeOnly: rows.filter((row) => row.status === 'judge-only').length,
      samePlanePairs: rows.reduce((sum, row) => sum + row.samePlanePairs, 0),
      unseparatedPairs: rows.reduce((sum, row) => sum + row.unseparatedPairs.length, 0),
    };
  };
  const summary = { existing: summarize('existing'), additional: summarize('additional') };

  console.log('=== Level 2: exact annulus-separation certificates for every atom of H ===');
  for (const [origin, row] of Object.entries(summary)) {
    console.log(
      `${origin.padEnd(11)} atoms ${row.atoms}: exact closure ${row.endpointClosesExactly}, exact square envelope ` +
        `(quarter turns) ${row.squareEnvelopeExactOfQuarterTurns}, exact-certified ${row.exactCertified}, ` +
        `judge-only ${row.judgeOnly} (same-plane pairs ${row.samePlanePairs}, unseparated ${row.unseparatedPairs})`,
    );
  }
  const judgeOnly = verdicts.filter((row) => row.status === 'judge-only');
  for (const row of judgeOnly.slice(0, 20)) {
    console.log(
      `  judge-only ${row.origin} ${row.id}@${row.angle}: ${row.unseparatedPairs.length} unseparated pairs, e.g. ` +
        row.unseparatedPairs.slice(0, 3).map((pair) => `${pair.moving} vs ${pair.stationary}`).join('; '),
    );
  }
  if (judgeOnly.length > 20) console.log(`  ... ${judgeOnly.length - 20} more`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    `${outDir}/l2-exact-sweep.json`,
    `${JSON.stringify(
      {
        level: file.level,
        method:
          'Annulus separation in doubled integer coordinates (sufficient condition for an interference-free sweep ' +
          'at every angle and in either direction). judge-only = the engine judged legal, no exact proof here.',
        summary,
        verdicts,
      },
      null,
      1,
    )}\n`,
  );
  console.log(`\nwrote ${outDir}/l2-exact-sweep.json`);
};

if (import.meta.url === `file://${process.argv[1]}`) main();

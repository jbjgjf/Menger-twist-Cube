/**
 * Scratch experiment harness for the Level 2 slice-reduction research.
 * Integer simulator of the Level 2 Menger puzzle: 400 sites, 24 rotations.
 */
import type { Vector3Tuple } from 'three';
import type { MengerPuzzleState, TurnTarget, TwistAngle } from '../../packages/engine/src/types';
import { createMengerPuzzleState } from '../../packages/engine/src/puzzleState';

// --- 24 rotations as integer matrices, closed under multiplication ---

export type Mat = readonly number[]; // row-major 3x3

export const identityMat: Mat = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const mulMat = (a: Mat, b: Mat): number[] => {
  const r = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i += 1)
    for (let j = 0; j < 3; j += 1)
      for (let k = 0; k < 3; k += 1) r[i * 3 + j]! += a[i * 3 + k]! * b[k * 3 + j]!;
  return r;
};

export const applyMat = (m: Mat, v: Vector3Tuple): Vector3Tuple => [
  m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2],
  m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2],
  m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2],
];

const matKey = (m: Mat): string => m.join(',');

// quarter turns by +90deg about X, Y, Z (right-hand rule), matching engine rotatePosition
const quarterX: Mat = [1, 0, 0, 0, 0, -1, 0, 1, 0];
const quarterY: Mat = [0, 0, 1, 0, 1, 0, -1, 0, 0];
const quarterZ: Mat = [0, -1, 0, 1, 0, 0, 0, 0, 1];

export const rotations: Mat[] = (() => {
  const found = new Map<string, Mat>([[matKey(identityMat), identityMat]]);
  const queue: Mat[] = [identityMat];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const g of [quarterX, quarterY, quarterZ]) {
      const next = mulMat(g, cur);
      const key = matKey(next);
      if (!found.has(key)) {
        found.set(key, next);
        queue.push(next);
      }
    }
  }
  return [...found.values()];
})();

export const rotIndex = new Map<string, number>(rotations.map((m, i) => [matKey(m), i]));
export const rotMul: number[][] = rotations.map((a) => rotations.map((b) => rotIndex.get(matKey(mulMat(a, b)))!));
export const rotInv: number[] = rotations.map((_, i) => rotMul[i]!.findIndex((p) => p === 0));
export const ROT_ID = rotIndex.get(matKey(identityMat))!; // should be 0

// rotation matrix for (axis, angle)
export const rotForAxisAngle = (axis: Vector3Tuple, angle: TwistAngle): number => {
  const base = axis[0] !== 0 ? quarterX : axis[1] !== 0 ? quarterY : quarterZ;
  const sign = axis[0] + axis[1] + axis[2]; // axes here are unit +/- vectors
  // +90 about +axis; for -axis, +90 about -a == -90 about +a
  const quarter = rotIndex.get(matKey(base))!;
  const inv = rotInv[quarter]!;
  const plus = sign > 0 ? quarter : inv;
  const minus = sign > 0 ? inv : quarter;
  if (angle === 90) return plus;
  if (angle === -90) return minus;
  return rotMul[plus]![plus]!; // 180
};

// --- Sites and classes ---

export const state: MengerPuzzleState = createMengerPuzzleState(2);

export const sitePositions: Vector3Tuple[] = state.cubies.map((c) => [...c.homePosition] as Vector3Tuple);
export const N = sitePositions.length;
const posKey = (p: Vector3Tuple) => `${p[0]},${p[1]},${p[2]}`;
export const siteIndexByKey = new Map<string, number>(sitePositions.map((p, i) => [posKey(p), i]));

export const blockOf = (p: Vector3Tuple): Vector3Tuple => [
  Math.floor((p[0] + 4) / 3) - 1,
  Math.floor((p[1] + 4) / 3) - 1,
  Math.floor((p[2] + 4) / 3) - 1,
];
export const offsetOf = (p: Vector3Tuple): Vector3Tuple => {
  const b = blockOf(p);
  return [p[0] - 3 * b[0], p[1] - 3 * b[1], p[2] - 3 * b[2]];
};

export type PieceClass = 'CC' | 'CE' | 'EC' | 'EEa' | 'EEo';

export const classOfSite = (i: number): PieceClass => {
  const p = sitePositions[i]!;
  const b = blockOf(p);
  const o = offsetOf(p);
  const bZeros = b.filter((v) => v === 0).length;
  const oZeros = o.filter((v) => v === 0).length;
  if (bZeros === 0 && oZeros === 0) return 'CC';
  if (bZeros === 0) return 'CE';
  if (oZeros === 0) return 'EC';
  const bAxis = b.findIndex((v) => v === 0);
  const oAxis = o.findIndex((v) => v === 0);
  return bAxis === oAxis ? 'EEa' : 'EEo';
};

export const siteClasses: PieceClass[] = sitePositions.map((_, i) => classOfSite(i));

// --- Atoms: every legal position-affecting move as (perm, rot) ---

export interface Atom {
  id: string; // e.g. "f:X_-4:90" or "e:extension:d1:proot:s011:90"
  kind: 'frame' | 'extension';
  refId: string; // frameId or extension target id
  angle: TwistAngle;
  notation: string;
  perm: Int16Array; // perm[i] = destination site of content at site i
  rot: number; // rotation index applied to moved cells
  affected: Uint8Array; // 1 where the selector matched (rotation applies even if position is fixed)
  moved: number[]; // site indices with affected[i] === 1
}

const angles: TwistAngle[] = [90, -90, 180];

const buildAtom = (
  id: string,
  kind: 'frame' | 'extension',
  refId: string,
  angle: TwistAngle,
  notation: string,
  selector: (p: Vector3Tuple) => boolean,
  axis: Vector3Tuple,
  pivot: Vector3Tuple,
): Atom => {
  const rot = rotForAxisAngle(axis, angle);
  const m = rotations[rot]!;
  const perm = new Int16Array(N);
  const affected = new Uint8Array(N);
  const moved: number[] = [];
  for (let i = 0; i < N; i += 1) {
    const p = sitePositions[i]!;
    if (!selector(p)) {
      perm[i] = i;
      continue;
    }
    const rel: Vector3Tuple = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]];
    const rp = applyMat(m, rel);
    const dest = siteIndexByKey.get(posKey([rp[0] + pivot[0], rp[1] + pivot[1], rp[2] + pivot[2]] as Vector3Tuple));
    if (dest === undefined) throw new Error(`atom ${id}: site ${posKey(p)} leaves the cell set`);
    perm[i] = dest;
    affected[i] = 1;
    moved.push(i);
  }
  return { id, kind, refId, angle, notation, perm, rot, affected, moved };
};

export const atoms: Atom[] = [];
for (const frame of state.frames) {
  for (const angle of angles) {
    atoms.push(
      buildAtom(
        `f:${frame.id}:${angle}`,
        'frame',
        frame.id,
        angle,
        `${frame.name}${angle === 180 ? '2' : angle === -90 ? "'" : ''}`,
        frame.selector,
        frame.axis,
        [frame.axis[0] * frame.layer, frame.axis[1] * frame.layer, frame.axis[2] * frame.layer],
      ),
    );
  }
}
for (const target of state.turnTargets) {
  if (target.kind !== 'extension') continue;
  for (const angle of angles) {
    atoms.push(
      buildAtom(
        `e:${target.id}:${angle}`,
        'extension',
        target.id,
        angle,
        `${target.name}${angle === 180 ? '2' : angle === -90 ? "'" : ''}`,
        target.selector,
        target.axis,
        target.pivot,
      ),
    );
  }
}

export const atomById = new Map(atoms.map((a) => [a.id, a]));

export const atomsFor = (pred: (a: Atom, t?: TurnTarget) => boolean): Atom[] =>
  atoms.filter((a) => pred(a, a.kind === 'extension' ? state.turnTargetById.get(a.refId) : undefined));

// --- Words: sequences of atoms; state = (perm over sites, rot per site) ---

export interface Action {
  perm: Int16Array; // content at site i ends at perm[i]
  rot: Uint8Array; // rotation applied to content that started at site i
}

export const identityAction = (): Action => {
  const perm = new Int16Array(N);
  const rot = new Uint8Array(N).fill(ROT_ID);
  for (let i = 0; i < N; i += 1) perm[i] = i;
  return { perm, rot };
};

/** compose: first `a`, then atom `b` */
export const applyAtom = (a: Action, b: Atom): Action => {
  const perm = new Int16Array(N);
  const rot = new Uint8Array(N);
  for (let i = 0; i < N; i += 1) {
    const mid = a.perm[i]!;
    perm[i] = b.perm[mid]!;
    rot[i] = b.affected[mid] ? rotMul[b.rot]![a.rot[i]!]! : a.rot[i]!;
  }
  return { perm, rot };
};

export const actionOfWord = (word: Atom[]): Action => word.reduce(applyAtom, identityAction());

export const inverseAtomId = (a: Atom): string => {
  const inverseAngle = a.angle === 180 ? 180 : a.angle === 90 ? -90 : 90;
  return `${a.kind === 'frame' ? 'f' : 'e'}:${a.refId}:${inverseAngle}`;
};
export const inverseAtom = (a: Atom): Atom => atomById.get(inverseAtomId(a))!;
export const inverseWord = (word: Atom[]): Atom[] => [...word].reverse().map(inverseAtom);
export const commutatorWord = (a: Atom[], b: Atom[]): Atom[] => [...a, ...b, ...inverseWord(a), ...inverseWord(b)];

export const supportOf = (action: Action): number[] => {
  const s: number[] = [];
  for (let i = 0; i < N; i += 1) if (action.perm[i] !== i || action.rot[i] !== ROT_ID) s.push(i);
  return s;
};

export const positionSupportOf = (action: Action): number[] => {
  const s: number[] = [];
  for (let i = 0; i < N; i += 1) if (action.perm[i] !== i) s.push(i);
  return s;
};

export const permutationSign = (perm: Int16Array, sites: number[]): 1 | -1 => {
  const inSet = new Set(sites);
  const visited = new Set<number>();
  let sign: 1 | -1 = 1;
  for (const start of sites) {
    if (visited.has(start)) continue;
    let len = 0;
    let cur = start;
    do {
      visited.add(cur);
      const next = perm[cur]!;
      if (!inSet.has(next)) throw new Error('permutation does not preserve the site class');
      cur = next;
      len += 1;
    } while (cur !== start);
    if (len % 2 === 0) sign = (sign * -1) as 1 | -1;
  }
  return sign;
};

/**
 * Integer simulator of the Level 3 Menger puzzle: 8000 sites, 24 rotations.
 *
 * The Level 2 harness (`sim.ts`) stores each move as a dense `Int16Array` over
 * all sites. At Level 3 that would be 17,775 atoms x 8000 sites x 2 bytes =
 * 284 MB, so atoms here are **sparse**: only the cells a move actually touches.
 * Total moved entries across every atom come to ~288k, which fits comfortably.
 */
import type { Vector3Tuple } from 'three';
import type { MengerPuzzleState, TurnTarget, TwistAngle } from '../../packages/engine/src/types';
import { createMengerPuzzleState } from '../../packages/engine/src/puzzleState';
import { validateFrameRotation, validateTurnTargetRotation } from '../../packages/engine/src/rotationLegality';

// --- 24 rotations as integer matrices ---

export type Mat = readonly number[];
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
      if (!found.has(matKey(next))) {
        found.set(matKey(next), next);
        queue.push(next);
      }
    }
  }
  return [...found.values()];
})();

export const rotIndex = new Map<string, number>(rotations.map((m, i) => [matKey(m), i]));
export const rotMul: number[][] = rotations.map((a) => rotations.map((b) => rotIndex.get(matKey(mulMat(a, b)))!));
export const rotInv: number[] = rotations.map((_, i) => rotMul[i]!.findIndex((p) => p === 0));
export const ROT_ID = rotIndex.get(matKey(identityMat))!;

export const rotForAxisAngle = (axis: Vector3Tuple, angle: TwistAngle): number => {
  const base = axis[0] !== 0 ? quarterX : axis[1] !== 0 ? quarterY : quarterZ;
  const sign = axis[0] + axis[1] + axis[2];
  const quarter = rotIndex.get(matKey(base))!;
  const plus = sign > 0 ? quarter : rotInv[quarter]!;
  if (angle === 90) return plus;
  if (angle === -90) return rotInv[plus]!;
  return rotMul[plus]![plus]!;
};

// --- sites, hierarchical digits, piece classes ---

export const state: MengerPuzzleState = createMengerPuzzleState(3);
export const sitePositions: Vector3Tuple[] = state.cubies.map((c) => [...c.homePosition] as Vector3Tuple);
export const N = sitePositions.length;
const posKey = (p: Vector3Tuple) => `${p[0]},${p[1]},${p[2]}`;
export const siteIndexByKey = new Map<string, number>(sitePositions.map((p, i) => [posKey(p), i]));

/** p = 9B + 3b + o, each digit in {-1,0,1}^3 with at most one zero component. */
export const digitsOf = (p: Vector3Tuple): [Vector3Tuple, Vector3Tuple, Vector3Tuple] => {
  const big = p.map((v) => Math.floor((v + 13) / 9) - 1) as Vector3Tuple;
  const mid = p.map((v, i) => Math.floor((v + 13 - (big[i]! + 1) * 9) / 3) - 1) as Vector3Tuple;
  const low = p.map((v, i) => v - 9 * big[i]! - 3 * mid[i]!) as Vector3Tuple;
  return [big, mid, low];
};

/** The mid-block a cell belongs to, as a Level 2 lattice coordinate. */
export const midBlockOf = (p: Vector3Tuple): Vector3Tuple =>
  p.map((v) => Math.floor((v + 13) / 3) - 4) as Vector3Tuple;

const zeroAxis = (d: Vector3Tuple) => d.findIndex((v) => v === 0);

/**
 * 15 classes: the corner/edge type of each of the three digits, refined by how
 * the edge-type digits' zero axes coincide. Every legal move preserves them
 * (the self-similar digit action rotates all three digits together).
 */
export const classOfPosition = (p: Vector3Tuple): string => {
  const digits = digitsOf(p);
  const shape = digits.map((d) => (zeroAxis(d) === -1 ? 'C' : 'E')).join('');
  const labels = ['B', 'b', 'o'];
  const axes = digits.map(zeroAxis);
  const edges = axes.map((a, i) => ({ a, l: labels[i]! })).filter((e) => e.a !== -1);
  if (edges.length < 2) return shape;
  const groups = new Map<number, string[]>();
  for (const e of edges) {
    const g = groups.get(e.a) ?? [];
    g.push(e.l);
    groups.set(e.a, g);
  }
  return `${shape}/${[...groups.values()].map((g) => g.join('')).sort().join('|')}`;
};

export const siteClasses: string[] = sitePositions.map(classOfPosition);
export const classSites = new Map<string, number[]>();
for (let i = 0; i < N; i += 1) {
  const list = classSites.get(siteClasses[i]!) ?? [];
  list.push(i);
  classSites.set(siteClasses[i]!, list);
}

// --- sparse atoms ---

export interface Atom {
  id: string;
  kind: 'frame' | 'extension';
  refId: string;
  angle: TwistAngle;
  notation: string;
  rot: number;
  /** site -> destination, only for the cells this move touches */
  map: Map<number, number>;
  /** family label for cost/diagnostic grouping */
  family: string;
}

const angles: TwistAngle[] = [90, -90, 180];

const buildAtom = (
  id: string,
  kind: 'frame' | 'extension',
  refId: string,
  angle: TwistAngle,
  notation: string,
  family: string,
  selector: (p: Vector3Tuple) => boolean,
  axis: Vector3Tuple,
  pivot: Vector3Tuple,
): Atom => {
  const rot = rotForAxisAngle(axis, angle);
  const m = rotations[rot]!;
  const map = new Map<number, number>();
  for (let i = 0; i < N; i += 1) {
    const p = sitePositions[i]!;
    if (!selector(p)) continue;
    const rel: Vector3Tuple = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]];
    const rp = applyMat(m, rel);
    const dest = siteIndexByKey.get(posKey([rp[0] + pivot[0], rp[1] + pivot[1], rp[2] + pivot[2]] as Vector3Tuple));
    if (dest === undefined) throw new Error(`atom ${id}: site ${posKey(p)} leaves the cell set`);
    map.set(i, dest);
  }
  return { id, kind, refId, angle, notation, rot, map, family };
};

const suffix = (angle: TwistAngle) => (angle === 180 ? '2' : angle === -90 ? "'" : '');

/** Only physically legal turns — 744 of 4800 cell rolls can actually turn. */
export const atoms: Atom[] = [];
for (const frame of state.frames) {
  for (const angle of angles) {
    if (!validateFrameRotation(state.cubies, frame, angle).legal) continue;
    atoms.push(
      buildAtom(
        `f:${frame.id}:${angle}`,
        'frame',
        frame.id,
        angle,
        `${frame.name}${suffix(angle)}`,
        `frame-s${frame.scale}`,
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
    if (!validateTurnTargetRotation(state.cubies, target, angle).legal) continue;
    atoms.push(
      buildAtom(
        `e:${target.id}:${angle}`,
        'extension',
        target.id,
        angle,
        `${target.name}${suffix(angle)}`,
        `ext-d${target.depth}`,
        target.selector,
        target.axis,
        target.pivot,
      ),
    );
  }
}

export const atomById = new Map(atoms.map((a) => [a.id, a]));
export const atomsOfFamily = (...families: string[]): Atom[] =>
  atoms.filter((a) => families.includes(a.family));

export const inverseAtom = (a: Atom): Atom => {
  const inverseAngle: TwistAngle = a.angle === 180 ? 180 : a.angle === 90 ? -90 : 90;
  return atomById.get(`${a.kind === 'frame' ? 'f' : 'e'}:${a.refId}:${inverseAngle}`)!;
};
export const inverseWord = (word: Atom[]): Atom[] => [...word].reverse().map(inverseAtom);
export const commutatorWord = (a: Atom[], b: Atom[]): Atom[] => [...a, ...b, ...inverseWord(a), ...inverseWord(b)];

// --- sparse word actions, computed only over a candidate site set ---

export interface SparseAction {
  /** site -> [destination, rotation applied], only for sites that change */
  moves: Map<number, [number, number]>;
}

/**
 * Action of `word` restricted to `candidates`. Sites outside the set are
 * assumed untouched, so `candidates` must contain the word's whole support —
 * `supportCandidates` below builds a set that provably does.
 */
export const actionOver = (word: Atom[], candidates: Iterable<number>): SparseAction => {
  const moves = new Map<number, [number, number]>();
  for (const start of candidates) {
    let site = start;
    let rot = ROT_ID;
    for (const a of word) {
      const dest = a.map.get(site);
      if (dest === undefined) continue;
      site = dest;
      rot = rotMul[a.rot]![rot]!;
    }
    if (site !== start || rot !== ROT_ID) moves.set(start, [site, rot]);
  }
  return { moves };
};

/**
 * A provable superset of the support of the commutator `[A, B]` (applied left
 * to right: A, B, A^-1, B^-1), namely `supp(B) union A^-1(supp(B))`.
 *
 * Proof: the word sends x to B^-1(A^-1(B(A(x)))). If x is outside supp(B) and
 * A(x) is too, then B and B^-1 are both no-ops and A^-1 undoes A — position and
 * rotation both return. So only cells in supp(B), or landing in supp(B) after
 * A, can move.
 *
 * This is what makes tool discovery tractable at Level 3: B is a mid-block-local
 * move touching 8-20 cells, so the candidate set is ~40 sites instead of the
 * ~2,700 a scale-9 frame touches.
 */
export const commutatorCandidates = (a: Atom[], b: Atom[]): Set<number> => {
  const set = new Set<number>();
  for (const atom of b) for (const site of atom.map.keys()) set.add(site);
  for (const atom of [...a].reverse()) {
    const inv = inverseAtom(atom);
    for (const site of [...set]) {
      const dest = inv.map.get(site);
      if (dest !== undefined) set.add(dest);
    }
  }
  return set;
};

/** A superset of the support of a word, by closing the touched sites under every atom. */
export const supportCandidates = (word: Atom[]): Set<number> => {
  const set = new Set<number>();
  for (const a of word) for (const site of a.map.keys()) set.add(site);
  for (const a of word) {
    for (const site of [...set]) {
      const dest = a.map.get(site);
      if (dest !== undefined) set.add(dest);
    }
  }
  return set;
};

export const summary = () => {
  const byFamily = new Map<string, number>();
  for (const a of atoms) byFamily.set(a.family, (byFamily.get(a.family) ?? 0) + 1);
  let entries = 0;
  for (const a of atoms) entries += a.map.size;
  return { sites: N, atoms: atoms.length, byFamily: [...byFamily].sort(), movedEntries: entries, classes: classSites.size };
};

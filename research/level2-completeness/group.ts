/**
 * Exact arithmetic in the Level 2 move groups, shared by the completeness
 * scripts. A group element is the pair (perm, rot):
 *
 *   perm[i] — the site the piece standing on site i is carried to,
 *   rot[i]  — the rotation (index into the 24 cube rotations) applied to it.
 *
 * "a then b" is `mul(a, b)`. The solved state corresponds to the identity and
 * the group acts freely on states, so elements and reachable states coincide.
 * Atoms are read off the shipped model by applying each legal move to the
 * solved state, so nothing here re-derives geometry.
 */
import { Matrix4, Vector3 } from 'three';
import type { Vector3Tuple } from 'three';
import type { Cubie, MengerPuzzleState, MoveSystem } from '@menger/engine';
import { createMengerPuzzleModel } from '@menger/solver-core';
import type { SolverMove } from '@menger/solver-core';

export interface Elt { perm: Int16Array; rot: Uint8Array }
export interface Atom extends Elt { index: number; label: string; move: SolverMove; inverse: number }

const matKey = (m: number[]): string => m.join(',');
const mulMat = (a: number[], b: number[]): number[] => {
  const out = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) for (let k = 0; k < 3; k += 1) out[r * 3 + c]! += a[r * 3 + k]! * b[k * 3 + c]!;
  return out;
};
/** The 24 rotation matrices; index 0 is the identity. */
export const rotations: number[][] = (() => {
  const qx = [1, 0, 0, 0, 0, -1, 0, 1, 0];
  const qy = [0, 0, 1, 0, 1, 0, -1, 0, 0];
  const found = new Map<string, number[]>([[matKey([1, 0, 0, 0, 1, 0, 0, 0, 1]), [1, 0, 0, 0, 1, 0, 0, 0, 1]]]);
  const queue = [...found.values()];
  while (queue.length > 0) {
    const m = queue.shift()!;
    for (const g of [qx, qy]) {
      const next = mulMat(g, m);
      if (!found.has(matKey(next))) (found.set(matKey(next), next), queue.push(next));
    }
  }
  return [...found.values()];
})();
const rotIndex = new Map(rotations.map((m, i) => [matKey(m), i]));
/** rotMul[a][b] = a·b (apply b first, then a). */
export const rotMul: number[][] = rotations.map((a) => rotations.map((b) => rotIndex.get(matKey(mulMat(a, b)))!));
export const rotInv: number[] = rotations.map((_, i) => rotMul[i]!.findIndex((p) => p === 0));

const rotOfCubie = (cubie: Cubie): number => {
  const matrix = new Matrix4().makeRotationFromQuaternion(cubie.orientation);
  const cols = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)].map((v) => v.applyMatrix4(matrix));
  const m = [0, 1, 2].flatMap((r) => cols.map((c) => Math.round(c.getComponent(r))));
  const index = rotIndex.get(matKey(m));
  if (index === undefined) throw new Error('orientation is not one of the 24 cube rotations');
  return index;
};

export interface GroupContext {
  system: MoveSystem;
  N: number;
  sites: Vector3Tuple[];
  siteIndex: Map<string, number>;
  solved: MengerPuzzleState;
  atoms: Atom[];
  atomByLabel: Map<string, Atom>;
  identity: () => Elt;
  mul: (a: Elt, b: Elt) => Elt;
  inv: (a: Elt) => Elt;
  ofWord: (word: readonly number[]) => Elt;
  inverseWord: (word: readonly number[]) => number[];
  eltOfState: (cubies: readonly Cubie[]) => Elt;
  isIdentity: (a: Elt) => boolean;
  equal: (a: Elt, b: Elt) => boolean;
  /** Sites whose piece is moved or turned. */
  support: (a: Elt) => number[];
}

export const siteKey = (p: readonly number[]): string => p.join(',');

export const moveLabel = (move: SolverMove): string => `${move.targetId}@${move.angle}`;

export const buildContext = (system: MoveSystem = 'standard'): GroupContext => {
  const model = createMengerPuzzleModel(system);
  const solved = model.createState(2);
  const N = solved.cubies.length;
  const sites = solved.cubies.map((cubie) => cubie.homePosition as Vector3Tuple);
  const siteIndex = new Map(sites.map((p, i) => [siteKey(p), i]));
  const eltOfState = (cubies: readonly Cubie[]): Elt => {
    const perm = new Int16Array(N);
    const rot = new Uint8Array(N);
    for (const cubie of cubies) {
      const from = siteIndex.get(siteKey(cubie.homePosition))!;
      perm[from] = siteIndex.get(siteKey(cubie.currentPosition))!;
      rot[from] = rotOfCubie(cubie);
    }
    return { perm, rot };
  };
  const moves = model.legalMoves(solved);
  const atoms: Atom[] = moves.map((move, index) => ({
    ...eltOfState(model.applyMove(solved, move).cubies),
    index,
    label: moveLabel(move),
    move,
    inverse: -1,
  }));
  const atomByLabel = new Map(atoms.map((atom) => [atom.label, atom]));
  for (const atom of atoms) {
    const angle = atom.move.angle === 180 ? 180 : -atom.move.angle;
    atom.inverse = atomByLabel.get(`${atom.move.targetId}@${angle}`)!.index;
  }
  const identity = (): Elt => ({ perm: Int16Array.from({ length: N }, (_, i) => i), rot: new Uint8Array(N) });
  const mul = (a: Elt, b: Elt): Elt => {
    const perm = new Int16Array(N);
    const rot = new Uint8Array(N);
    for (let i = 0; i < N; i += 1) {
      const mid = a.perm[i]!;
      perm[i] = b.perm[mid]!;
      rot[i] = rotMul[b.rot[mid]!]![a.rot[i]!]!;
    }
    return { perm, rot };
  };
  const inv = (a: Elt): Elt => {
    const perm = new Int16Array(N);
    const rot = new Uint8Array(N);
    for (let i = 0; i < N; i += 1) {
      perm[a.perm[i]!] = i;
      rot[a.perm[i]!] = rotInv[a.rot[i]!]!;
    }
    return { perm, rot };
  };
  const ofWord = (word: readonly number[]): Elt => word.reduce((acc, index) => mul(acc, atoms[index]!), identity());
  const inverseWord = (word: readonly number[]): number[] => [...word].reverse().map((index) => atoms[index]!.inverse);
  const isIdentity = (a: Elt): boolean => {
    for (let i = 0; i < N; i += 1) if (a.perm[i] !== i || a.rot[i] !== 0) return false;
    return true;
  };
  const equal = (a: Elt, b: Elt): boolean => {
    for (let i = 0; i < N; i += 1) if (a.perm[i] !== b.perm[i] || a.rot[i] !== b.rot[i]) return false;
    return true;
  };
  const support = (a: Elt): number[] => {
    const out: number[] = [];
    for (let i = 0; i < N; i += 1) if (a.perm[i] !== i || a.rot[i] !== 0) out.push(i);
    return out;
  };
  // Self-check: an atom's rot must be the identity exactly where it does not act,
  // and every atom times its inverse must be the identity.
  for (const atom of atoms) {
    if (!isIdentity(mul(atom, atoms[atom.inverse]!))) throw new Error(`atom ${atom.label} has a wrong inverse`);
  }
  return { system, N, sites, siteIndex, solved, atoms, atomByLabel, identity, mul, inv, ofWord, inverseWord, eltOfState, isIdentity, equal, support };
};

/** Site orbits of the group generated by `elts` (union-find over generator images). */
export const siteOrbits = (N: number, elts: readonly Elt[]): { orbitOf: number[]; orbits: number[][] } => {
  const parent = Array.from({ length: N }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  for (const e of elts) for (let i = 0; i < N; i += 1) {
    const [a, b] = [find(i), find(e.perm[i]!)];
    if (a !== b) parent[a] = b;
  }
  const ids = new Map<number, number>();
  const orbitOf = parent.map((_, i) => {
    const root = find(i);
    if (!ids.has(root)) ids.set(root, ids.size);
    return ids.get(root)!;
  });
  const orbits: number[][] = Array.from({ length: ids.size }, () => []);
  orbitOf.forEach((orbit, site) => orbits[orbit]!.push(site));
  return { orbitOf, orbits };
};

export const createRng = (seed: number): (() => number) => {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

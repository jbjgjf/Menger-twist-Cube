/**
 * Exact arithmetic for the Level 3 completeness scripts.
 *
 * Atoms come from the sparse simulator `research/scratch/l3sim.ts`, which
 * `l3-sim-vs-engine.ts` compares against the engine. Everything else — orbits,
 * the (site, orientation) automaton, the orientation frame and the action of a
 * word — is derived here and shared by `find-tools.ts` and `certify.ts`.
 *
 * Words are applied left to right. A piece standing on site `y` with rotation
 * `r` is carried by an atom to `atom.map(y)` with rotation `atom.rot · r`.
 */
import { ROT_ID, atomById, atoms, N, rotInv, rotMul } from '../scratch/l3sim';
import type { Atom } from '../scratch/l3sim';

export { ROT_ID, atomById, atoms, N, rotInv, rotMul };
export type { Atom };

export const inverseAtom = (atom: Atom): Atom => {
  const angle = atom.angle === 180 ? 180 : atom.angle === 90 ? -90 : 90;
  return atomById.get(`${atom.kind === 'frame' ? 'f' : 'e'}:${atom.refId}:${angle}`)!;
};
export const inverseWord = (word: Atom[]): Atom[] => [...word].reverse().map(inverseAtom);

export const resolveWord = (ids: readonly string[]): Atom[] =>
  ids.map((id) => {
    const atom = atomById.get(id);
    if (!atom) throw new Error(`unknown atom ${id}`);
    return atom;
  });

export const rotOrder = (rot: number): number => {
  let k = 1;
  for (let x = rot; x !== ROT_ID; x = rotMul[rot]![x]!) k += 1;
  return k;
};

// ---------- orbits ----------

export const orbitOf = new Int16Array(N).fill(-1);
export const orbits: number[][] = [];
{
  const parent = new Int32Array(N).map((_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r]!;
    while (parent[x] !== r) { const n = parent[x]!; parent[x] = r; x = n; }
    return r;
  };
  for (const atom of atoms) for (const [from, to] of atom.map) {
    if (from === to) continue;
    const ra = find(from);
    const rb = find(to);
    if (ra !== rb) parent[ra] = rb;
  }
  const index = new Map<number, number>();
  for (let site = 0; site < N; site += 1) {
    const r = find(site);
    let k = index.get(r);
    if (k === undefined) { k = orbits.length; orbits.push([]); index.set(r, k); }
    orbitOf[site] = k;
    orbits[k]!.push(site);
  }
}

// ---------- the action of a word on all 8000 cells ----------

/** site -> [destination, rotation] for every site the word moves or rotates. */
export type Action = Map<number, [number, number]>;

/**
 * The exact action of `word`. A site no atom of the word selects is untouched,
 * so tracing the union of the atoms' selected sites covers the whole support.
 */
export const fullAction = (word: Atom[]): Action => {
  const candidates = new Set<number>();
  for (const atom of word) for (const site of atom.map.keys()) candidates.add(site);
  const moves: Action = new Map();
  for (const start of candidates) {
    let site = start;
    let rot = ROT_ID;
    for (const atom of word) {
      const to = atom.map.get(site);
      if (to === undefined) continue;
      site = to;
      rot = rotMul[atom.rot]![rot]!;
    }
    if (site !== start || rot !== ROT_ID) moves.set(start, [site, rot]);
  }
  return moves;
};

/** Orbit-parity vector of a permutation given as a (partial) site map. */
export const parityVector = (map: (site: number) => number, support: Iterable<number>): bigint => {
  let vector = 0n;
  const seen = new Set<number>();
  for (const start of support) {
    if (seen.has(start)) continue;
    let length = 0;
    let current = start;
    do { seen.add(current); current = map(current); length += 1; } while (current !== start);
    if (length % 2 === 0) vector ^= 1n << BigInt(orbitOf[start]!);
  }
  return vector;
};

// ---------- the orientation frame of an orbit ----------

export interface Frame {
  orbit: number;
  /** H: the rotations the base cell can wear on its home site (a subgroup). */
  freedom: number[];
  /** ref[y]: one rotation that carries the base cell onto site y. */
  ref: Map<number, number>;
  kind: 'trivial' | 'C3' | 'C4' | 'D4';
  /** The rotation subgroup of H (all of H unless H = D4). */
  cyclic: Set<number>;
  /** Cyclic kinds: the exponent of a twist with respect to a fixed generator. */
  exponent: (twist: number) => number;
  /** twist of a piece carried from `site` to `to` by `rot`, as an element of H. */
  twist: (site: number, to: number, rot: number) => number;
}

/**
 * The (site, rotation) automaton of one orbit. The rotations seen at site y
 * form the coset ref[y]·H, so `ref[to]^-1 · rot · ref[site]` lies in H for
 * every atom: this is the embedding of the orbit's action in H wr Sym(orbit).
 */
export const frameOf = (orbit: number): Frame => {
  const sites = orbits[orbit]!;
  const base = sites[0]!;
  const gens = atoms.filter((atom) => sites.some((site) => atom.map.has(site)));
  const seen = new Map<number, Set<number>>([[base, new Set([ROT_ID])]]);
  const ref = new Map<number, number>([[base, ROT_ID]]);
  const queue: Array<[number, number]> = [[base, ROT_ID]];
  for (let head = 0; head < queue.length; head += 1) {
    const [site, rot] = queue[head]!;
    for (const atom of gens) {
      const to = atom.map.get(site);
      if (to === undefined) continue;
      const next = rotMul[atom.rot]![rot]!;
      let fiber = seen.get(to);
      if (!fiber) { fiber = new Set(); seen.set(to, fiber); ref.set(to, next); }
      if (fiber.has(next)) continue;
      fiber.add(next);
      queue.push([to, next]);
    }
  }
  const freedom = [...seen.get(base)!].sort((a, b) => a - b);
  const inFreedom = new Set(freedom);
  for (const site of sites) {
    const fiber = seen.get(site)!;
    if (fiber.size !== freedom.length) throw new Error(`orbit ${orbit}: fibre sizes differ`);
    for (const rot of fiber) {
      if (!inFreedom.has(rotMul[rotInv[ref.get(site)!]!]![rot]!)) throw new Error(`orbit ${orbit}: fibre is not a coset`);
    }
  }
  const twist = (site: number, to: number, rot: number): number => {
    const value = rotMul[rotInv[ref.get(to)!]!]![rotMul[rot]![ref.get(site)!]!]!;
    if (!inFreedom.has(value)) throw new Error(`orbit ${orbit}: twist outside H`);
    return value;
  };

  const orders = freedom.map(rotOrder);
  let kind: Frame['kind'];
  if (freedom.length === 1) kind = 'trivial';
  else if (freedom.length === 3) kind = 'C3';
  else if (freedom.length === 4 && orders.includes(4)) kind = 'C4';
  else if (freedom.length === 8 && orders.filter((o) => o === 4).length === 2) kind = 'D4';
  else throw new Error(`orbit ${orbit}: unexpected freedom of order ${freedom.length}`);

  let cyclic = inFreedom;
  const log = new Map<number, number>();
  if (kind === 'D4') {
    const quarter = freedom.find((rot) => rotOrder(rot) === 4)!;
    cyclic = new Set([ROT_ID, quarter, rotMul[quarter]![quarter]!, rotInv[quarter]!]);
  } else if (kind !== 'trivial') {
    const generator = freedom.find((rot) => rotOrder(rot) === freedom.length)!;
    for (let k = 0, x = ROT_ID; k < freedom.length; k += 1, x = rotMul[generator]![x]!) log.set(x, k);
  }
  const exponent = (value: number): number => {
    const k = log.get(value);
    if (k === undefined) throw new Error(`orbit ${orbit}: no exponent for ${value}`);
    return k;
  };
  return { orbit, freedom, ref, kind, cyclic, exponent, twist };
};

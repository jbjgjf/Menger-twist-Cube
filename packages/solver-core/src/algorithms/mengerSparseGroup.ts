import type { Vector3Tuple } from 'three';
import { Matrix4 } from 'three';
import type { Cubie, MengerPuzzleState, TurnTarget, TwistAngle } from '@menger/engine';
import { createMengerPuzzleState, validateFrameRotation, validateTurnTargetRotation } from '@menger/engine';
import { allBlockRotations, applyMatrixToVector, matrixKey, multiplyMatrices } from './blockRotations';
import type { SolverMove } from '../algorithm/types';

/** Exact cube rotations; the ordering agrees with the Level 2/3 simulators. */
export const rotations = allBlockRotations.map((r) => r.matrix);
const rotationIndex = new Map(rotations.map((r, i) => [matrixKey(r), i]));
export const rotMul = rotations.map((a) => rotations.map((b) => rotationIndex.get(matrixKey(multiplyMatrices(a, b)))!));
export const rotInv = rotations.map((_, i) => rotMul[i]!.findIndex((r) => r === 0));
export const ROT_ID = 0;
const angles: TwistAngle[] = [90, -90, 180];
const inverseAngle = (a: TwistAngle): TwistAngle => a === 180 ? 180 : a === 90 ? -90 : 90;
export const positionKey = (p: Vector3Tuple): string => p.join(',');

export interface SparseAtom {
  id: string;
  kind: 'frame' | 'extension';
  refId: string;
  angle: TwistAngle;
  rot: number;
  family: string;
  maxSite: number;
  /** Includes selected sites with no positional displacement. */
  map: Map<number, number>;
  move: SolverMove;
}
export type SparseAction = Map<number, [number, number]>;
export interface SparseGroup {
  level: number;
  canonical: MengerPuzzleState;
  N: number;
  sites: Vector3Tuple[];
  siteAt(p: Vector3Tuple): number;
  atoms: SparseAtom[];
  atomById: Map<string, SparseAtom>;
  atomsAt: number[][];
  orbits: number[][];
  orbitOf: Int32Array;
  buildMs: number;
}

/**
 * An extension's complete swept volume is inside an axial cylinder: its axial
 * interval is unchanged and its transverse radius is <= sqrt(2)*width/2.
 * A stationary unit cube outside the expanded cylinder's bounding box cannot
 * collide with it. Passing every occupied site inside that box to the original
 * engine therefore gives exactly the full-state legality decision. This keeps
 * the 96,000 candidate Level 4 cell rolls local, instead of 96,000 full scans.
 * Callers comparing against a full scan must use a fresh target object, because
 * engine legality caches are keyed by target identity.
 */
export const localLegalityCubies = (
  target: TurnTarget,
  cubieAt: (p: Vector3Tuple) => Cubie | undefined,
  extent: number,
): Cubie[] => {
  const axis = target.axis.findIndex((x) => x !== 0);
  const width = target.family === 'slab' ? 3 * target.scale : target.scale;
  const radius = Math.SQRT2 * width / 2;
  const lo = target.pivot.map((v, i) => Math.max(-extent,
    Math.ceil(v - (i === axis ? (target.scale - 1) / 2 : radius + 0.5)))) as Vector3Tuple;
  const hi = target.pivot.map((v, i) => Math.min(extent,
    Math.floor(v + (i === axis ? (target.scale - 1) / 2 : radius + 0.5)))) as Vector3Tuple;
  const result: Cubie[] = [];
  for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
    const c = cubieAt([x, y, z]);
    if (c) result.push(c);
  }
  return result;
};

export const createSparseGroup = (level: number, progress?: (message: string) => void): SparseGroup => {
  const start = performance.now();
  const canonical = createMengerPuzzleState(level, { materializeCubies: true });
  const sites = canonical.cubies.map((c) => c.homePosition);
  const N = sites.length;
  if (N !== 20 ** level) throw new Error(`Expected ${20 ** level} sites, got ${N}`);
  const size = 3 ** level;
  const extent = (size - 1) / 2;
  const lattice = new Int32Array(size ** 3).fill(-1);
  const latticeKey = (p: Vector3Tuple): number => ((p[0] + extent) * size + p[1] + extent) * size + p[2] + extent;
  sites.forEach((p, i) => { lattice[latticeKey(p)] = i; });
  const siteAt = (p: Vector3Tuple): number => {
    if (p.some((x) => !Number.isInteger(x) || Math.abs(x) > extent)) return -1;
    return lattice[latticeKey(p)]!;
  };
  const cubieAt = (p: Vector3Tuple): Cubie | undefined => canonical.cubies[siteAt(p)];
  const atoms: SparseAtom[] = [];
  const addAtom = (target: TurnTarget, selected: number[], angle: TwistAngle, frameId?: string): void => {
    const axis = target.axis.findIndex((x) => x !== 0);
    const basis = axis === 0 ? [1, 0, 0, 0, 0, -1, 0, 1, 0] : axis === 1 ? [0, 0, 1, 0, 1, 0, -1, 0, 0] : [0, -1, 0, 1, 0, 0, 0, 0, 1];
    const quarter = rotationIndex.get(matrixKey(basis))!;
    const plus = target.axis[axis]! > 0 ? quarter : rotInv[quarter]!;
    const rot = angle === 90 ? plus : angle === -90 ? rotInv[plus]! : rotMul[plus]![plus]!;
    const map = new Map<number, number>();
    for (const site of selected) {
      const p = sites[site]!;
      const rel = p.map((v, i) => v - target.pivot[i]!) as Vector3Tuple;
      const r = applyMatrixToVector(rotations[rot]!, rel);
      const dest = siteAt(r.map((v, i) => v + target.pivot[i]!) as Vector3Tuple);
      if (dest < 0) throw new Error(`${target.id}:${angle} leaves the lattice`);
      map.set(site, dest);
    }
    const suffix = angle === 180 ? '2' : angle === -90 ? "'" : '';
    atoms.push({
      id: `${frameId ? 'f' : 'e'}:${frameId ?? target.id}:${angle}`,
      kind: frameId ? 'frame' : 'extension', refId: frameId ?? target.id, angle, rot, map,
      family: frameId ? `frame-s${target.scale}` : `ext-d${target.depth}`,
      maxSite: selected.reduce((m, s) => Math.max(m, s), -1),
      move: { targetKind: frameId ? 'frame' : 'extension', targetId: target.id,
        ...(frameId ? { frameId } : { extensionTargetId: target.id }), angle,
        notation: `${target.name}${suffix}`, reason: '' },
    });
  };
  for (const frame of canonical.frames) {
    const target = canonical.turnTargetById.get(`frame:${frame.id}`)!;
    const selected: number[] = [];
    sites.forEach((p, i) => { if (frame.selector(p)) selected.push(i); });
    for (const angle of angles) if (validateFrameRotation(canonical.cubies, frame, angle).legal) addAtom(target, selected, angle, frame.id);
  }
  progress?.(`L${level}: ${atoms.length} frame atoms built`);
  let done = 0;
  for (const target of canonical.turnTargets) {
    if (target.kind !== 'extension') continue;
    const local = localLegalityCubies(target, cubieAt, extent);
    const selected = local.filter((c) => target.selector(c.homePosition)).map((c) => siteAt(c.homePosition));
    if (selected.length !== target.affectedCountEstimate) throw new Error(`${target.id}: selected-site count differs`);
    for (const angle of angles) if (validateTurnTargetRotation(local, target, angle).legal) addAtom(target, selected, angle);
    if (++done % 10000 === 0) progress?.(`L${level}: ${done} extension targets checked, ${atoms.length} legal atoms`);
  }
  const atomsAt: number[][] = Array.from({ length: N }, () => []);
  const parent = Int32Array.from({ length: N }, (_, i) => i);
  const root = (site: number): number => {
    while (parent[site] !== site) { parent[site] = parent[parent[site]!]!; site = parent[site]!; }
    return site;
  };
  atoms.forEach((a, i) => {
    for (const [s, t] of a.map) {
      atomsAt[s]!.push(i);
      const rs = root(s); const rt = root(t);
      if (rs !== rt) parent[rs] = rt;
    }
  });
  const orbits: number[][] = [];
  const orbitOf = new Int32Array(N);
  const index = new Map<number, number>();
  for (let s = 0; s < N; s++) {
    const r = root(s);
    let oi = index.get(r);
    if (oi === undefined) { oi = orbits.length; index.set(r, oi); orbits.push([]); }
    orbitOf[s] = oi;
    orbits[oi]!.push(s);
  }
  progress?.(`L${level}: ${atoms.length} legal atoms, ${orbits.length} orbits, ${(performance.now() - start).toFixed(0)} ms`);
  return { level, canonical, N, sites, siteAt, atoms, atomById: new Map(atoms.map((a) => [a.id, a])), atomsAt, orbits, orbitOf, buildMs: performance.now() - start };
};

export const inverseAtom = (group: SparseGroup, a: SparseAtom): SparseAtom => {
  const atom = group.atomById.get(`${a.kind === 'frame' ? 'f' : 'e'}:${a.refId}:${inverseAngle(a.angle)}`);
  if (!atom) throw new Error(`Missing inverse of ${a.id}`);
  return atom;
};
export const inverseWord = (group: SparseGroup, word: SparseAtom[]): SparseAtom[] => word.slice().reverse().map((a) => inverseAtom(group, a));
export const fullAction = (word: readonly SparseAtom[]): SparseAction => {
  // Long isolation words revisit broad frames many times. Composing their
  // selected-site actions costs sum |support(atom)|, whereas tracing their
  // support union through every atom costs |union| * word.length.
  if (word.length >= 32) {
    const n = word.reduce((m, a) => Math.max(m, a.maxSite + 1), 0);
    const width = word.reduce((m, a) => Math.max(m, a.map.size), 0);
    const at = Int32Array.from({ length: n }, (_, i) => i);
    const rot = new Uint8Array(n);
    const scratch = new Int32Array(width); const scratchRot = new Uint8Array(width);
    for (const a of word) {
      let i = 0;
      for (const s of a.map.keys()) { scratch[i] = at[s]!; scratchRot[i++] = rot[s]!; }
      i = 0;
      for (const t of a.map.values()) { at[t] = scratch[i]!; rot[t] = rotMul[a.rot]![scratchRot[i++]!]!; }
    }
    const result: SparseAction = new Map();
    for (let s = 0; s < n; s++) if (at[s] !== s || rot[s] !== ROT_ID) result.set(at[s]!, [s, rot[s]!]);
    return result;
  }
  const support = new Set<number>();
  for (const a of word) for (const s of a.map.keys()) support.add(s);
  return actionOver(word, support);
};
export const actionOver = (word: readonly SparseAtom[], support: Iterable<number>): SparseAction => {
  const result: SparseAction = new Map();
  for (const start of support) {
    let site = start; let rot = ROT_ID;
    for (const atom of word) {
      const to = atom.map.get(site);
      if (to === undefined) continue;
      site = to; rot = rotMul[atom.rot]![rot]!;
    }
    if (site !== start || rot !== ROT_ID) result.set(start, [site, rot]);
  }
  return result;
};

/** Reject off-grid orientations instead of rounding an arbitrary quaternion. */
export const rotationOfCubie = (cubie: Cubie): number => {
  if (Math.abs(cubie.orientation.lengthSq() - 1) > 1e-6) throw new Error(`Cell ${cubie.id} has a non-unit quaternion`);
  const e = new Matrix4().makeRotationFromQuaternion(cubie.orientation).elements;
  const m = [e[0]!, e[4]!, e[8]!, e[1]!, e[5]!, e[9]!, e[2]!, e[6]!, e[10]!];
  if (m.some((v) => Math.abs(v - Math.round(v)) > 1e-6)) throw new Error(`Cell ${cubie.id} has a non-grid orientation`);
  const i = rotationIndex.get(matrixKey(m.map(Math.round)));
  if (i === undefined) throw new Error(`Cell ${cubie.id} has an invalid rotation`);
  return i;
};

export interface OrbitFrame { freedom: number[]; ref: Int8Array }
/** Exact graph holonomy: each edge supplies ref[to]^-1 * rot * ref[from]. */
export const orientationFrames = (group: SparseGroup): OrbitFrame[] => {
  const ref = new Int8Array(group.N).fill(-1);
  const loops: Set<number>[] = group.orbits.map(() => new Set([ROT_ID]));
  for (const sites of group.orbits) {
    const queue = [sites[0]!]; ref[sites[0]!] = ROT_ID;
    for (let head = 0; head < queue.length; head++) {
      const site = queue[head]!;
      for (const ai of group.atomsAt[site]!) {
        const atom = group.atoms[ai]!; const to = atom.map.get(site)!;
        const r = rotMul[atom.rot]![ref[site]!]!;
        if (ref[to] === -1) { ref[to] = r; queue.push(to); }
        loops[group.orbitOf[site]!]!.add(rotMul[rotInv[ref[to]!]!]![r]!);
      }
    }
    if (queue.length !== sites.length) throw new Error('Position orbit is disconnected');
  }
  return loops.map((generators) => {
    const freedom = [ROT_ID]; const seen = new Set(freedom);
    for (let head = 0; head < freedom.length; head++) for (const g of generators) {
      const p = rotMul[g]![freedom[head]!]!;
      if (!seen.has(p)) { seen.add(p); freedom.push(p); }
    }
    return { freedom: freedom.sort((a, b) => a - b), ref };
  });
};

export const parityVector = (group: SparseGroup, map: ReadonlyMap<number, number>): bigint => {
  const seen = new Set<number>(); let vector = 0n;
  for (const start of map.keys()) {
    if (seen.has(start)) continue;
    let site = start; let length = 0;
    do { seen.add(site); site = map.get(site) ?? site; length++; } while (site !== start);
    if (length % 2 === 0) vector ^= 1n << BigInt(group.orbitOf[start]!);
  }
  return vector;
};

export const parityBasis = (group: SparseGroup): Array<{ vector: bigint; word: SparseAtom[] }> => {
  const basis: Array<{ vector: bigint; word: SparseAtom[] }> = [];
  const highBit = (v: bigint): number => v.toString(2).length - 1;
  const distinct = new Set<string>();
  for (const a of group.atoms) {
    let vector = parityVector(group, a.map);
    if (distinct.has(vector.toString())) continue;
    distinct.add(vector.toString());
    let word = [a];
    for (const row of basis) if ((vector >> BigInt(highBit(row.vector))) & 1n) { vector ^= row.vector; word = [...word, ...row.word]; }
    if (vector) { basis.push({ vector, word }); basis.sort((a, b) => highBit(b.vector) - highBit(a.vector)); }
  }
  return basis;
};

/** One representative of each distinct action on an orbit. */
export const orbitAlphabet = (group: SparseGroup, orbit: number): SparseAtom[] => {
  const ids = new Set(group.orbits[orbit]!.flatMap((s) => group.atomsAt[s]!));
  const seen = new Set<string>(); const out: SparseAtom[] = [];
  for (const i of [...ids].sort((a, b) => a - b)) {
    const a = group.atoms[i]!;
    const key = group.orbits[orbit]!.flatMap((s) => {
      const to = a.map.get(s); return to === undefined || to === s ? [] : [`${s}>${to}`];
    }).join(';');
    if (!key || seen.has(key)) continue;
    seen.add(key); out.push(a);
  }
  return out;
};

// Shared by restoration and certified Level4 reduction to avoid duplicating its
// multi-million-entry atom maps in the same worker.
const sharedGroups = new Map<number, SparseGroup>();
export const getCachedSparseGroup = (level: number): SparseGroup => {
  let group = sharedGroups.get(level);
  if (!group) { group = createSparseGroup(level); sharedGroups.set(level, group); }
  return group;
};

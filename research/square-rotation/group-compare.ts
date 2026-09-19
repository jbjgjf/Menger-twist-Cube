/**
 * Group-structure comparison of the shipped Level 2 move group and the extended
 * one, at the level of the invariants the completeness argument actually uses.
 *
 *   G = <the 468 legal existing atomic moves>            (the physical model)
 *   H = <those 468 plus the 54 additional square-ring rotations>
 *
 * G <= H holds by construction because every existing atom is kept, so the only
 * interesting question is whether the containment is strict. This script does
 * not try to answer that by matching invariants — matching invariants prove
 * nothing — it computes the invariants because (a) they are the numbers the
 * wiki's completeness plan needs and has never had for the *physical* 468-atom
 * model, and (b) a single mismatch would be a proof that H is strictly larger.
 *
 * Why the same numbers are recomputed here rather than read from the wiki: the
 * documented table (11 orbits, CC=3/CE=4/EC=1/EEa=8/EEo=4) belongs to the *old
 * abstract* model with 972 atoms. `wiki/Level-2-Complete-Answer.md` 4.6-4.7 says
 * in as many words that it was never redone after 168 of the depth-2 candidates
 * turned out to be illegal. So the G column below is a new measurement, and it
 * has to be kept apart from the G-vs-H comparison it is being used for.
 *
 * Order of business, and why it is that order:
 *
 *   1. build every atom as (permutation of the 400 sites, element of SO(3,Z));
 *   2. check that representation against `@menger/engine` move for move — an
 *      unvalidated simulator would make every number below meaningless, so
 *      nothing downstream is reported if this fails;
 *   3. position orbits (union-find, `wiki/Proof-Architecture.md` Lemma 3);
 *   4. orientation freedom per orbit (full BFS of the single-cell automaton);
 *   5. orbit parity and its GF(2) span;
 *   6. membership of each additional atom in G: invariants first (a violation
 *      is a proof of strictness), then a bounded constructive search.
 *
 * Run: `node --import tsx research/square-rotation/group-compare.ts`
 *      (add `--deep-search` to raise the meet-in-the-middle bound; see below)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Matrix4, Vector3 } from 'three';
import type { Quaternion, Vector3Tuple } from 'three';
import {
  applyExtensionRotation,
  applyTwistToCubies,
  cloneCubies,
  createMengerPuzzleState,
  rotatePositionAroundPivot,
  validateTurnTargetRotation,
} from '../../packages/engine/src/index';
import type { Cubie, TurnTarget, TwistAngle } from '../../packages/engine/src/index';
import { rotationMatrix } from './existing';
import { axisNames, cellKey, targetForCells } from './model';
import type { AxisIndex, Candidate } from './model';

const LEVEL = 2;
const here = dirname(new URL(import.meta.url).pathname);
const inputPath = resolve(here, 'out/l2-extended-moves.json');
const outputPath = resolve(here, 'out/l2-group-compare.json');
const deepSearch = process.argv.includes('--deep-search');
const startedAt = Date.now();

// ---------------------------------------------------------------------------
// 1a. The 24 integer rotations, as row-major 3x3 matrices.
// ---------------------------------------------------------------------------
// Orientations are tracked as an index into this table rather than as a
// quaternion: the engine's quaternions are floating point, and the whole point
// of a discrete audit is that composition must be exact.

type Mat = readonly number[];

const identityMat: Mat = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const mulMat = (a: Mat, b: Mat): number[] => {
  const product = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      for (let k = 0; k < 3; k += 1) {
        product[row * 3 + column]! += a[row * 3 + k]! * b[k * 3 + column]!;
      }
    }
  }
  return product;
};

const matKey = (matrix: Mat): string => matrix.join(',');

// Right-hand-rule quarter turns, matching the engine's `rotatePosition`.
const quarterX: Mat = [1, 0, 0, 0, 0, -1, 0, 1, 0];
const quarterY: Mat = [0, 0, 1, 0, 1, 0, -1, 0, 0];
const quarterZ: Mat = [0, -1, 0, 1, 0, 0, 0, 0, 1];

const rotations: Mat[] = (() => {
  const found = new Map<string, Mat>([[matKey(identityMat), identityMat]]);
  const queue: Mat[] = [identityMat];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const generator of [quarterX, quarterY, quarterZ]) {
      const next = mulMat(generator, current);
      if (found.has(matKey(next))) continue;
      found.set(matKey(next), next);
      queue.push(next);
    }
  }
  return [...found.values()];
})();
if (rotations.length !== 24) throw new Error(`expected 24 rotations, built ${rotations.length}`);

const rotIndexByKey = new Map<string, number>(rotations.map((matrix, index) => [matKey(matrix), index]));
const ROT_ID = rotIndexByKey.get(matKey(identityMat))!;
const rotMul: number[][] = rotations.map((a) => rotations.map((b) => rotIndexByKey.get(matKey(mulMat(a, b)))!));
const rotOrder = (index: number): number => {
  let order = 1;
  let current = index;
  while (current !== ROT_ID) {
    current = rotMul[index]![current]!;
    order += 1;
  }
  return order;
};

/** The engine stores orientation as a quaternion; map it back to an index. */
const rotIndexOfQuaternion = (quaternion: Quaternion): number => {
  const matrix = new Matrix4().makeRotationFromQuaternion(quaternion);
  const columns = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)].map((v) =>
    v.applyMatrix4(matrix),
  );
  const round = (value: number): number => (value > 0.5 ? 1 : value < -0.5 ? -1 : 0);
  const key = [
    round(columns[0]!.x), round(columns[1]!.x), round(columns[2]!.x),
    round(columns[0]!.y), round(columns[1]!.y), round(columns[2]!.y),
    round(columns[0]!.z), round(columns[1]!.z), round(columns[2]!.z),
  ].join(',');
  const index = rotIndexByKey.get(key);
  if (index === undefined) throw new Error(`orientation is not one of the 24 lattice rotations: ${key}`);
  return index;
};

// ---------------------------------------------------------------------------
// 1b. Sites and the five coordinate classes.
// ---------------------------------------------------------------------------

interface RawOperation {
  id: string;
  family?: string;
  axis: Vector3Tuple;
  pivot: Vector3Tuple;
  angle: TwistAngle;
  side?: number;
  support: Vector3Tuple[];
}
interface AuditInput {
  level: number;
  cells: Vector3Tuple[];
  existing: RawOperation[];
  additional: RawOperation[];
}

const input = JSON.parse(readFileSync(inputPath, 'utf8')) as AuditInput;
if (input.level !== LEVEL) throw new Error(`input is level ${input.level}, expected ${LEVEL}`);

const engineState = createMengerPuzzleState(LEVEL);
const sitePositions: Vector3Tuple[] = input.cells.map((cell) => [...cell] as Vector3Tuple);
const N = sitePositions.length;
const siteIndexByKey = new Map<string, number>(sitePositions.map((position, index) => [cellKey(position), index]));
if (siteIndexByKey.size !== N) throw new Error('duplicate cell in the audit input');
// The audit input must describe the same 400 cells the engine generates,
// otherwise site indices below mean different things in the two worlds.
for (const cubie of engineState.cubies) {
  if (!siteIndexByKey.has(cellKey(cubie.homePosition as Vector3Tuple))) {
    throw new Error(`engine cell ${cellKey(cubie.homePosition as Vector3Tuple)} missing from the audit input`);
  }
}
if (engineState.cubies.length !== N) throw new Error(`engine has ${engineState.cubies.length} cells, input has ${N}`);

/** `p = 3b + o`: the block digit and the in-block offset digit. */
const blockOf = (p: Vector3Tuple): Vector3Tuple => [
  Math.floor((p[0] + 4) / 3) - 1,
  Math.floor((p[1] + 4) / 3) - 1,
  Math.floor((p[2] + 4) / 3) - 1,
];
const offsetOf = (p: Vector3Tuple): Vector3Tuple => {
  const b = blockOf(p);
  return [p[0] - 3 * b[0], p[1] - 3 * b[1], p[2] - 3 * b[2]];
};
type PieceClass = 'CC' | 'CE' | 'EC' | 'EEa' | 'EEo';
const classOfPosition = (p: Vector3Tuple): PieceClass => {
  const b = blockOf(p);
  const o = offsetOf(p);
  const bZeros = b.filter((value) => value === 0).length;
  const oZeros = o.filter((value) => value === 0).length;
  if (bZeros === 0 && oZeros === 0) return 'CC';
  if (bZeros === 0) return 'CE';
  if (oZeros === 0) return 'EC';
  return b.findIndex((value) => value === 0) === o.findIndex((value) => value === 0) ? 'EEa' : 'EEo';
};
const siteClasses: PieceClass[] = sitePositions.map(classOfPosition);

// ---------------------------------------------------------------------------
// 1c. Atoms: a permutation of the sites plus one element of SO(3,Z).
// ---------------------------------------------------------------------------

interface Atom {
  /** Unique per (target, angle). */
  key: string;
  /** The turn-target id, shared by the three angles of one target. */
  targetKey: string;
  origin: 'existing' | 'additional';
  family?: string;
  angle: TwistAngle;
  axis: Vector3Tuple;
  pivot: Vector3Tuple;
  side?: number;
  /** Site indices the target selects — these get both moved and twisted. */
  support: number[];
  /** `perm[site]` = where the content of `site` ends up (identity off support). */
  perm: Int16Array;
  /** Index into `rotations`, premultiplied onto every support cell's orientation. */
  rot: number;
}

const buildAtom = (raw: RawOperation, origin: Atom['origin']): Atom => {
  const perm = new Int16Array(N).map((_, index) => index);
  const support: number[] = [];
  for (const cell of raw.support) {
    const from = siteIndexByKey.get(cellKey(cell));
    if (from === undefined) throw new Error(`support cell ${cellKey(cell)} is not a puzzle cell`);
    // Positions come from the engine's own helper, not a reimplementation.
    const to = siteIndexByKey.get(cellKey(rotatePositionAroundPivot(cell, raw.axis, raw.angle, raw.pivot)));
    if (to === undefined) throw new Error(`atom ${raw.id} moves ${cellKey(cell)} off the cell set`);
    perm[from] = to;
    support.push(from);
  }
  const rot = rotIndexByKey.get(matKey(rotationMatrix(raw.axis, raw.angle)));
  if (rot === undefined) throw new Error(`atom ${raw.id} has a non-lattice rotation`);
  return {
    key: `${raw.id}@${raw.angle}`,
    targetKey: raw.id,
    origin,
    family: raw.family,
    angle: raw.angle,
    axis: raw.axis,
    pivot: raw.pivot,
    side: raw.side,
    support,
    perm,
    rot,
  };
};

const existingAtoms = input.existing.map((raw) => buildAtom(raw, 'existing'));
const additionalAtoms = input.additional.map((raw) => buildAtom(raw, 'additional'));
const atomsG = existingAtoms;
const atomsH = [...existingAtoms, ...additionalAtoms];
if (atomsG.length !== 468) throw new Error(`expected 468 existing atoms, got ${atomsG.length}`);
if (additionalAtoms.length !== 54) throw new Error(`expected 54 additional atoms, got ${additionalAtoms.length}`);

/** One synthetic `TurnTarget` per target id, so the engine can judge and apply it. */
const syntheticTargets = new Map<string, TurnTarget>();
for (const atom of atomsH) {
  if (syntheticTargets.has(atom.targetKey)) continue;
  const axisIndex = (atom.axis[0] !== 0 ? 0 : atom.axis[1] !== 0 ? 1 : 2) as AxisIndex;
  if (atom.axis[axisIndex] !== 1) throw new Error(`atom ${atom.key} has a non-positive unit axis`);
  const candidate: Candidate = {
    id: atom.targetKey,
    family: 'subset',
    axisIndex,
    axisName: axisNames[axisIndex],
    layers: [atom.pivot[axisIndex]!],
    pivot: atom.pivot,
    pivotInPlane: [0, 0],
    cells: atom.support.map((site) => sitePositions[site]!),
  };
  syntheticTargets.set(atom.targetKey, targetForCells(candidate));
}

const inverseAtomIndex: number[] = (() => {
  const byKey = new Map<string, number>(atomsH.map((atom, index) => [atom.key, index]));
  return atomsH.map((atom, index) => {
    const inverseAngle: TwistAngle = atom.angle === 180 ? 180 : atom.angle === 90 ? -90 : 90;
    const found = byKey.get(`${atom.targetKey}@${inverseAngle}`);
    if (found === undefined) throw new Error(`atom ${atom.key} has no inverse in the atom set`);
    void index;
    return found;
  });
})();

// ---------------------------------------------------------------------------
// 2. Differential check of the representation against the engine.
// ---------------------------------------------------------------------------
// Two separate things are checked, because they can fail independently:
//
//   (a) fidelity of the *input data*: applying a synthetic target built from the
//       recorded (axis, pivot, support) must equal what the shipped move does,
//       for all 468 existing atoms on the solved state. This is what catches a
//       wrong pivot or a support recorded from the wrong state.
//   (b) fidelity of the *simulator*: random words over existing AND additional
//       atoms, compared on all 400 positions and orientations.

interface SimState {
  /** `siteOf[piece]` — where the piece whose home is `piece` currently sits. */
  siteOf: Int16Array;
  /** `rotOf[piece]` — its orientation as an index into `rotations`. */
  rotOf: Uint8Array;
  /** `pieceAt[site]` — inverse of `siteOf`, needed to apply an atom. */
  pieceAt: Int16Array;
}

const solvedSim = (): SimState => ({
  siteOf: new Int16Array(N).map((_, index) => index),
  rotOf: new Uint8Array(N).fill(ROT_ID),
  pieceAt: new Int16Array(N).map((_, index) => index),
});
const cloneSim = (state: SimState): SimState => ({
  siteOf: state.siteOf.slice(),
  rotOf: state.rotOf.slice(),
  pieceAt: state.pieceAt.slice(),
});
const applyAtomToSim = (state: SimState, atom: Atom): void => {
  const pieces = atom.support.map((site) => state.pieceAt[site]!);
  for (let index = 0; index < atom.support.length; index += 1) {
    const piece = pieces[index]!;
    state.siteOf[piece] = atom.perm[atom.support[index]!]!;
    state.rotOf[piece] = rotMul[atom.rot]![state.rotOf[piece]!]!;
  }
  for (const piece of pieces) state.pieceAt[state.siteOf[piece]!] = piece;
};

const pieceOfCubie = new Map<string, number>(
  engineState.cubies.map((cubie) => [cubie.id, siteIndexByKey.get(cellKey(cubie.homePosition as Vector3Tuple))!]),
);
const compareWithEngine = (state: SimState, cubies: Cubie[]): number => {
  let mismatches = 0;
  for (const cubie of cubies) {
    const piece = pieceOfCubie.get(cubie.id)!;
    const engineSite = siteIndexByKey.get(cellKey(cubie.currentPosition as Vector3Tuple));
    if (engineSite === undefined || engineSite !== state.siteOf[piece]) {
      mismatches += 1;
      continue;
    }
    if (rotIndexOfQuaternion(cubie.orientation) !== state.rotOf[piece]) mismatches += 1;
  }
  return mismatches;
};

/** Apply one atom on the real engine, refusing to silently no-op on illegality. */
const applyAtomToEngine = (cubies: Cubie[], atom: Atom): Cubie[] => {
  const target = syntheticTargets.get(atom.targetKey)!;
  const verdict = validateTurnTargetRotation(cubies, target, atom.angle);
  if (!verdict.legal) throw new Error(`engine rejected ${atom.key}: ${verdict.code} (${verdict.message})`);
  return applyExtensionRotation(cubies, atom.targetKey, atom.angle, syntheticTargets);
};

/** (a) the recorded existing atoms reproduce the shipped moves exactly. */
const dataFidelity = (() => {
  let checked = 0;
  let mismatches = 0;
  for (const atom of existingAtoms) {
    const viaSynthetic = applyAtomToEngine(cloneCubies(engineState.cubies), atom);
    const viaShipped = atom.targetKey.startsWith('frame:')
      ? applyTwistToCubies(
          cloneCubies(engineState.cubies),
          atom.targetKey.slice('frame:'.length),
          atom.angle,
          engineState.frameById,
        )
      : applyExtensionRotation(cloneCubies(engineState.cubies), atom.targetKey, atom.angle, engineState.turnTargetById);
    const byId = new Map(viaShipped.map((cubie) => [cubie.id, cubie]));
    let bad = 0;
    for (const cubie of viaSynthetic) {
      const other = byId.get(cubie.id)!;
      if (cellKey(cubie.currentPosition as Vector3Tuple) !== cellKey(other.currentPosition as Vector3Tuple)) bad += 1;
      else if (rotIndexOfQuaternion(cubie.orientation) !== rotIndexOfQuaternion(other.orientation)) bad += 1;
    }
    checked += 1;
    if (bad > 0) mismatches += 1;
  }
  return { atomsChecked: checked, atomsMismatched: mismatches };
})();
if (dataFidelity.atomsMismatched > 0) {
  throw new Error(`${dataFidelity.atomsMismatched} recorded existing atoms disagree with the shipped move`);
}

/** (b) random words, both origins, compared cell by cell. */
const differential = (() => {
  const seeds = [1, 2, 3, 4, 5, 6];
  const wordLength = 40;
  const results: Array<{ seed: number; length: number; additionalUsed: number; mismatches: number }> = [];
  for (const seed of seeds) {
    let rng = seed * 2654435761;
    const nextInt = (bound: number): number => {
      rng = (rng * 1664525 + 1013904223) >>> 0;
      return rng % bound;
    };
    const sim = solvedSim();
    let cubies = cloneCubies(engineState.cubies);
    let additionalUsed = 0;
    for (let step = 0; step < wordLength; step += 1) {
      // Draw from the additional atoms about a third of the time, so the check
      // exercises the new operations and not just the shipped ones.
      const useAdditional = nextInt(3) === 0;
      const atom = useAdditional
        ? additionalAtoms[nextInt(additionalAtoms.length)]!
        : existingAtoms[nextInt(existingAtoms.length)]!;
      if (useAdditional) additionalUsed += 1;
      applyAtomToSim(sim, atom);
      cubies = applyAtomToEngine(cubies, atom);
    }
    results.push({ seed, length: wordLength, additionalUsed, mismatches: compareWithEngine(sim, cubies) });
  }
  return results;
})();
const differentialFailures = differential.filter((trial) => trial.mismatches > 0).length;
if (differentialFailures > 0) {
  throw new Error(`simulator disagreed with the engine in ${differentialFailures}/${differential.length} trials`);
}

// ---------------------------------------------------------------------------
// 3. Position orbits (Lemma 3: components of the "some atom moves x to y" graph).
// ---------------------------------------------------------------------------

interface OrbitDecomposition {
  orbitOfSite: Int32Array;
  orbitSites: number[][];
}
const decomposeOrbits = (atoms: Atom[]): OrbitDecomposition => {
  const parent = new Int32Array(N).map((_, index) => index);
  const findRoot = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[x] !== root) {
      const next = parent[x]!;
      parent[x] = root;
      x = next;
    }
    return root;
  };
  for (const atom of atoms) {
    for (const from of atom.support) {
      const to = atom.perm[from]!;
      if (from === to) continue;
      const a = findRoot(from);
      const b = findRoot(to);
      if (a !== b) parent[a] = b;
    }
  }
  const orbitOfSite = new Int32Array(N).fill(-1);
  const orbitSites: number[][] = [];
  const indexByRoot = new Map<number, number>();
  for (let site = 0; site < N; site += 1) {
    const root = findRoot(site);
    let orbit = indexByRoot.get(root);
    if (orbit === undefined) {
      orbit = orbitSites.length;
      indexByRoot.set(root, orbit);
      orbitSites.push([]);
    }
    orbitOfSite[site] = orbit;
    orbitSites[orbit]!.push(site);
  }
  return { orbitOfSite, orbitSites };
};

const orbitsG = decomposeOrbits(atomsG);
const orbitsH = decomposeOrbits(atomsH);

const histogram = (sizes: number[]): string =>
  [...new Map([...sizes].sort((a, b) => a - b).reduce((map, size) => map.set(size, (map.get(size) ?? 0) + 1), new Map<number, number>()))]
    .map(([size, count]) => `${size}x${count}`)
    .join(', ');

const describeOrbits = (decomposition: OrbitDecomposition) =>
  decomposition.orbitSites.map((sites, index) => {
    const classes = [...new Set(sites.map((site) => siteClasses[site]!))].sort();
    return {
      orbit: index,
      size: sites.length,
      classes,
      /** A class label is only meaningful if the orbit does not mix classes. */
      classLabel: classes.length === 1 ? classes[0]! : `mixed(${classes.join('+')})`,
      representative: sitePositions[sites[0]!]!,
    };
  });

const orbitTableG = describeOrbits(orbitsG);
const orbitTableH = describeOrbits(orbitsH);

// Every H-orbit is a union of G-orbits (H has more generators, so its graph has
// more edges); that is what makes the H partition usable as a common coarsening.
const merges = orbitsH.orbitSites.map((sites, index) => {
  const inside = [...new Set(sites.map((site) => orbitsG.orbitOfSite[site]!))].sort((a, b) => a - b);
  return { hOrbit: index, size: sites.length, gOrbits: inside };
});
const mergedOrbits = merges.filter((entry) => entry.gOrbits.length > 1);
for (const entry of merges) {
  for (const gOrbit of entry.gOrbits) {
    const gSites = orbitsG.orbitSites[gOrbit]!;
    if (gSites.some((site) => orbitsH.orbitOfSite[site] !== entry.hOrbit)) {
      throw new Error(`G-orbit ${gOrbit} is not contained in a single H-orbit`);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Orientation freedom: the single-cell automaton on (position x 24).
// ---------------------------------------------------------------------------
// A lone piece, every other cell ignored. States are `site * 24 + rotation`;
// transitions are the atoms whose support contains the site. The orientations
// reachable back at the piece's home form a subgroup of the 24 lattice
// rotations, and its order is the "orientation freedom" of the wiki table.

const atomsBySite = (atoms: Atom[]): number[][] => {
  const lists: number[][] = Array.from({ length: N }, () => []);
  atoms.forEach((atom, index) => {
    for (const site of atom.support) lists[site]!.push(index);
  });
  return lists;
};
const atomsBySiteG = atomsBySite(atomsG);
const atomsBySiteH = atomsBySite(atomsH);

const reachableStates = (atoms: Atom[], bySite: number[][], home: number): Uint8Array => {
  const seen = new Uint8Array(N * 24);
  const start = home * 24 + ROT_ID;
  seen[start] = 1;
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const state = queue[head]!;
    const site = (state / 24) | 0;
    const rotation = state % 24;
    for (const atomIndex of bySite[site]!) {
      const atom = atoms[atomIndex]!;
      const next = atom.perm[site]! * 24 + rotMul[atom.rot]![rotation]!;
      if (seen[next]) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return seen;
};

/** Which of the 24 rotations are reachable with the piece back at `home`. */
const homeRotations = (seen: Uint8Array, home: number): number[] => {
  const found: number[] = [];
  for (let rotation = 0; rotation < 24; rotation += 1) if (seen[home * 24 + rotation]) found.push(rotation);
  return found;
};

/**
 * Name the subgroup. Inside the rotation group of the cube (isomorphic to S4)
 * the order plus the element-order multiset already determines the type, so no
 * isomorphism testing is needed.
 */
const subgroupType = (elements: number[]): string => {
  const order = elements.length;
  const orders = elements.map(rotOrder);
  const has = (k: number): boolean => orders.includes(k);
  if (order === 1) return 'trivial';
  if (order === 2) return 'C2';
  if (order === 3) return 'C3';
  if (order === 4) return has(4) ? 'C4' : 'C2xC2';
  if (order === 6) return has(6) ? 'C6' : 'S3';
  if (order === 8) return 'D4';
  if (order === 12) return 'A4';
  if (order === 24) return 'S4 (full rotation group)';
  return `order ${order}`;
};

const orientationReport = (atoms: Atom[], bySite: number[][], decomposition: OrbitDecomposition) =>
  decomposition.orbitSites.map((sites, index) => {
    // Computed at every cell of the orbit, not just a representative: the
    // subgroups at two cells of one orbit are conjugate but need not be equal,
    // and a non-uniform order would be a fact worth seeing.
    const perSite = sites.map((site) => homeRotations(reachableStates(atoms, bySite, site), site));
    const orders = [...new Set(perSite.map((rotationsAtHome) => rotationsAtHome.length))].sort((a, b) => a - b);
    const types = [...new Set(perSite.map(subgroupType))].sort();
    return {
      orbit: index,
      size: sites.length,
      classLabel: describeOrbits(decomposition)[index]!.classLabel,
      freedom: orders.length === 1 ? orders[0]! : -1,
      freedomOrders: orders,
      groupType: types.length === 1 ? types[0]! : `mixed(${types.join('+')})`,
      uniform: orders.length === 1 && types.length === 1,
    };
  });

const orientationG = orientationReport(atomsG, atomsBySiteG, orbitsG);
const orientationH = orientationReport(atomsH, atomsBySiteH, orbitsH);

/** Class-level summary, for direct comparison with the wiki's five-row table. */
const byClass = (report: ReturnType<typeof orientationReport>) => {
  const map = new Map<string, { orbits: number; cells: number; freedoms: Set<number>; types: Set<string> }>();
  for (const row of report) {
    const entry = map.get(row.classLabel) ?? { orbits: 0, cells: 0, freedoms: new Set<number>(), types: new Set<string>() };
    entry.orbits += 1;
    entry.cells += row.size;
    for (const order of row.freedomOrders) entry.freedoms.add(order);
    entry.types.add(row.groupType);
    map.set(row.classLabel, entry);
  }
  return [...map].map(([classLabel, entry]) => ({
    classLabel,
    orbits: entry.orbits,
    cells: entry.cells,
    freedoms: [...entry.freedoms].sort((a, b) => a - b),
    types: [...entry.types].sort(),
  }));
};
const classSummaryG = byClass(orientationG);
const classSummaryH = byClass(orientationH);

// ---------------------------------------------------------------------------
// 5. Orbit parity and its GF(2) span.
// ---------------------------------------------------------------------------
// A permutation restricted to an orbit is odd exactly when it has an odd number
// of even-length cycles. Parity is a homomorphism to F2^r, so the reachable
// parity vectors are exactly the span of the generators' vectors.

/** Parity of `atom` restricted to each part of a partition, as a bit vector. */
const parityVector = (atom: Atom, partOfSite: Int32Array, parts: number): bigint => {
  const oddParts = new Uint8Array(parts);
  const seen = new Set<number>();
  for (const from of atom.support) {
    if (seen.has(from)) continue;
    let cycleLength = 0;
    let current = from;
    do {
      seen.add(current);
      current = atom.perm[current]!;
      cycleLength += 1;
    } while (current !== from);
    if (cycleLength % 2 === 0) {
      const part = partOfSite[from]!;
      oddParts[part] = oddParts[part] ? 0 : 1;
    }
  }
  let vector = 0n;
  for (let part = 0; part < parts; part += 1) if (oddParts[part]) vector |= 1n << BigInt(part);
  return vector;
};

const reduceIntoBasis = (basis: bigint[], vector: bigint): bigint => {
  let value = vector;
  for (const row of basis) {
    const pivot = row & -row;
    if ((value & pivot) !== 0n) value ^= row;
  }
  return value;
};
const spanOf = (vectors: bigint[]): bigint[] => {
  const basis: bigint[] = [];
  for (const vector of vectors) {
    const reduced = reduceIntoBasis(basis, vector);
    if (reduced !== 0n) basis.push(reduced);
  }
  return basis;
};
const inSpan = (basis: bigint[], vector: bigint): boolean => reduceIntoBasis(basis, vector) === 0n;

// A cycle of an atom never leaves a part, so a parity vector is well defined
// only on a partition the atom preserves. G's atoms preserve G-orbits and (being
// atoms of H too) H-orbits; H's additional atoms preserve H-orbits by the same
// argument, but whether they preserve G-orbits is exactly one of the open
// questions, so that is checked rather than assumed.
const preservesPartition = (atom: Atom, partOfSite: Int32Array): boolean =>
  atom.support.every((site) => partOfSite[site] === partOfSite[atom.perm[site]!]);

const parityNativeG = atomsG.map((atom) => parityVector(atom, orbitsG.orbitOfSite, orbitsG.orbitSites.length));
const parityOnHG = atomsG.map((atom) => parityVector(atom, orbitsH.orbitOfSite, orbitsH.orbitSites.length));
const parityOnHH = atomsH.map((atom) => parityVector(atom, orbitsH.orbitOfSite, orbitsH.orbitSites.length));

// The task's prescribed re-expression — sum the G-orbit parities inside each
// H-orbit — must agree with taking the parity of the restriction to the H-orbit
// directly. Asserting it keeps the two descriptions of the method honest.
for (let index = 0; index < atomsG.length; index += 1) {
  let folded = 0n;
  for (let gOrbit = 0; gOrbit < orbitsG.orbitSites.length; gOrbit += 1) {
    if (((parityNativeG[index]! >> BigInt(gOrbit)) & 1n) === 0n) continue;
    const hOrbit = orbitsH.orbitOfSite[orbitsG.orbitSites[gOrbit]![0]!]!;
    folded ^= 1n << BigInt(hOrbit);
  }
  if (folded !== parityOnHG[index]) throw new Error(`parity folding mismatch for ${atomsG[index]!.key}`);
}

const basisNativeG = spanOf(parityNativeG);
const basisOnHG = spanOf(parityOnHG);
const basisOnHH = spanOf(parityOnHH);
const distinctNonZero = (vectors: bigint[]): number => new Set(vectors.filter((v) => v !== 0n).map(String)).size;

const parityReport = {
  method:
    'Common partition = the H-orbit partition. Every H-orbit is a union of G-orbits (verified), ' +
    "so G's generator parity vectors are re-expressed on H-orbits by XOR-ing the parities of the " +
    'G-orbits inside each H-orbit; this was checked to equal the parity of the restriction to the ' +
    'H-orbit directly. Ranks on the native G-orbit partition are reported separately.',
  onHOrbits: {
    parts: orbitsH.orbitSites.length,
    rankG: basisOnHG.length,
    rankH: basisOnHH.length,
    distinctNonZeroG: distinctNonZero(parityOnHG),
    distinctNonZeroH: distinctNonZero(parityOnHH),
    spanSizeG: 2 ** basisOnHG.length,
    spanSizeH: 2 ** basisOnHH.length,
  },
  onGOrbits: {
    parts: orbitsG.orbitSites.length,
    rankG: basisNativeG.length,
    distinctNonZeroG: distinctNonZero(parityNativeG),
    spanSizeG: 2 ** basisNativeG.length,
  },
};

// ---------------------------------------------------------------------------
// 6. Comparison with the documented old abstract model.
// ---------------------------------------------------------------------------

const wikiOldModel: Array<{ classLabel: PieceClass; orbits: number; freedom: number; type: string }> = [
  { classLabel: 'CC', orbits: 4, freedom: 3, type: 'C3' },
  { classLabel: 'CE', orbits: 4, freedom: 4, type: 'C4' },
  { classLabel: 'EC', orbits: 1, freedom: 1, type: 'trivial' },
  { classLabel: 'EEa', orbits: 1, freedom: 8, type: 'D4' },
  { classLabel: 'EEo', orbits: 1, freedom: 4, type: 'C4' },
];
const wikiComparison = wikiOldModel.map((row) => {
  const measured = classSummaryG.find((entry) => entry.classLabel === row.classLabel);
  return {
    classLabel: row.classLabel,
    documentedOrbits: row.orbits,
    measuredOrbitsG: measured?.orbits ?? 0,
    documentedFreedom: row.freedom,
    measuredFreedomsG: measured?.freedoms ?? [],
    documentedType: row.type,
    measuredTypesG: measured?.types ?? [],
    orbitsAgree: measured !== undefined && measured.orbits === row.orbits,
    freedomAgrees:
      measured !== undefined && measured.freedoms.length === 1 && measured.freedoms[0] === row.freedom,
  };
});

// ---------------------------------------------------------------------------
// 7a. Invariant test: could each additional atom possibly lie in G?
// ---------------------------------------------------------------------------
// Each test below is a *necessary* condition for membership, so a failure is a
// proof that H is strictly larger than G. Passing all of them proves nothing.

const cacheReachableG = new Map<number, Uint8Array>();
const reachableG = (home: number): Uint8Array => {
  const cached = cacheReachableG.get(home);
  if (cached) return cached;
  const computed = reachableStates(atomsG, atomsBySiteG, home);
  cacheReachableG.set(home, computed);
  return computed;
};

const invariantChecks = additionalAtoms.map((atom) => {
  // (i) an element of G cannot move a cell out of its G-orbit.
  const orbitViolations = atom.support
    .filter((site) => orbitsG.orbitOfSite[site] !== orbitsG.orbitOfSite[atom.perm[site]!])
    .map((site) => ({
      from: sitePositions[site]!,
      to: sitePositions[atom.perm[site]!]!,
      fromOrbit: orbitsG.orbitOfSite[site]!,
      toOrbit: orbitsG.orbitOfSite[atom.perm[site]!]!,
    }));

  // (ii) the state "atom applied to solved" must be single-cell consistent with
  // G: every moved cell's (position, orientation) pair has to be reachable in
  // G's single-cell automaton from its home with identity orientation.
  const orientationViolations = atom.support
    .filter((site) => {
      const destination = atom.perm[site]!;
      return reachableG(site)[destination * 24 + atom.rot] !== 1;
    })
    .map((site) => ({ from: sitePositions[site]!, to: sitePositions[atom.perm[site]!]!, rot: atom.rot }));

  // (iii) the atom's orbit-parity vector must lie in G's parity span. Only
  // meaningful when (i) passes, since otherwise the vector is not defined.
  const parityDefined = preservesPartition(atom, orbitsG.orbitOfSite);
  const vector = parityDefined ? parityVector(atom, orbitsG.orbitOfSite, orbitsG.orbitSites.length) : null;
  const parityInSpan = vector === null ? null : inSpan(basisNativeG, vector);

  return {
    atom: atom.key,
    family: atom.family,
    supportSize: atom.support.length,
    side: atom.side,
    orbitPreserved: orbitViolations.length === 0,
    orbitViolations,
    orientationConsistent: orientationViolations.length === 0,
    orientationViolations,
    parityDefined,
    parityVector: vector === null ? null : vector.toString(),
    parityInSpan,
    violatesSomeInvariant:
      orbitViolations.length > 0 || orientationViolations.length > 0 || parityInSpan === false,
  };
});
const violating = invariantChecks.filter((check) => check.violatesSomeInvariant);
const stillOpen = invariantChecks.filter((check) => !check.violatesSomeInvariant);

/**
 * Which orbits the out-of-span parity vectors actually flip. This is the
 * evidence a reader needs to check the proof by hand: for each distinct vector,
 * the orbits whose bit is set, with their size and five-class label.
 */
const parityEvidence = [...new Set(violating.map((check) => check.parityVector!))].map((value) => {
  const vector = BigInt(value);
  const orbits = orbitTableG
    .filter((row) => ((vector >> BigInt(row.orbit)) & 1n) === 1n)
    .map((row) => ({ orbit: row.orbit, size: row.size, classLabel: row.classLabel }));
  return {
    vector: value,
    orbits,
    atoms: violating.filter((check) => check.parityVector === value).map((check) => check.atom),
  };
});

// ---------------------------------------------------------------------------
// 7a'. Cube symmetries: do they let one membership answer cover a whole family?
// ---------------------------------------------------------------------------
// If the 48 signed-permutation symmetries of the cube map the atom set of G onto
// itself, they normalise G, and then `a in G` iff `gag^-1 in G`. That turns the
// 18 additional targets into a handful of classes — useful because a
// constructive membership proof is expensive per target.

const symmetries: Mat[] = (() => {
  const result: Mat[] = [];
  const axisPermutations = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const permutation of axisPermutations) {
    for (const signs of [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]]) {
      const matrix = new Array<number>(9).fill(0);
      for (let row = 0; row < 3; row += 1) matrix[row * 3 + permutation[row]!] = signs[row]!;
      result.push(matrix);
    }
  }
  return result;
})();

/** Signature of an atom's action: its rotation part plus its site permutation. */
const actionSignature = (rot: number, perm: Int16Array): string => {
  const moves: string[] = [];
  for (let site = 0; site < N; site += 1) if (perm[site] !== site) moves.push(`${site}>${perm[site]}`);
  return `${rot}|${moves.join(';')}`;
};
const conjugateSignature = (atom: Atom, symmetry: Mat): string => {
  const image = new Int16Array(N).map((_, index) => index);
  const siteImage = sitePositions.map((position) => siteIndexByKey.get(cellKey(applyMatToVec(symmetry, position)))!);
  for (const site of atom.support) image[siteImage[site]!] = siteImage[atom.perm[site]!]!;
  const conjugated = mulMat(symmetry, mulMat(rotations[atom.rot]!, transposeMat(symmetry)));
  return actionSignature(rotIndexByKey.get(matKey(conjugated))!, image);
};
function applyMatToVec(matrix: Mat, vector: Vector3Tuple): Vector3Tuple {
  return [
    matrix[0]! * vector[0] + matrix[1]! * vector[1] + matrix[2]! * vector[2],
    matrix[3]! * vector[0] + matrix[4]! * vector[1] + matrix[5]! * vector[2],
    matrix[6]! * vector[0] + matrix[7]! * vector[1] + matrix[8]! * vector[2],
  ];
}
function transposeMat(matrix: Mat): number[] {
  return [matrix[0]!, matrix[3]!, matrix[6]!, matrix[1]!, matrix[4]!, matrix[7]!, matrix[2]!, matrix[5]!, matrix[8]!];
}

const symmetryReport = (() => {
  // The symmetries must first map the cell set onto itself, or nothing below
  // even type-checks geometrically.
  for (const symmetry of symmetries) {
    for (const position of sitePositions) {
      if (!siteIndexByKey.has(cellKey(applyMatToVec(symmetry, position)))) {
        throw new Error(`symmetry ${matKey(symmetry)} moves a cell off the cell set`);
      }
    }
  }
  const existingSignatures = new Set(existingAtoms.map((atom) => actionSignature(atom.rot, atom.perm)));
  const additionalSignatures = new Set(additionalAtoms.map((atom) => actionSignature(atom.rot, atom.perm)));
  let existingClosed = true;
  let additionalClosed = true;
  for (const symmetry of symmetries) {
    for (const atom of existingAtoms) {
      if (!existingSignatures.has(conjugateSignature(atom, symmetry))) existingClosed = false;
    }
    for (const atom of additionalAtoms) {
      if (!additionalSignatures.has(conjugateSignature(atom, symmetry))) additionalClosed = false;
    }
  }
  // Classes of additional atoms under the symmetry group.
  const classOf = new Map<string, number>();
  const classes: string[][] = [];
  for (const atom of additionalAtoms) {
    const signature = actionSignature(atom.rot, atom.perm);
    if (classOf.has(signature)) continue;
    const orbit = new Set<string>([signature]);
    const keyOf = new Map<string, string>([[signature, atom.key]]);
    for (const symmetry of symmetries) {
      for (const other of additionalAtoms) {
        const otherSignature = actionSignature(other.rot, other.perm);
        if (!orbit.has(otherSignature)) continue;
        const conjugated = conjugateSignature(other, symmetry);
        if (!orbit.has(conjugated)) {
          orbit.add(conjugated);
          const match = additionalAtoms.find((candidate) => actionSignature(candidate.rot, candidate.perm) === conjugated);
          if (match) keyOf.set(conjugated, match.key);
        }
      }
    }
    const classIndex = classes.length;
    classes.push([...orbit].map((member) => keyOf.get(member) ?? member));
    for (const member of orbit) classOf.set(member, classIndex);
  }
  return {
    symmetriesChecked: symmetries.length,
    existingAtomSetClosed: existingClosed,
    additionalAtomSetClosed: additionalClosed,
    additionalClassCount: classes.length,
    additionalClasses: classes.map((members) => ({ size: members.length, representative: members[0]!, members })),
  };
})();

// ---------------------------------------------------------------------------
// 7b. Bounded constructive search: is an additional atom a short word in G?
// ---------------------------------------------------------------------------
// The move group acts freely on the solved state (cells are distinguishable, so
// a group element is determined by the state it produces). Hence an additional
// atom lies in G exactly when the state it produces from solved is reachable
// with existing atoms only. Bidirectional BFS on that state graph therefore
// decides membership *for words up to the depth searched* — and only that. A
// negative result here is a lower bound on word length, never a proof of
// non-membership.

const hashSim = (state: SimState): string => {
  // Two independent FNV-1a passes; 64 bits of hash for a few hundred thousand
  // states makes an accidental collision negligible, and every reported hit is
  // re-verified exactly anyway.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let piece = 0; piece < N; piece += 1) {
    const site = state.siteOf[piece]!;
    const rot = state.rotOf[piece]!;
    h1 = (Math.imul(h1 ^ site, 0x01000193) ^ rot) >>> 0;
    h2 = (Math.imul(h2 ^ ((site << 5) | rot), 0x85ebca6b) + 0x9e3779b9) >>> 0;
  }
  return `${h1.toString(36)}:${h2.toString(36)}`;
};

/** States reachable from `start` in at most `depth` atoms, with one word each. */
const ballAround = (start: SimState, atoms: Atom[], depth: number): Map<string, number[]> => {
  const reached = new Map<string, number[]>([[hashSim(start), []]]);
  let frontier: Array<{ state: SimState; word: number[] }> = [{ state: start, word: [] }];
  for (let level = 0; level < depth; level += 1) {
    const next: Array<{ state: SimState; word: number[] }> = [];
    for (const node of frontier) {
      for (let atomIndex = 0; atomIndex < atoms.length; atomIndex += 1) {
        const child = cloneSim(node.state);
        applyAtomToSim(child, atoms[atomIndex]!);
        const hash = hashSim(child);
        if (reached.has(hash)) continue;
        const word = [...node.word, atomIndex];
        reached.set(hash, word);
        next.push({ state: child, word });
      }
    }
    frontier = next;
  }
  return reached;
};

// Words of length <= 4 are searched for one representative of each open
// symmetry class (that already covers every open atom, since the symmetries
// normalise G); `--deep-search` repeats the length-4 search for every open atom
// individually, which costs about a minute and needs no symmetry argument.
const searchDepthForward = 2;
const searchDepthBackwardAll = deepSearch ? 2 : 1;
const searchDepthBackwardRepresentatives = 2;

const forwardBall = ballAround(solvedSim(), atomsG, searchDepthForward);

// Only the atoms the invariants left open are worth searching: the others are
// already proved to be outside G, and no word can exist for them. Within the
// open set one atom per symmetry class suffices when the symmetry group
// normalises G (checked just above), because conjugation carries a word for one
// atom to a word for any conjugate.
const openKeys = new Set(stillOpen.map((check) => check.atom));
const symmetryClassOf = new Map<string, number>();
symmetryReport.additionalClasses.forEach((entry, index) => {
  for (const member of entry.members) symmetryClassOf.set(member, index);
});
const representativeKeys = new Set(
  (() => {
    const seen = new Map<number, string>();
    for (const atom of additionalAtoms) {
      if (!openKeys.has(atom.key)) continue;
      const classIndex = symmetryClassOf.get(atom.key) ?? -1;
      if (!seen.has(classIndex)) seen.set(classIndex, atom.key);
    }
    return [...seen.values()];
  })(),
);

const searchResults = additionalAtoms
  .filter((atom) => openKeys.has(atom.key))
  .map((atom) => {
    const goal = solvedSim();
    applyAtomToSim(goal, atom);
    const backwardDepth = representativeKeys.has(atom.key)
      ? searchDepthBackwardRepresentatives
      : searchDepthBackwardAll;
    // Backward ball uses inverse atoms; the atom set is closed under inverses
    // because all three angles of every legal target are legal.
    const inverseAtoms = atomsG.map((_, index) => atomsG[inverseAtomIndex[index]!]!);
    const backwardBall = ballAround(goal, inverseAtoms, backwardDepth);
    let hit: { forward: number[]; backward: number[] } | null = null;
    for (const [hash, backwardWord] of backwardBall) {
      const forwardWord = forwardBall.get(hash);
      if (forwardWord === undefined) continue;
      hit = { forward: forwardWord, backward: backwardWord };
      break;
    }
    let verifiedWord: string[] | null = null;
    if (hit) {
      // Reconstruct and re-verify exactly, never trusting the hash.
      const word = [...hit.forward, ...[...hit.backward].reverse().map((index) => inverseAtomIndex[index]!)];
      const check = solvedSim();
      for (const atomIndex of word) applyAtomToSim(check, atomsG[atomIndex]!);
      const goalHash = hashSim(goal);
      const identical =
        hashSim(check) === goalHash &&
        [...check.siteOf].every((site, piece) => site === goal.siteOf[piece]) &&
        [...check.rotOf].every((rot, piece) => rot === goal.rotOf[piece]);
      verifiedWord = identical ? word.map((index) => atomsG[index]!.key) : null;
      if (!identical) throw new Error(`hash collision in the membership search for ${atom.key}`);
    }
    return {
      atom: atom.key,
      supportSize: atom.support.length,
      side: atom.side,
      symmetryClass: symmetryClassOf.get(atom.key) ?? -1,
      isClassRepresentative: representativeKeys.has(atom.key),
      searchedWordLength: searchDepthForward + backwardDepth,
      forwardStates: forwardBall.size,
      backwardStates: backwardBall.size,
      wordFound: verifiedWord,
    };
  });
const wordsFound = searchResults.filter((result) => result.wordFound !== null);

// ---------------------------------------------------------------------------
// 8. Verdict.
// ---------------------------------------------------------------------------

// B beats C: one atom proved outside G already proves the reachable state set
// grows, because the move group acts freely on the solved state — the state that
// atom produces is reachable in H and, by the broken invariant, in no way
// reachable in G. That the remaining atoms are undetermined does not weaken it;
// it only limits how *much* H is bigger, which this script does not measure.
const verdict = (() => {
  if (violating.length > 0) {
    return {
      classification: 'B' as const,
      reason:
        `${violating.length} of ${additionalAtoms.length} additional atoms have an orbit-parity vector ` +
        `outside the GF(2) span of G's generator parities (rank ${basisNativeG.length} of ` +
        `${orbitsG.orbitSites.length} orbits), which proves those atoms are not in G and hence that H ` +
        `is strictly larger and reaches states G cannot. The other ${stillOpen.length} additional atoms ` +
        'break no invariant and were not expressed as words in G, so their own membership is undetermined.',
    };
  }
  if (wordsFound.length === searchResults.length && searchResults.length > 0) {
    return {
      classification: 'A' as const,
      reason: 'every additional target was written as a verified word in G, and the angles 180/-90 follow as squares/inverses.',
    };
  }
  return {
    classification: 'C' as const,
    reason:
      'no invariant of G is violated by any additional atom, and no word in G was found within the ' +
      `searched bound (length <= ${searchDepthForward + searchDepthBackwardRepresentatives}). ` +
      'Matching invariants are not a membership proof, so the question stays open.',
  };
})();

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------

const runtimeMs = Date.now() - startedAt;
const report = {
  level: LEVEL,
  generatedAt: new Date().toISOString(),
  runtimeMs,
  atoms: {
    existing: atomsG.length,
    additional: additionalAtoms.length,
    additionalTargets: additionalAtoms.length / 3,
    total: atomsH.length,
  },
  simulatorVsEngine: {
    existingAtomDataFidelity: dataFidelity,
    randomWordTrials: differential,
    verdict: differentialFailures === 0 ? 'identical on all 400 positions and orientations' : 'MISMATCH',
  },
  orbits: {
    G: { count: orbitsG.orbitSites.length, histogram: histogram(orbitsG.orbitSites.map((s) => s.length)), table: orbitTableG },
    H: { count: orbitsH.orbitSites.length, histogram: histogram(orbitsH.orbitSites.map((s) => s.length)), table: orbitTableH },
    hOrbitToGOrbits: merges,
    merged: mergedOrbits,
  },
  orientationFreedom: { G: orientationG, H: orientationH, byClassG: classSummaryG, byClassH: classSummaryH },
  parity: parityReport,
  wikiOldModelComparison: {
    source: 'wiki/Level-2-Complete-Answer.md sections 4.2-4.3 (old abstract model, 972 atoms)',
    documentedOrbitCount: 11,
    measuredOrbitCountG: orbitsG.orbitSites.length,
    rows: wikiComparison,
  },
  membership: {
    invariantChecks,
    violating,
    provedOutsideG: violating.length,
    undetermined: stillOpen.length,
    parityEvidence,
    symmetry: symmetryReport,
    search: {
      method:
        'Bidirectional BFS on the state graph. The move group acts freely on the solved state, so an ' +
        'additional atom lies in G iff the state it produces is reachable with existing atoms only.',
      forwardDepth: searchDepthForward,
      backwardDepthAllTargets: searchDepthBackwardAll,
      backwardDepthRepresentatives: searchDepthBackwardRepresentatives,
      results: searchResults,
    },
  },
  verdict,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

const line = (label: string, value: string | number): void => console.log(`${label.padEnd(34)} ${value}`);
console.log('=== Level 2: G (468 existing atoms) vs H (G + 54 square-ring atoms) ===\n');
line('simulator vs engine', report.simulatorVsEngine.verdict);
line('  existing-atom data fidelity', `${dataFidelity.atomsChecked} checked, ${dataFidelity.atomsMismatched} mismatched`);
line('  random-word trials', `${differential.length} seeds x 40 atoms, ${differentialFailures} failures`);
console.log();
line('position orbits G', `${orbitsG.orbitSites.length} (${histogram(orbitsG.orbitSites.map((s) => s.length))})`);
line('position orbits H', `${orbitsH.orbitSites.length} (${histogram(orbitsH.orbitSites.map((s) => s.length))})`);
line('H-orbits that merge G-orbits', mergedOrbits.length === 0 ? 'none' : mergedOrbits.map((m) => `H${m.hOrbit}<-{${m.gOrbits.join(',')}}`).join(' '));
console.log();
console.log('orbit table (G):');
for (const row of orientationG) {
  console.log(
    `  G${String(row.orbit).padStart(2, '0')} size=${String(row.size).padStart(3)} class=${row.classLabel.padEnd(12)} ` +
      `freedom=${row.freedomOrders.join('/')} type=${row.groupType}${row.uniform ? '' : ' (NOT uniform)'}`,
  );
}
console.log('orbit table (H):');
for (const row of orientationH) {
  console.log(
    `  H${String(row.orbit).padStart(2, '0')} size=${String(row.size).padStart(3)} class=${row.classLabel.padEnd(12)} ` +
      `freedom=${row.freedomOrders.join('/')} type=${row.groupType}${row.uniform ? '' : ' (NOT uniform)'}`,
  );
}
console.log();
console.log('vs the documented old abstract model (972 atoms, 11 orbits):');
for (const row of wikiComparison) {
  console.log(
    `  ${row.classLabel.padEnd(4)} orbits ${row.documentedOrbits} -> ${row.measuredOrbitsG} ${row.orbitsAgree ? '(same)' : '(CHANGED)'}` +
      `   freedom ${row.documentedType}/${row.documentedFreedom} -> ${row.measuredTypesG.join('+')}/${row.measuredFreedomsG.join('+')} ` +
      `${row.freedomAgrees ? '(same)' : '(CHANGED)'}`,
  );
}
console.log();
line('parity rank on H-orbits, G', parityReport.onHOrbits.rankG);
line('parity rank on H-orbits, H', parityReport.onHOrbits.rankH);
line('parity rank on G-orbits, G', parityReport.onGOrbits.rankG);
line('distinct non-zero vectors G/H', `${parityReport.onHOrbits.distinctNonZeroG} / ${parityReport.onHOrbits.distinctNonZeroH}`);
console.log();
line('additional atoms breaking an invariant', violating.length);
line('  orbit violations', invariantChecks.filter((c) => !c.orbitPreserved).length);
line('  orientation violations', invariantChecks.filter((c) => !c.orientationConsistent).length);
line('  parity outside span', invariantChecks.filter((c) => c.parityInSpan === false).length);
for (const evidence of parityEvidence) {
  console.log(
    `  parity vector ${evidence.vector} flips orbits ` +
      `${evidence.orbits.map((o) => `G${o.orbit}(${o.classLabel},${o.size})`).join('+')}` +
      ` — ${evidence.atoms.length} atoms, e.g. ${evidence.atoms[0]}`,
  );
}
line('additional atoms still undetermined', stillOpen.length);
line('symmetry closure (existing/additional)', `${symmetryReport.existingAtomSetClosed} / ${symmetryReport.additionalAtomSetClosed}`);
line('additional classes under 48 symmetries', symmetryReport.additionalClassCount);
line(
  'constructive words found',
  `${wordsFound.length}/${searchResults.length} open atoms; searched to length ` +
    `${searchDepthForward + searchDepthBackwardRepresentatives} for ${searchResults.filter((r) => r.isClassRepresentative).length} ` +
    `class representatives, ${searchDepthForward + searchDepthBackwardAll} for the rest`,
);
console.log();
line('VERDICT', verdict.classification);
console.log(`  ${verdict.reason}`);
console.log(`\nwrote ${outputPath} in ${(runtimeMs / 1000).toFixed(1)}s`);

import { Matrix4, Quaternion as ThreeQuaternion, Vector3 } from 'three';
import type { Vector3Tuple } from 'three';
import type { Cubie, MengerPuzzleState, TurnTarget, TwistAngle } from '@menger/engine';
import {
  applyExtensionRotation,
  applyTwistToCubies,
  cloneCubies,
  createExtensionMove,
  createMengerPuzzleState,
  createMove,
  validateFrameRotation,
  validateTurnTargetRotation,
} from '@menger/engine';
import type { SolverAlgorithm, SolverExplanationStep, SolverMove, SolverRunResult } from '../algorithm/types';
import type { PuzzleModel } from '../model/puzzleModel';
import { isExactlySolved, progressForCubies, progressSummary, stateKey } from './level1State';
import { level3BlockQuotientAlgorithm } from './level3BlockQuotientSolver';
import { level3D4Orbit, level3D4TwisterWords, level3PureToolWords } from './level3SliceReductionToolData';
import { emitSolverDebug } from '../debug';

const solverId = 'level3-slice-reduction';
const solverName = 'level-3-slice-reduction-commutator';
const solverVersion = '0.1.0';
const twistAngles: TwistAngle[] = [90, -90, 180];
const primaryComplexityEstimate =
  'One-time library build (~5s: 3,591 sparse atoms, 164 orbits, 164 pure templates, GF(2) parity basis), then per ' +
  'solve: parity normalization over 164 orbit bits, ~1,300 conjugated pure-tool placements found by ordered-pair BFS, ' +
  'and an orientation potential descent';

/*
 * Level 3 slice-reduction solver — every reachable Level 3 state.
 *
 * The Level 3 block quotient (level3BlockQuotientSolver.ts) only handles states
 * whose 3x3x3 mid-blocks are still rigid. Scale-1 slices and depth-2.5 slabs
 * tear those apart, and repairing them needs cell-level tools. This solver has
 * them, and runs as the general case with the block quotient as its fast path.
 *
 * The structure, all of it machine-verified under research/scratch (see
 * research/scratch/README.md and docs/algorithms/level3-slice-reduction-solver.md):
 *
 *   - the 8000 cells split into 164 orbits and a cell never leaves its own, so
 *     an orbit is the unit that gets solved;
 *   - every orbit's induced group contains Alt(orbit), so nothing is stuck;
 *   - each orbit has one globally pure tool — a permutation of 3, 4 or 6 of its
 *     cells that leaves every other cell of the puzzle untouched in position and
 *     orientation. Because they disturb nothing, orbits can be solved in any
 *     order and no phase ordering is needed;
 *   - 7,224 of 8,000 cells have their orientation determined by position; only
 *     16 orbits can be twisted at all.
 *
 * Pipeline: parity normalization -> per-orbit placement -> orientation descent
 * -> replay on the real 8000-cell state with a legality check before every move.
 */

// ---------- rotation algebra: the 24 orientation-preserving cube rotations ----------

type Mat = readonly number[];

const identityMat: Mat = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const quarterX: Mat = [1, 0, 0, 0, 0, -1, 0, 1, 0];
const quarterY: Mat = [0, 0, 1, 0, 1, 0, -1, 0, 0];
const quarterZ: Mat = [0, -1, 0, 1, 0, 0, 0, 0, 1];

const mulMat = (a: Mat, b: Mat): number[] => {
  const r = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i += 1)
    for (let j = 0; j < 3; j += 1)
      for (let k = 0; k < 3; k += 1) r[i * 3 + j]! += a[i * 3 + k]! * b[k * 3 + j]!;
  return r;
};

const applyMat = (m: Mat, v: Vector3Tuple): Vector3Tuple => [
  m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2],
  m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2],
  m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2],
];

const matKey = (m: Mat): string => m.join(',');

const rotations: Mat[] = (() => {
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

const rotIndexByKey = new Map<string, number>(rotations.map((m, i) => [matKey(m), i]));
const rotMul: number[][] = rotations.map((a) => rotations.map((b) => rotIndexByKey.get(matKey(mulMat(a, b)))!));
const rotInv: number[] = rotations.map((_, i) => rotMul[i]!.findIndex((p) => p === 0));
const ROT_ID = rotIndexByKey.get(matKey(identityMat))!;

const rotForAxisAngle = (axis: Vector3Tuple, angle: TwistAngle): number => {
  const base = axis[0] !== 0 ? quarterX : axis[1] !== 0 ? quarterY : quarterZ;
  const sign = axis[0] + axis[1] + axis[2];
  const quarter = rotIndexByKey.get(matKey(base))!;
  const plus = sign > 0 ? quarter : rotInv[quarter]!;
  if (angle === 90) return plus;
  if (angle === -90) return rotInv[plus]!;
  return rotMul[plus]![plus]!;
};

const quaternionRotIndex = (q: ThreeQuaternion): number | undefined => {
  const m = new Matrix4().makeRotationFromQuaternion(q);
  const cols = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)].map((v) => v.applyMatrix4(m));
  const r = (x: number) => (x > 0.5 ? 1 : x < -0.5 ? -1 : 0);
  const key = [
    r(cols[0]!.x), r(cols[1]!.x), r(cols[2]!.x),
    r(cols[0]!.y), r(cols[1]!.y), r(cols[2]!.y),
    r(cols[0]!.z), r(cols[1]!.z), r(cols[2]!.z),
  ].join(',');
  return rotIndexByKey.get(key);
};

// ---------- sparse atoms ----------
//
// A dense permutation per atom would be 17,775 atoms x 8000 sites x 2 bytes =
// 284 MB. Atoms are stored sparsely instead: only the cells a move selects,
// which total ~256k entries across the whole legal move set. The map includes
// cells a move selects but does not displace (a depth-3 roll maps its cell to
// itself), so rotation-only moves are represented correctly.

interface Atom {
  id: string;
  kind: 'frame' | 'extension';
  refId: string;
  angle: TwistAngle;
  rot: number;
  map: Map<number, number>;
  family: string;
}

interface SparseAction { moves: Map<number, [number, number]> }

interface Template { word: Atom[]; src: number[]; dst: number[]; rots: number[] }
interface Twister { word: Atom[]; sites: number[]; rots: number[] }

interface Library {
  canonical: MengerPuzzleState;
  N: number;
  siteIndexByKey: Map<string, number>;
  atoms: Atom[];
  atomById: Map<string, Atom>;
  orbitOfSite: Int16Array;
  orbitSites: number[][];
  templates: Template[];
  d4Orbit: number;
  d4TwisterWords: Atom[][];
  parityGenerators: Array<{ atom: Atom; vec: bigint }>;
  buildMs: number;
}

const posKey = (p: Vector3Tuple): string => `${p[0]},${p[1]},${p[2]}`;

// ---------- word helpers over sparse atoms ----------

const inverseAngle = (angle: TwistAngle): TwistAngle => (angle === 180 ? 180 : angle === 90 ? -90 : 90);

const makeWordHelpers = (atomById: Map<string, Atom>) => {
  const inverseAtom = (a: Atom): Atom =>
    atomById.get(`${a.kind === 'frame' ? 'f' : 'e'}:${a.refId}:${inverseAngle(a.angle)}`)!;
  const inverseWord = (word: Atom[]): Atom[] => [...word].reverse().map(inverseAtom);
  const commutatorWord = (a: Atom[], b: Atom[]): Atom[] => [...a, ...b, ...inverseWord(a), ...inverseWord(b)];
  return { inverseAtom, inverseWord, commutatorWord };
};

/**
 * Action of `word` restricted to `candidates`. Sites outside the set are assumed
 * untouched, so the caller must pass a superset of the word's support.
 */
const actionOver = (word: Atom[], candidates: Iterable<number>): SparseAction => {
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

/** A superset of a word's support: the touched sites closed under every atom. */
const supportCandidates = (word: Atom[]): Set<number> => {
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

// ---------- library ----------

let libraryCache: Library | null = null;

const buildLibrary = (): Library => {
  if (libraryCache) return libraryCache;
  const start = performance.now();
  const canonical = createMengerPuzzleState(3);
  const sitePositions = canonical.cubies.map((c) => [...c.homePosition] as Vector3Tuple);
  const N = sitePositions.length;
  const siteIndexByKey = new Map<string, number>(sitePositions.map((p, i) => [posKey(p), i]));

  const buildAtom = (
    id: string,
    kind: 'frame' | 'extension',
    refId: string,
    angle: TwistAngle,
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
      if (dest === undefined) throw new Error(`${solverId}: atom ${id} maps a cell outside the Menger cell set`);
      map.set(i, dest);
    }
    return { id, kind, refId, angle, rot, map, family };
  };

  // Only physically legal turns: 744 of the 4,800 depth-3 rolls can actually
  // turn, and legality depends only on the occupied lattice set, which every
  // legal move preserves — so deciding it once on the canonical state is sound.
  const atoms: Atom[] = [];
  for (const frame of canonical.frames) {
    for (const angle of twistAngles) {
      if (!validateFrameRotation(canonical.cubies, frame, angle).legal) continue;
      atoms.push(buildAtom(
        `f:${frame.id}:${angle}`, 'frame', frame.id, angle, `frame-s${frame.scale}`, frame.selector, frame.axis,
        [frame.axis[0] * frame.layer, frame.axis[1] * frame.layer, frame.axis[2] * frame.layer],
      ));
    }
  }
  for (const target of canonical.turnTargets) {
    if (target.kind !== 'extension') continue;
    for (const angle of twistAngles) {
      if (!validateTurnTargetRotation(canonical.cubies, target, angle).legal) continue;
      atoms.push(buildAtom(
        `e:${target.id}:${angle}`, 'extension', target.id, angle, `ext-d${target.depth}`,
        target.selector, target.axis, target.pivot,
      ));
    }
  }
  const atomById = new Map(atoms.map((a) => [a.id, a]));

  // --- orbits: a cell can only ever visit sites in its own ---
  const parent = new Int32Array(N).map((_, i) => i);
  const findRoot = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r]!;
    while (parent[x] !== r) { const n = parent[x]!; parent[x] = r; x = n; }
    return r;
  };
  for (const a of atoms) for (const [from, to] of a.map) {
    if (from === to) continue;
    const ra = findRoot(from);
    const rb = findRoot(to);
    if (ra !== rb) parent[ra] = rb;
  }
  const orbitOfSite = new Int16Array(N).fill(-1);
  const orbitSites: number[][] = [];
  {
    const index = new Map<number, number>();
    for (let site = 0; site < N; site += 1) {
      const r = findRoot(site);
      let orbit = index.get(r);
      if (orbit === undefined) { orbit = orbitSites.length; index.set(r, orbit); orbitSites.push([]); }
      orbitOfSite[site] = orbit;
      orbitSites[orbit]!.push(site);
    }
  }

  // --- the one globally pure tool per orbit, from the generated static data ---
  const templates: Template[] = new Array(orbitSites.length);
  for (const record of level3PureToolWords) {
    const word = record.word.map((id) => {
      const atom = atomById.get(id);
      if (!atom) throw new Error(`${solverId}: tool data references unknown atom ${id}`);
      return atom;
    });
    const action = actionOver(word, supportCandidates(word));
    const src: number[] = [];
    const dst: number[] = [];
    const rots: number[] = [];
    for (const [site, [to, rot]] of action.moves) {
      if (site === to) {
        if (rot !== ROT_ID) throw new Error(`${solverId}: tool for orbit ${record.orbit} leaves a cell twisted`);
        continue;
      }
      if (orbitOfSite[site] !== record.orbit) {
        throw new Error(`${solverId}: tool for orbit ${record.orbit} spills into orbit ${orbitOfSite[site]}`);
      }
      src.push(site); dst.push(to); rots.push(rot);
    }
    if (src.length < 3) throw new Error(`${solverId}: tool for orbit ${record.orbit} is degenerate`);
    templates[record.orbit] = { word, src, dst, rots };
  }
  for (let orbit = 0; orbit < orbitSites.length; orbit += 1) {
    if (!templates[orbit]) throw new Error(`${solverId}: no pure tool for orbit ${orbit}`);
  }

  const d4TwisterWords = level3D4TwisterWords.map((word) => word.map((id) => atomById.get(id)!));

  // --- parity generators: orbit permutation parity is a solve-wide invariant ---
  const parityVector = (atom: Atom): bigint => {
    let vector = 0n;
    const seen = new Set<number>();
    for (const [from] of atom.map) {
      if (seen.has(from)) continue;
      let length = 0;
      let current = from;
      do { seen.add(current); current = atom.map.get(current) ?? current; length += 1; } while (current !== from);
      if (length % 2 === 0) vector ^= 1n << BigInt(orbitOfSite[from]!);
    }
    return vector;
  };
  const parityGenerators: Array<{ atom: Atom; vec: bigint }> = [];
  {
    const seen = new Set<string>();
    for (const atom of atoms) {
      const vec = parityVector(atom);
      const key = vec.toString(16);
      if (vec === 0n || seen.has(key)) continue;
      seen.add(key);
      parityGenerators.push({ atom, vec });
    }
  }

  libraryCache = {
    canonical, N, siteIndexByKey, atoms, atomById, orbitOfSite, orbitSites,
    templates, d4Orbit: level3D4Orbit, d4TwisterWords, parityGenerators,
    buildMs: performance.now() - start,
  };
  emitSolverDebug(
    solverId,
    `library built in ${Math.round(libraryCache.buildMs)}ms: ${atoms.length} legal atoms, ${orbitSites.length} orbits, ` +
    `${templates.length} pure tools, ${parityGenerators.length} distinct parity vectors`,
  );
  return libraryCache;
};

/** Pre-builds the Level 3 tool library (one-time, ~5s). */
export const warmLevel3SliceReductionSolver = (): void => {
  buildLibrary();
};

// ---------- the reduction pipeline on the integer state ----------

interface PState { siteOfPiece: Int16Array; pieceAtSite: Int16Array; rotOfPiece: Uint8Array }

interface PipelineResult {
  ok: boolean;
  atoms: Atom[];
  note: string;
  phaseBreaks: Array<{ phase: string; observation: string; moveIndex: number }>;
}

const runPipeline = (lib: Library, input: PState): PipelineResult => {
  const { N, atoms, orbitOfSite, orbitSites, templates } = lib;
  const { inverseAtom, inverseWord, commutatorWord } = makeWordHelpers(lib.atomById);

  const state: PState = {
    siteOfPiece: input.siteOfPiece.slice(),
    pieceAtSite: input.pieceAtSite.slice(),
    rotOfPiece: input.rotOfPiece.slice(),
  };
  const emitted: Atom[] = [];
  const phaseBreaks: PipelineResult['phaseBreaks'] = [];
  const markPhase = (phase: string, observation: string) => {
    const previous = phaseBreaks[phaseBreaks.length - 1]?.moveIndex ?? 0;
    emitSolverDebug(solverId, `phase "${phase}": ${emitted.length - previous} atoms (running total ${emitted.length})`);
    phaseBreaks.push({ phase, observation, moveIndex: emitted.length });
  };
  const fail = (note: string): PipelineResult => ({ ok: false, atoms: emitted, note, phaseBreaks });

  const applyAtom = (target: PState, atom: Atom): void => {
    const entries = [...atom.map];
    const pieces = entries.map(([site]) => target.pieceAtSite[site]!);
    for (let i = 0; i < entries.length; i += 1) {
      const piece = pieces[i]!;
      target.siteOfPiece[piece] = entries[i]![1];
      target.rotOfPiece[piece] = rotMul[atom.rot]![target.rotOfPiece[piece]!]!;
    }
    for (const piece of pieces) target.pieceAtSite[target.siteOfPiece[piece]!] = piece;
  };
  const applyWord = (target: PState, word: Atom[]): void => { for (const atom of word) applyAtom(target, atom); };
  const emit = (word: Atom[]): void => { applyWord(state, word); emitted.push(...word); };

  const tracePiece = (site: number, rotation: number, word: Atom[]): [number, number] => {
    let current = site;
    let rot = rotation;
    for (const atom of word) {
      const destination = atom.map.get(current);
      if (destination === undefined) continue;
      current = destination;
      rot = rotMul[atom.rot]![rot]!;
    }
    return [current, rot];
  };
  const preimageUnder = (word: Atom[], site: number): number => {
    let current = site;
    for (let i = word.length - 1; i >= 0; i -= 1) current = inverseAtom(word[i]!).map.get(current) ?? current;
    return current;
  };

  // ---------- phase 1: orbit parity normalization ----------
  //
  // Every tool below is a commutator, and the restriction of a commutator to an
  // orbit is the commutator of the restrictions, so tools are even on every
  // orbit. Parity is fixed once here, with raw turns, and stays fixed.
  {
    const highBit = (value: bigint): number => value.toString(2).length - 1;
    interface Row { vec: bigint; combo: Set<number> }
    const basis: Row[] = [];
    const reduce = (vector: bigint, combination: Set<number>): Row => {
      let vec = vector;
      const combo = new Set(combination);
      for (const row of basis) {
        const bit = highBit(row.vec);
        if (((vec >> BigInt(bit)) & 1n) === 0n) continue;
        vec ^= row.vec;
        for (const index of row.combo) { if (combo.has(index)) combo.delete(index); else combo.add(index); }
      }
      return { vec, combo };
    };
    for (let index = 0; index < lib.parityGenerators.length; index += 1) {
      const row = reduce(lib.parityGenerators[index]!.vec, new Set([index]));
      if (row.vec !== 0n) { basis.push(row); basis.sort((a, b) => highBit(b.vec) - highBit(a.vec)); }
    }
    const orbitSign = (orbit: number): 0 | 1 => {
      const seen = new Set<number>();
      let odd = 0;
      for (const start of orbitSites[orbit]!) {
        if (seen.has(start)) continue;
        let current = start;
        let length = 0;
        do { seen.add(current); current = state.siteOfPiece[current]!; length += 1; } while (current !== start);
        if (length % 2 === 0) odd ^= 1;
      }
      return odd as 0 | 1;
    };
    let target = 0n;
    for (let orbit = 0; orbit < orbitSites.length; orbit += 1) if (orbitSign(orbit)) target |= 1n << BigInt(orbit);
    const solution = reduce(target, new Set());
    if (solution.vec !== 0n) {
      return fail('the orbit parity vector lies outside the reachable span — the state is not reachable by legal moves');
    }
    for (const index of solution.combo) emit([lib.parityGenerators[index]!.atom]);
    for (let orbit = 0; orbit < orbitSites.length; orbit += 1) {
      if (orbitSign(orbit)) return fail('internal error: parity normalization left an odd orbit');
    }
    markPhase(
      'orbit parity normalization',
      solution.combo.size === 0
        ? 'All 164 orbit permutation parities are already even.'
        : `Applied ${solution.combo.size} raw turn(s) solving the GF(2) parity system over 164 orbits.`,
    );
  }

  // ---------- setup alphabets ----------
  //
  // Two alphabets per orbit: one for conjugating a placement tool, which only
  // needs moves that permute the orbit's sites, and one for conjugating a twist,
  // which also needs moves that rotate a cell without displacing it.
  const setupAlphabetCache = new Map<number, Atom[]>();
  const setupAlphabetFor = (orbit: number): Atom[] => {
    const cached = setupAlphabetCache.get(orbit);
    if (cached) return cached;
    const seen = new Set<string>();
    const out: Atom[] = [];
    for (const atom of atoms) {
      const action: string[] = [];
      for (const site of orbitSites[orbit]!) {
        const to = atom.map.get(site) ?? site;
        if (to !== site) action.push(`${site}>${to}`);
      }
      if (action.length === 0) continue;
      const key = action.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(atom);
    }
    setupAlphabetCache.set(orbit, out);
    return out;
  };
  const orientationAlphabetCache = new Map<number, Atom[]>();
  const orientationAlphabetFor = (orbit: number): Atom[] => {
    const cached = orientationAlphabetCache.get(orbit);
    if (cached) return cached;
    const seen = new Set<string>();
    const out: Atom[] = [];
    for (const atom of atoms) {
      const action: string[] = [];
      for (const site of orbitSites[orbit]!) {
        const to = atom.map.get(site);
        if (to !== undefined) action.push(`${site}>${to}#${atom.rot}`);
      }
      if (action.length === 0) continue;
      const key = action.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(atom);
    }
    orientationAlphabetCache.set(orbit, out);
    return out;
  };

  // ---------- template variants ----------
  //
  // Purity survives conjugation, so one pure tool per orbit is enough: setup
  // conjugation carries it anywhere inside the orbit. Variants are precomputed
  // per orbit so the placement search can index them by ordered pair.
  //
  // A width-4 or width-6 tool is a double transposition or wider, which suffices
  // to generate Alt(orbit) but leaves greedy placement able to cycle on the last
  // three cells. Two variants sharing one transposition multiply to a 3-cycle;
  // when such a product exists the derived 3-cycle replaces the wide tool.
  const templateVariantCache = new Map<number, Template[]>();
  const templateVariantsFor = (orbit: number): Template[] => {
    const cached = templateVariantCache.get(orbit);
    if (cached) return cached;
    const alphabet = setupAlphabetFor(orbit);
    const variantLimit = orbitSites[orbit]!.length >= 192 ? 768 : 192;
    const profile = (template: Template): string =>
      template.src.map((site, index) => `${site}>${template.dst[index]}#${template.rots[index]}`).sort().join(';');

    const expand = (base: Template): Template[] => {
      const variants: Template[] = [base];
      const seen = new Set<string>([profile(base)]);
      for (let cursor = 0; cursor < variants.length && variants.length < variantLimit; cursor += 1) {
        const from = variants[cursor]!;
        for (const setup of alphabet) {
          const inverse = inverseAtom(setup);
          const src = from.src.map((site) => inverse.map.get(site) ?? site);
          const word = [setup, ...from.word, inverse];
          const action = actionOver(word, src);
          const candidate: Template = {
            word,
            src,
            dst: src.map((site) => action.moves.get(site)![0]),
            rots: src.map((site) => action.moves.get(site)![1]),
          };
          const key = profile(candidate);
          if (seen.has(key)) continue;
          seen.add(key);
          variants.push(candidate);
          if (variants.length >= variantLimit) break;
        }
      }
      const withInverses = [...variants];
      for (const template of variants) {
        const word = inverseWord(template.word);
        const action = actionOver(word, template.src);
        withInverses.push({
          word,
          src: template.dst,
          dst: template.src,
          rots: template.dst.map((site) => action.moves.get(site)![1]),
        });
      }
      return withInverses;
    };

    const base = templates[orbit]!;
    const withInverses = expand(base);

    if (base.src.length !== 3) {
      const bySite = new Map<number, number[]>();
      withInverses.forEach((template, index) => {
        for (const site of template.src) {
          const list = bySite.get(site) ?? [];
          list.push(index);
          bySite.set(site, list);
        }
      });
      const actionIndex = new Map<Template, Map<number, number>>();
      const indexFor = (template: Template): Map<number, number> => {
        let index = actionIndex.get(template);
        if (!index) { index = new Map(template.src.map((site, offset) => [site, offset])); actionIndex.set(template, index); }
        return index;
      };
      let cycle: Template | null = null;
      outer:
      for (let i = 0; i < withInverses.length; i += 1) {
        const partners = new Set<number>();
        for (const site of withInverses[i]!.src) for (const j of bySite.get(site) ?? []) if (j > i) partners.add(j);
        for (const j of partners) {
          const a = withInverses[i]!;
          const b = withInverses[j]!;
          const candidates = new Set([...a.src, ...b.src]);
          const src: number[] = [];
          const dst: number[] = [];
          const rots: number[] = [];
          const aIndex = indexFor(a);
          const bIndex = indexFor(b);
          let clean = true;
          for (const site of candidates) {
            const ai = aIndex.get(site);
            const middle = ai === undefined ? site : a.dst[ai]!;
            const firstRotation = ai === undefined ? ROT_ID : a.rots[ai]!;
            const bi = bIndex.get(middle);
            const to = bi === undefined ? middle : b.dst[bi]!;
            const rotation = bi === undefined ? firstRotation : rotMul[b.rots[bi]!]![firstRotation]!;
            if (site === to) { if (rotation !== ROT_ID) clean = false; continue; }
            src.push(site); dst.push(to); rots.push(rotation);
          }
          if (clean && src.length === 3) { cycle = { word: [...a.word, ...b.word], src, dst, rots }; break outer; }
        }
      }
      if (cycle) {
        const derived = expand(cycle);
        templateVariantCache.set(orbit, derived);
        return derived;
      }
    }

    templateVariantCache.set(orbit, withInverses);
    return withInverses;
  };

// ---------- phase 2: per-orbit placement ----------

  const posProtected = new Uint8Array(N);

  interface Placement { word: Atom[]; oriented: boolean; landed: number; broken: number }

  const findPlacement = (
    orbit: number,
    x: number,
    target: number,
    maxBroken: number,
    desiredLanded: number,
  ): Placement | null => {
    const variants = templateVariantsFor(orbit);
    const pairKey = (a: number, b: number) => a * N + b;
    const byPair = new Map<number, Template[]>();
    for (const variant of variants) {
      for (let i = 0; i < variant.src.length; i += 1) {
        const key = pairKey(variant.src[i]!, variant.dst[i]!);
        const list = byPair.get(key) ?? [];
        list.push(variant);
        byPair.set(key, list);
      }
    }
    const alphabet = setupAlphabetFor(orbit);
    const start = pairKey(x, target);
    const visited = new Map<number, { parent: number; atom: Atom | null }>([[start, { parent: -1, atom: null }]]);
    let frontier = [start];
    // Held in an object because the comparison below assigns from inside the
    // loop, which TypeScript's narrowing cannot follow on a bare `let`.
    const found: { best: Placement | null } = { best: null };
    const reconstruct = (key: number): Atom[] => {
      const word: Atom[] = [];
      let current = key;
      while (true) {
        const node = visited.get(current)!;
        if (!node.atom) break;
        word.push(node.atom);
        current = node.parent;
      }
      return word.reverse();
    };
    // This is an exhaustive BFS of the finite ordered-pair action graph, not a
    // depth-bounded heuristic.  Exhausting it is important: a reachable state
    // must not fail merely because the required setup happened to be deeper
    // than a tuning constant chosen from benchmark seeds.
    while (frontier.length > 0) {
      for (const key of frontier) {
        const list = byPair.get(key);
        if (!list) continue;
        const setup = reconstruct(key);
        for (const variant of list) {
          let aimed = false;
          let landed = 0;
          let broken = 0;
          for (let i = 0; i < variant.src.length; i += 1) {
            const from = preimageUnder(setup, variant.src[i]!);
            const to = preimageUnder(setup, variant.dst[i]!);
            if (from === x && to === target) aimed = true;
            if (posProtected[from] && from !== to) broken += 1;
            if (state.pieceAtSite[from] === to) landed += 1;
          }
          if (!aimed || broken > maxBroken) continue;
          const word = [...setup, ...variant.word, ...inverseWord(setup)];
          const [end, rotation] = tracePiece(x, state.rotOfPiece[target]!, word);
          if (end !== target) continue;
          const candidate: Placement = { word, oriented: rotation === ROT_ID, landed, broken };
          const best = found.best;
          const better =
            !best ||
            Number(candidate.oriented) > Number(best.oriented) ||
            (candidate.oriented === best.oriented && candidate.broken < best.broken) ||
            (candidate.oriented === best.oriented && candidate.broken === best.broken && candidate.landed > best.landed) ||
            (candidate.oriented === best.oriented && candidate.broken === best.broken &&
              candidate.landed === best.landed && candidate.word.length < best.word.length);
          if (better) found.best = candidate;
        }
      }
      const current = found.best;
      if (current && current.landed > current.broken && current.landed >= desiredLanded) return current;
      const next: number[] = [];
      for (const key of frontier) {
        const a = Math.floor(key / N);
        const b = key % N;
        for (const atom of alphabet) {
          const na = atom.map.get(a) ?? a;
          const nb = atom.map.get(b) ?? b;
          if (na === a && nb === b) continue;
          const nextKey = pairKey(na, nb);
          if (visited.has(nextKey)) continue;
          visited.set(nextKey, { parent: key, atom });
          next.push(nextKey);
        }
      }
      frontier = next;
    }
    const settled = found.best;
    return settled && settled.landed > settled.broken ? settled : null;
  };

  /**
   * An exact 3-cycle on a named ordered triple, by bidirectional BFS: the
   * forward search conjugates the wanted triple, the backward search conjugates
   * the triples the template library already realizes, and they meet in the
   * middle. Used to finish an orbit once too few cells remain for the greedy
   * placement to keep making progress.
   */
  const findThreeCycleWord = (orbit: number, cycle: [number, number, number]): Atom[] | null => {
    const keyOf = (x: number, y: number, z: number) => (x * N + y) * N + z;
    const targets = new Map<number, Template>();
    for (const template of templateVariantsFor(orbit)) {
      if (template.src.length !== 3) continue;
      const index = new Map(template.src.map((site, offset) => [site, offset]));
      const t0 = template.src[0]!;
      const t1 = template.dst[index.get(t0)!]!;
      const t2index = index.get(t1);
      if (t2index === undefined) continue;
      const t2 = template.dst[t2index]!;
      const closing = index.get(t2);
      if (closing === undefined || template.dst[closing] !== t0) continue;
      targets.set(keyOf(t0, t1, t2), template);
    }
    const start = keyOf(cycle[0], cycle[1], cycle[2]);
    const direct = targets.get(start);
    if (direct) return [...direct.word];

    const forward = new Map<number, { parent: number; atom: Atom | null }>([[start, { parent: -1, atom: null }]]);
    const reverse = new Map<number, { next: number; atom: Atom | null; template: Template }>();
    for (const [key, template] of targets) reverse.set(key, { next: -1, atom: null, template });
    let forwardFrontier = [start];
    let reverseFrontier = [...targets.keys()];
    const reconstruct = (meet: number): { setup: Atom[]; template: Template } => {
      const prefix: Atom[] = [];
      let current = meet;
      while (true) {
        const node = forward.get(current)!;
        if (!node.atom) break;
        prefix.push(node.atom);
        current = node.parent;
      }
      prefix.reverse();
      const suffix: Atom[] = [];
      current = meet;
      while (true) {
        const node = reverse.get(current)!;
        if (!node.atom) return { setup: [...prefix, ...suffix], template: node.template };
        suffix.push(node.atom);
        current = node.next;
      }
    };
    const decode = (key: number): [number, number, number] => {
      let rest = key;
      const z = rest % N; rest = (rest - z) / N;
      const y = rest % N;
      return [(rest - y) / N, y, z];
    };
    const alphabet = setupAlphabetFor(orbit);
    const inverseAlphabet = alphabet.map((atom) => inverseAtom(atom));

    // The ordered-triple graph is finite. Search it to exhaustion rather than
    // imposing the old depth-8 / two-million-node empirical caps. Because the
    // setup action contains Alt(orbit), every ordered triple of distinct sites
    // lies in the same component for these Level 3 orbits.
    while (forwardFrontier.length > 0 && reverseFrontier.length > 0) {
      if (forwardFrontier.length <= reverseFrontier.length) {
        const next: number[] = [];
        for (const key of forwardFrontier) {
          const [x, y, z] = decode(key);
          for (const atom of alphabet) {
            const nx = atom.map.get(x) ?? x;
            const ny = atom.map.get(y) ?? y;
            const nz = atom.map.get(z) ?? z;
            if (nx === x && ny === y && nz === z) continue;
            const nextKey = keyOf(nx, ny, nz);
            if (forward.has(nextKey)) continue;
            forward.set(nextKey, { parent: key, atom });
            next.push(nextKey);
            if (reverse.has(nextKey)) {
              const found = reconstruct(nextKey);
              return [...found.setup, ...found.template.word, ...inverseWord(found.setup)];
            }
          }
        }
        forwardFrontier = next;
      } else {
        const next: number[] = [];
        for (const key of reverseFrontier) {
          const [x, y, z] = decode(key);
          const inherited = reverse.get(key)!;
          for (let index = 0; index < alphabet.length; index += 1) {
            const inverse = inverseAlphabet[index]!;
            const px = inverse.map.get(x) ?? x;
            const py = inverse.map.get(y) ?? y;
            const pz = inverse.map.get(z) ?? z;
            if (px === x && py === y && pz === z) continue;
            const previousKey = keyOf(px, py, pz);
            if (reverse.has(previousKey)) continue;
            reverse.set(previousKey, { next: key, atom: alphabet[index]!, template: inherited.template });
            next.push(previousKey);
            if (forward.has(previousKey)) {
              const found = reconstruct(previousKey);
              return [...found.setup, ...found.template.word, ...inverseWord(found.setup)];
            }
          }
        }
        reverseFrontier = next;
      }
    }
    return null;
  };

  /**
   * Finish an orbit whose residual permutation is small. Parity was normalized
   * in phase 1, so the residue is even and decomposes into 3-cycles: a cycle of
   * length >= 3 is shortened by an exact 3-cycle on its first three points, and
   * two transpositions (a b)(c d) are cleared by (a c d) then (a c b).
   */
  const finishSmallEvenPermutation = (orbit: number, sites: number[]): Atom[][] | null => {
    const words: Atom[][] = [];
    let guard = 0;
    while (true) {
      if (++guard > sites.length * 2) return null;
      const seen = new Set<number>();
      const cycles: number[][] = [];
      for (const start of sites) {
        if (seen.has(start) || state.pieceAtSite[start] === start) continue;
        const cycle: number[] = [];
        let current = start;
        do { seen.add(current); cycle.push(current); current = state.pieceAtSite[current]!; } while (current !== start);
        cycles.push(cycle);
      }
      if (cycles.length === 0) return words;
      const long = cycles.find((cycle) => cycle.length >= 3);
      if (long) {
        const word = findThreeCycleWord(orbit, [long[0]!, long[1]!, long[2]!]);
        if (!word) return null;
        applyWord(state, word);
        words.push(word);
        continue;
      }
      if (cycles.length < 2) return null; // an odd residual transposition cannot survive parity normalization
      const [a, b] = cycles[0]! as [number, number];
      const [c, d] = cycles[1]! as [number, number];
      const first = findThreeCycleWord(orbit, [a, c, d]);
      if (!first) return null;
      applyWord(state, first);
      words.push(first);
      const second = findThreeCycleWord(orbit, [a, c, b]);
      if (!second) return null;
      applyWord(state, second);
      words.push(second);
    }
  };

  {
    let toolsUsed = 0;
    for (let orbit = 0; orbit < orbitSites.length; orbit += 1) {
      const sites = orbitSites[orbit]!;
      let guard = 0;
      while (true) {
        const unsolved = sites.filter((site) => state.siteOfPiece[site] !== site);
        if (unsolved.length === 0) break;
        if (++guard > sites.length * 4) {
          return fail(`orbit ${orbit} exhausted its placement budget with ${unsolved.length} cell(s) left`);
        }
        for (const site of sites) posProtected[site] = state.pieceAtSite[site] === site ? 1 : 0;
        if (unsolved.length <= 32) {
          const finish = finishSmallEvenPermutation(orbit, sites);
          if (!finish) return fail(`orbit ${orbit} cannot finish its ${unsolved.length}-cell even permutation`);
          for (const word of finish) { emitted.push(...word); toolsUsed += 1; }
          continue;
        }
        const target = unsolved[0]!;
        const x = state.siteOfPiece[target]!;
        const sacrificeBudget = Math.max(1, templates[orbit]!.src.length - 2);
        const placement = findPlacement(orbit, x, target, sacrificeBudget, unsolved.length === 3 ? 3 : 1);
        if (!placement) return fail(`orbit ${orbit} cannot place cell ${target} from ${x}; ${unsolved.length} unsolved`);
        emit(placement.word);
        toolsUsed += 1;
      }
      for (const site of sites) posProtected[site] = 1;
    }
    for (let piece = 0; piece < N; piece += 1) {
      if (state.siteOfPiece[piece] !== piece) return fail('internal error: placement left a cell off its home site');
    }
    markPhase(
      'orbit placement',
      `All 8000 cells are home, placed orbit by orbit with ${toolsUsed} conjugated pure tools. ` +
      'Every tool is globally pure, so orbits need no phase ordering.',
    );
  }

// ---------- phase 3: orientation ----------
  //
  // Positions are fixed now, so only rotations can be wrong, and only on the 776
  // cells whose orbit has any orientation freedom at all. A twister is a
  // position-identity word: it moves twist between cells rather than removing it
  // from one, so the phase drives a potential — the number of twist steps a cell
  // is from solved — strictly down.

  const rollAtSite = new Map<number, Atom[]>();
  for (const atom of atoms) {
    if (atom.family !== 'ext-d3' || atom.map.size !== 1) continue;
    const [[site, destination]] = [...atom.map];
    if (site !== destination) continue;
    const list = rollAtSite.get(site) ?? [];
    list.push(atom);
    rollAtSite.set(site, list);
  }
  const directRoll = (site: number, rotation: number): Atom | undefined =>
    (rollAtSite.get(site) ?? []).find((atom) => rotMul[atom.rot]![rotation] === ROT_ID);

  const twisterCache = new Map<number, Twister[]>();
  const twistersFor = (orbit: number): Twister[] => {
    const cached = twisterCache.get(orbit);
    if (cached) return cached;
    const variants = templateVariantsFor(orbit).filter((template) => template.src.length === 3);
    const out: Twister[] = [];
    const seen = new Set<string>();
    const record = (word: Atom[], candidates: Iterable<number>): void => {
      const action = actionOver(word, candidates);
      const sites: number[] = [];
      const rots: number[] = [];
      for (const [site, [to, rot]] of action.moves) {
        if (to !== site) return;
        if (rot !== ROT_ID) { sites.push(site); rots.push(rot); }
      }
      if (sites.length === 0) return;
      const key = sites.map((site, index) => `${site}#${rots[index]}`).sort().join(';');
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ word, sites, rots });
    };

    // Two pure tools with the same position action but different rotation
    // profiles compose to a pure twist.
    const byPositionAction = new Map<string, Template[]>();
    for (const template of variants) {
      const key = template.src.map((site, index) => `${site}>${template.dst[index]}`).sort().join(';');
      const list = byPositionAction.get(key) ?? [];
      if (list.length < 12) list.push(template);
      byPositionAction.set(key, list);
    }
    for (const group of byPositionAction.values()) {
      for (let i = 0; i < group.length; i += 1) {
        for (let j = 0; j < group.length; j += 1) {
          if (i === j || group[i]!.rots.join(',') === group[j]!.rots.join(',')) continue;
          record([...group[i]!.word, ...inverseWord(group[j]!.word)], group[i]!.src);
        }
      }
    }
    // A depth-3 roll displaces nothing, so [roll, tool] has its support inside
    // the tool's three cells and its position action cancels.
    for (const [site, rolls] of rollAtSite) {
      if (orbitOfSite[site] !== orbit) continue;
      for (const roll of rolls) record([roll], [site]);
    }
    for (const template of variants) {
      for (const site of template.src) {
        for (const roll of rollAtSite.get(site) ?? []) record(commutatorWord([roll], template.word), template.src);
      }
    }
    if (orbit === lib.d4Orbit) for (const word of lib.d4TwisterWords) record(word, supportCandidates(word));
    twisterCache.set(orbit, out);
    return out;
  };

  /**
   * How many twist steps each of the 24 rotations is from solved, at one site.
   * The reachable twist effects at a site are collected by transporting the cell
   * through the orbit and conjugating each twister's effect by the transport,
   * then a reverse BFS over the rotation group gives the distances.
   */
  const orientationDistanceCache = new Map<number, Uint8Array>();
  const orientationDistancesAt = (target: number): Uint8Array => {
    const cached = orientationDistanceCache.get(target);
    if (cached) return cached;
    const orbit = orbitOfSite[target]!;
    const bySite = new Map<number, number[]>();
    for (const twister of twistersFor(orbit)) {
      for (let index = 0; index < twister.sites.length; index += 1) {
        const site = twister.sites[index]!;
        const list = bySite.get(site) ?? [];
        list.push(twister.rots[index]!);
        bySite.set(site, list);
      }
    }
    const effects = new Set<number>();
    const seen = new Uint8Array(N * 24);
    const start = target * 24 + ROT_ID;
    seen[start] = 1;
    let frontier = [start];
    while (frontier.length) {
      const next: number[] = [];
      for (const key of frontier) {
        const site = Math.floor(key / 24);
        const rho = key % 24;
        for (const rotation of bySite.get(site) ?? []) {
          effects.add(rotMul[rotInv[rho]!]![rotMul[rotation]![rho]!]!);
        }
        for (const atom of orientationAlphabetFor(orbit)) {
          const destination = atom.map.get(site);
          if (destination === undefined) continue;
          const nextKey = destination * 24 + rotMul[atom.rot]![rho]!;
          if (seen[nextKey]) continue;
          seen[nextKey] = 1;
          next.push(nextKey);
        }
      }
      frontier = next;
    }
    const distances = new Uint8Array(24).fill(255);
    distances[ROT_ID] = 0;
    let rotationFrontier = [ROT_ID];
    while (rotationFrontier.length) {
      const next: number[] = [];
      for (const rotation of rotationFrontier) {
        for (const effect of effects) {
          const before = rotMul[rotInv[effect]!]![rotation]!;
          if (distances[before] !== 255) continue;
          distances[before] = distances[rotation]! + 1;
          next.push(before);
        }
      }
      rotationFrontier = next;
    }
    orientationDistanceCache.set(target, distances);
    return distances;
  };
  const orientationPotential = (site: number, rotation: number): number => orientationDistancesAt(site)[rotation]!;

  const findTwistDescent = (orbit: number, target: number): Atom[] | null => {
    const bySite = new Map<number, Twister[]>();
    for (const twister of twistersFor(orbit)) {
      for (const site of twister.sites) {
        const list = bySite.get(site) ?? [];
        list.push(twister);
        bySite.set(site, list);
      }
    }
    const start = target * 24 + ROT_ID;
    const visited = new Map<number, { parent: number; atom: Atom | null }>([[start, { parent: -1, atom: null }]]);
    let frontier = [start];
    const reconstruct = (key: number): Atom[] => {
      const setup: Atom[] = [];
      let current = key;
      while (true) {
        const node = visited.get(current)!;
        if (!node.atom) break;
        setup.push(node.atom);
        current = node.parent;
      }
      return setup.reverse();
    };
    // At most |orbit| * 24 transported states exist, so this search can be
    // complete without a depth limit.
    while (frontier.length > 0) {
      for (const key of frontier) {
        const site = Math.floor(key / 24);
        const list = bySite.get(site);
        if (!list) continue;
        const setup = reconstruct(key);
        for (const twister of list) {
          const word = [...setup, ...twister.word, ...inverseWord(setup)];
          const support = twister.sites.map((candidate) => preimageUnder(setup, candidate));
          const action = actionOver(word, support);
          let delta = 0;
          let positionIdentity = true;
          for (const [affected, [to, rotation]] of action.moves) {
            if (to !== affected) { positionIdentity = false; break; }
            const before = state.rotOfPiece[affected]!;
            delta += orientationPotential(affected, rotMul[rotation]![before]!) - orientationPotential(affected, before);
          }
          if (positionIdentity && delta < 0) return word;
        }
      }
      const next: number[] = [];
      for (const key of frontier) {
        const site = Math.floor(key / 24);
        const rotation = key % 24;
        for (const atom of orientationAlphabetFor(orbit)) {
          const destination = atom.map.get(site);
          if (destination === undefined) continue;
          const nextKey = destination * 24 + rotMul[atom.rot]![rotation]!;
          if (visited.has(nextKey)) continue;
          visited.set(nextKey, { parent: key, atom });
          next.push(nextKey);
        }
      }
      frontier = next;
    }
    return null;
  };

  /**
   * Descending one cell at a time can stall when the twister's second cell keeps
   * landing back on the first. Searching over an ordered *pair* of cells finds
   * the joint application that clears both.
   */
  const findPairTwistDescent = (orbit: number, first: number, second: number): Atom[] | null => {
    const pairKey = (a: number, ra: number, b: number, rb: number) => ((a * 24 + ra) * N + b) * 24 + rb;
    const byPair = new Map<number, Twister[]>();
    for (const twister of twistersFor(orbit)) {
      if (twister.sites.length !== 2) continue;
      for (const [a, b] of [[twister.sites[0]!, twister.sites[1]!], [twister.sites[1]!, twister.sites[0]!]]) {
        const key = a * N + b;
        const list = byPair.get(key) ?? [];
        list.push(twister);
        byPair.set(key, list);
      }
    }
    const start = pairKey(first, ROT_ID, second, ROT_ID);
    const visited = new Map<number, { parent: number; atom: Atom | null }>([[start, { parent: -1, atom: null }]]);
    let frontier = [start];
    const reconstruct = (key: number): Atom[] => {
      const setup: Atom[] = [];
      let current = key;
      while (true) {
        const node = visited.get(current)!;
        if (!node.atom) break;
        setup.push(node.atom);
        current = node.parent;
      }
      return setup.reverse();
    };
    // Exhaust the finite ordered-pair-with-orientation graph. The previous
    // 400k-node cap made a reachable residue capable of failing for a resource
    // tuning reason rather than a structural reason.
    while (frontier.length) {
      const next: number[] = [];
      for (const key of frontier) {
        let rest = key;
        const rb = rest % 24; rest = (rest - rb) / 24;
        const b = rest % N; rest = (rest - b) / N;
        const ra = rest % 24;
        const a = (rest - ra) / 24;
        const entries = byPair.get(a * N + b);
        if (entries?.length) {
          const setup = reconstruct(key);
          for (const twister of entries) {
            const word = [...setup, ...twister.word, ...inverseWord(setup)];
            const support = twister.sites.map((candidate) => preimageUnder(setup, candidate));
            const action = actionOver(word, support);
            let delta = 0;
            let identity = true;
            for (const [site, [to, rotation]] of action.moves) {
              if (site !== to) { identity = false; break; }
              const before = state.rotOfPiece[site]!;
              delta += orientationPotential(site, rotMul[rotation]![before]!) - orientationPotential(site, before);
            }
            if (identity && delta < 0) return word;
          }
        }
        for (const atom of orientationAlphabetFor(orbit)) {
          const da = atom.map.get(a);
          const db = atom.map.get(b);
          if (da === undefined && db === undefined) continue;
          const nextKey = pairKey(
            da ?? a, da === undefined ? ra : rotMul[atom.rot]![ra]!,
            db ?? b, db === undefined ? rb : rotMul[atom.rot]![rb]!,
          );
          if (visited.has(nextKey)) continue;
          visited.set(nextKey, { parent: key, atom });
          next.push(nextKey);
        }
      }
      frontier = next;
    }
    return null;
  };

  {
    let tools = 0;
    while (true) {
      for (let site = 0; site < N; site += 1) {
        const roll = directRoll(site, state.rotOfPiece[site]!);
        if (roll) emit([roll]);
      }
      const dirty: number[] = [];
      for (let site = 0; site < N; site += 1) if (state.rotOfPiece[site] !== ROT_ID) dirty.push(site);
      if (dirty.length === 0) break;

      for (const site of dirty) {
        if (orientationPotential(site, state.rotOfPiece[site]!) === 255) {
          return fail(`cell ${site} has an orientation outside the verified reachable twist subgroup`);
        }
      }

      let fix: Atom[] | null = null;
      for (const site of dirty) {
        fix = findTwistDescent(orbitOfSite[site]!, site);
        if (fix) break;
      }
      if (!fix) {
        for (let i = 0; i < dirty.length && !fix; i += 1) {
          for (let j = i + 1; j < dirty.length && !fix; j += 1) {
            if (orbitOfSite[dirty[i]!] !== orbitOfSite[dirty[j]!]) continue;
            fix = findPairTwistDescent(orbitOfSite[dirty[i]!]!, dirty[i]!, dirty[j]!);
          }
        }
      }
      if (!fix) {
        const summary = dirty.slice(0, 12).map((site) => `${site}#${state.rotOfPiece[site]}`).join(' ');
        return fail(`no orientation descent exists for ${dirty.length} twisted cell(s): ${summary}`);
      }
      emit(fix);
      tools += 1;
    }
    markPhase(
      'orientation normalization',
      tools === 0
        ? 'Every cell was already oriented after placement, or a single depth-3 roll sufficed.'
        : `Removed every residual twist with ${tools} twist tool(s) under strict potential descent.`,
    );
  }

  for (let piece = 0; piece < N; piece += 1) {
    if (state.siteOfPiece[piece] !== piece || state.rotOfPiece[piece] !== ROT_ID) {
      return fail(`internal error: the integer state is not solved at cell ${piece}`);
    }
  }
  return { ok: true, atoms: emitted, note: 'solved', phaseBreaks };
};

// ---------- peephole: merge adjacent turns of the same target ----------

const mergeAdjacentAtoms = (lib: Library, input: Atom[]): Atom[] => {
  const angleOf = (a: Atom): number => (a.angle === -90 ? 270 : a.angle);
  const atomFor = (sample: Atom, angle: number): Atom | null => {
    if (angle === 0) return null;
    const canonical: TwistAngle = angle === 270 ? -90 : (angle as TwistAngle);
    return lib.atomById.get(`${sample.kind === 'frame' ? 'f' : 'e'}:${sample.refId}:${canonical}`) ?? null;
  };
  const stack: Atom[] = [];
  for (const atom of input) {
    const top = stack[stack.length - 1];
    if (top && top.kind === atom.kind && top.refId === atom.refId) {
      stack.pop();
      const merged = atomFor(atom, (angleOf(top) + angleOf(atom)) % 360);
      if (merged) stack.push(merged);
      continue;
    }
    stack.push(atom);
  }
  return stack;
};

// ---------- the engine boundary ----------

const atomToSolverMove = (lib: Library, atom: Atom, reason: string): SolverMove => {
  if (atom.kind === 'frame') {
    const move = createMove(atom.refId, atom.angle, lib.canonical.frameById);
    return {
      targetKind: 'frame',
      targetId: `frame:${atom.refId}`,
      frameId: atom.refId,
      angle: atom.angle,
      notation: move.notation,
      reason,
    };
  }
  const target = lib.canonical.turnTargetById.get(atom.refId)!;
  return {
    targetKind: 'extension',
    targetId: target.id,
    extensionTargetId: target.id,
    angle: atom.angle,
    notation: createExtensionMove(target, atom.angle).notation,
    reason,
  };
};

const applySolverMoveToCubies = (cubies: Cubie[], move: SolverMove, puzzle: MengerPuzzleState): Cubie[] => {
  if (move.targetKind === 'frame' && move.frameId) {
    return applyTwistToCubies(cubies, move.frameId, move.angle, puzzle.frameById);
  }
  if (move.targetKind === 'extension' && move.extensionTargetId) {
    return applyExtensionRotation(cubies, move.extensionTargetId, move.angle, puzzle.turnTargetById);
  }
  return cubies;
};

// ---------- SolverAlgorithm ----------

const solve = async (
  model: PuzzleModel<MengerPuzzleState, SolverMove>,
  puzzle: MengerPuzzleState,
): Promise<SolverRunResult> => {
  const start = performance.now();
  const inputProgress = progressForCubies(puzzle.cubies);
  const inputState = {
    level: puzzle.level,
    cubieCount: puzzle.cubies.length,
    stateKey: stateKey(puzzle.cubies, false),
    progress: inputProgress,
  };
  const explanation: SolverExplanationStep[] = [{
    phase: 'state inspection',
    objective: 'Build a solve plan from the current 8000-cell Level 3 state without reading move history.',
    observation: progressSummary(inputProgress),
    progress: inputProgress,
  }];

  const failure = (finalStrategy: string, notes: string): SolverRunResult => ({
    name: solverName,
    version: solverVersion,
    level_supported: [3],
    input_state: inputState,
    output_moves: [],
    runtime_ms: performance.now() - start,
    move_count: 0,
    success: false,
    explanation,
    final_strategy: finalStrategy,
    complexity_estimate: primaryComplexityEstimate,
    notes,
  });

  if (puzzle.level !== 3) {
    return failure('Level 3 only.', 'This solver currently supports Level 3 only.');
  }

  /**
   * Replays a move list on the real engine, checking legality before every move
   * and requiring an exact solve at the end. The pipeline runs on a sparse
   * integer simulator, so nothing counts as solved until the engine agrees.
   */
  const verifyOnEngine = (moves: SolverMove[]): { ok: true; cubies: Cubie[] } | { ok: false; reason: string } => {
    let liveState = model.cloneState(puzzle);
    for (const [index, move] of moves.entries()) {
      if (!model.isMoveLegal(liveState, move)) {
        return { ok: false, reason: `move ${index} (${move.notation}) is not legal in the state it would be applied to` };
      }
      liveState = model.applyMove(liveState, move);
    }
    if (!isExactlySolved(liveState.cubies)) {
      return { ok: false, reason: 'replaying the generated moves on the real 8000-cell state did not solve it exactly' };
    }
    return { ok: true, cubies: liveState.cubies };
  };

  // Fast path: a block-rigid state gets the far shorter block-quotient solution.
  emitSolverDebug(solverId, 'solve: trying the block-quotient fast path');
  const fastPath = await level3BlockQuotientAlgorithm.solve(model, puzzle);
  if (fastPath.success) {
    const verified = verifyOnEngine(fastPath.output_moves);
    if (verified.ok) {
      for (const step of fastPath.explanation) {
        if (step.phase === 'state inspection') continue;
        explanation.push({ ...step, phase: `fast path — ${step.phase}` });
      }
      return {
        ...fastPath,
        name: solverName,
        version: solverVersion,
        input_state: inputState,
        runtime_ms: performance.now() - start,
        explanation,
        final_strategy:
          'The state was still block-rigid, so it was delegated to the Level 3 block quotient (mid-block projection ' +
          'onto Level 2); the slice-reduction phases were not needed.',
        complexity_estimate: primaryComplexityEstimate,
        notes: `Fast path: ${fastPath.notes}`,
      };
    }
    emitSolverDebug(solverId, `solve: fast path failed verification (${verified.reason}); running slice reduction`);
  }
  explanation.push({
    phase: 'fast path check',
    objective: 'Detect states the Level 3 block quotient can still solve directly.',
    observation:
      'The state is outside the block-rigid class — scale-1 slices or depth-2.5 slabs tore mid-blocks apart — ' +
      'so the cell-level slice reduction runs.',
    progress: inputProgress,
  });

  const lib = buildLibrary();

  // Map the incoming cubies onto the integer state.
  const pstate: PState = {
    siteOfPiece: new Int16Array(lib.N),
    pieceAtSite: new Int16Array(lib.N),
    rotOfPiece: new Uint8Array(lib.N),
  };
  for (const cubie of puzzle.cubies) {
    const piece = lib.siteIndexByKey.get(posKey(cubie.homePosition as Vector3Tuple));
    const site = lib.siteIndexByKey.get(posKey(cubie.currentPosition as Vector3Tuple));
    const rot = quaternionRotIndex(cubie.orientation);
    if (piece === undefined || site === undefined || rot === undefined) {
      return failure(
        'State mapping failed.',
        `Cell ${cubie.id} does not map onto the canonical Level 3 site/rotation grid ` +
        `(position ${cubie.currentPosition}, non-grid orientation).`,
      );
    }
    pstate.siteOfPiece[piece] = site;
    pstate.pieceAtSite[site] = piece;
    pstate.rotOfPiece[piece] = rot;
  }

  emitSolverDebug(solverId, 'solve: running the slice-reduction pipeline');
  const pipeline = runPipeline(lib, pstate);
  if (!pipeline.ok) {
    explanation.push({
      phase: 'slice reduction',
      objective: 'Normalize parity, place all 8000 cells orbit by orbit, then remove residual twists.',
      observation: pipeline.note,
      progress: inputProgress,
    });
    return failure('Slice reduction failed.', pipeline.note);
  }

  const optimized = mergeAdjacentAtoms(lib, pipeline.atoms);
  const outputMoves = optimized.map((atom) => atomToSolverMove(lib, atom, 'slice-reduction commutator plan'));

  // Phase-by-phase progress, replayed on the unoptimized list so the phase
  // boundaries still line up.
  let cubies = cloneCubies(puzzle.cubies);
  let cursor = 0;
  for (const phase of pipeline.phaseBreaks) {
    for (; cursor < phase.moveIndex; cursor += 1) {
      cubies = applySolverMoveToCubies(cubies, atomToSolverMove(lib, pipeline.atoms[cursor]!, phase.phase), puzzle);
    }
    explanation.push({
      phase: phase.phase,
      objective: 'Advance the reduction while leaving everything already solved untouched.',
      observation: phase.observation,
      progress: progressForCubies(cubies),
    });
  }

  const verified = verifyOnEngine(outputMoves);
  if (!verified.ok) {
    explanation.push({
      phase: 'final verification',
      objective: 'Replay the full move list on the real 8000-cell state, checking legality before every move.',
      observation: verified.reason,
      progress: progressForCubies(cubies),
    });
    return failure('Final verification failed.', verified.reason);
  }
  const finalProgress = progressForCubies(verified.cubies);
  explanation.push({
    phase: 'final verification',
    objective: 'Replay the full move list on the real 8000-cell state, checking legality before every move.',
    observation: `${progressSummary(finalProgress)} Every move was legal in the state it was applied to.`,
    progress: finalProgress,
  });
  emitSolverDebug(
    solverId,
    `solve: finished in ${Math.round(performance.now() - start)}ms — moves=${outputMoves.length} (raw ${pipeline.atoms.length})`,
  );

  return {
    name: solverName,
    version: solverVersion,
    level_supported: [3],
    input_state: inputState,
    output_moves: outputMoves,
    runtime_ms: performance.now() - start,
    move_count: outputMoves.length,
    success: true,
    explanation,
    final_strategy:
      'Normalize the 164 orbit parities with a GF(2) linear system, then solve each orbit independently by ' +
      'setup-conjugating its one globally pure tool — purity survives conjugation, so a single tool per orbit reaches ' +
      'every site and disturbs nothing else, which is why no phase ordering is needed. Finish with a strict ' +
      'potential descent over depth-3 rolls and twist commutators.',
    complexity_estimate: primaryComplexityEstimate,
    notes: 'Level 3 solved by orbit-by-orbit commutator reduction over the full generator set.',
  };
};

// ---------- scramble generator set ----------

const repeatPool = <T>(pool: T[], times: number): T[] => Array.from({ length: times }).flatMap(() => pool);

const legalFrameMoves = (state: MengerPuzzleState, scale: number): SolverMove[] =>
  state.frames
    .filter((frame) => frame.scale === scale)
    .flatMap((frame) =>
      twistAngles
        .filter((angle) => validateFrameRotation(state.cubies, frame, angle).legal)
        .map((angle) => ({
          targetKind: 'frame' as const,
          targetId: `frame:${frame.id}`,
          frameId: frame.id,
          angle,
          notation: createMove(frame.id, angle, state.frameById).notation,
          reason: '',
        })),
    );

const legalExtensionMoves = (
  state: MengerPuzzleState,
  predicate: (target: TurnTarget) => boolean,
): SolverMove[] =>
  state.turnTargets
    .filter((target) => target.kind === 'extension' && predicate(target))
    .flatMap((target) =>
      twistAngles
        .filter((angle) => validateTurnTargetRotation(state.cubies, target, angle).legal)
        .map((angle) => ({
          targetKind: 'extension' as const,
          targetId: target.id,
          extensionTargetId: target.id,
          angle,
          notation: createExtensionMove(target, angle).notation,
          reason: '',
        })),
    );

const poolCache = new WeakMap<TurnTarget[], SolverMove[]>();

/**
 * The full Level 3 generator set: every physically legal turn of every family,
 * including the scale-1 slices and depth-2.5 slabs the block quotient cannot
 * handle. Nothing this solver finds hard is excluded. Repetition counts only
 * weight the uniform sampler so scrambles are dominated by cell-transporting
 * moves rather than orientation noise; illegal turns are filtered here because
 * only 744 of the 4,800 depth-3 targets can physically turn.
 */
const scrambleMovePool = (
  _model: PuzzleModel<MengerPuzzleState, SolverMove>,
  state: MengerPuzzleState,
): SolverMove[] => {
  const cached = poolCache.get(state.turnTargets);
  if (cached) return cached;
  const pool = [
    ...repeatPool(legalFrameMoves(state, 1), 24),
    ...repeatPool(legalFrameMoves(state, 3), 40),
    ...repeatPool(legalFrameMoves(state, 9), 60),
    ...repeatPool(legalExtensionMoves(state, (target) => target.depth === 1), 30),
    ...repeatPool(legalExtensionMoves(state, (target) => target.depth === 1.5), 15),
    ...repeatPool(legalExtensionMoves(state, (target) => target.depth === 2), 8),
    ...repeatPool(legalExtensionMoves(state, (target) => target.depth === 2.5), 3),
    ...legalExtensionMoves(state, (target) => target.depth === 3 && target.scale === 1),
  ];
  poolCache.set(state.turnTargets, pool);
  return pool;
};

export const level3SliceReductionAlgorithm: SolverAlgorithm<MengerPuzzleState, SolverMove> = {
  id: solverId,
  name: solverName,
  version: solverVersion,
  levelsSupported: [3],
  solve,
  scrambleMovePool,
};

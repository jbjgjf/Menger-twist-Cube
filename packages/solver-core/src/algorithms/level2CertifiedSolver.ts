import type { Cubie, MengerPuzzleState, MoveSystem, TwistAngle } from '@menger/engine';
import { Matrix4, Vector3 } from 'three';
import type { PuzzleModel } from '../model/puzzleModel';
import type { SolverAlgorithm, SolverExplanationStep, SolverMove, SolverProgress, SolverRunResult } from '../algorithm/types';
import { emitSolverDebug } from '../debug';
import { createMengerPuzzleModel } from '../model/mengerPuzzleModel';
import { stateKey } from './level1State';
import { pairToolWords, threeCycleWords } from './level2CertifiedTools';

/**
 * `level2-certified`: the Level 2 solver whose completeness is proved in
 * `docs/proofs/level2-completeness.tex`, for both the standard and the
 * inner-square move system.
 *
 * It contains no heuristic cut-off. Every search it performs is a breadth-first
 * search of a finite graph run to exhaustion, and every tool it applies is a
 * fixed word checked when the library is built. The phases are
 *
 *   0. admissibility   — every cell on its site orbit, in an orientation its
 *                        (site, orientation) automaton can reach;
 *   1. invariant       — one short word that makes all orbit parities even
 *                        (the twist sums and the flip parity must already be 0);
 *   2. positions       — orbit by orbit, with conjugates of one pure 3-cycle;
 *   3. orientations    — two-cell twist / flip tools, then single-cell rolls.
 *
 * A state is rejected in phase 0 or 1 exactly when it is not reachable, so the
 * solver doubles as a membership test for the move group.
 */
const solverId = 'level2-certified';
const solverName = 'Level 2 certified reduction';
const solverVersion = '1.0.0';

// ------------------------------------------------------------ rotations

const mulMat = (a: number[], b: number[]): number[] => {
  const out = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) for (let k = 0; k < 3; k += 1) out[r * 3 + c]! += a[r * 3 + k]! * b[k * 3 + c]!;
  return out;
};
/** The 24 cube rotations as integer matrices; index 0 is the identity. */
const rotations: number[][] = (() => {
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const quarterX = [1, 0, 0, 0, 0, -1, 0, 1, 0];
  const quarterY = [0, 0, 1, 0, 1, 0, -1, 0, 0];
  const found = new Map<string, number[]>([[identity.join(), identity]]);
  const queue = [identity];
  while (queue.length > 0) {
    const m = queue.shift()!;
    for (const g of [quarterX, quarterY]) {
      const next = mulMat(g, m);
      if (!found.has(next.join())) {
        found.set(next.join(), next);
        queue.push(next);
      }
    }
  }
  return [...found.values()];
})();
const rotIndex = new Map(rotations.map((m, i) => [m.join(), i]));
/** rotMul[a][b] = a·b: apply b first, then a. */
const rotMul: number[][] = rotations.map((a) => rotations.map((b) => rotIndex.get(mulMat(a, b).join())!));
const rotInv: number[] = rotations.map((_, i) => rotMul[i]!.findIndex((p) => p === 0));

const rotOfCubie = (cubie: Cubie): number | undefined => {
  const matrix = new Matrix4().makeRotationFromQuaternion(cubie.orientation);
  const cols = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)].map((v) => v.applyMatrix4(matrix));
  return rotIndex.get([0, 1, 2].flatMap((r) => cols.map((c) => Math.round(c.getComponent(r)))).join());
};

// ------------------------------------------------------------ group elements

/** perm[i]: where the piece on site i goes; rot[i]: the rotation applied to it. */
interface Elt { perm: Int16Array; rot: Uint8Array }
interface Atom extends Elt { index: number; label: string; move: SolverMove; inverse: number }

const N = 400;
const identityElt = (): Elt => ({ perm: Int16Array.from({ length: N }, (_, i) => i), rot: new Uint8Array(N) });
/** a then b. */
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
const supportOf = (e: Elt): number[] => {
  const out: number[] = [];
  for (let i = 0; i < N; i += 1) if (e.perm[i] !== i || e.rot[i] !== 0) out.push(i);
  return out;
};
const key = (p: readonly number[]): string => p.join(',');

// ------------------------------------------------------------ library

interface OrbitData {
  sites: number[];
  /** Local index of a site inside `sites`. */
  local: Int16Array;
  /** Admissible orientations of the orbit's base cell at its own site: the freedom group. */
  freedom: number[];
  /** For orbits of freedom 3 or 8: class of a freedom-group element (twist in Z/3, or flip bit). */
  classOf: ((t: number) => number) | null;
  classModulus: number;
  threeCycle: { word: number[]; from: [number, number, number] };
  pairTool: { word: number[]; from: [number, number] } | null;
  /** Atoms that move at least one site of the orbit: the only ones a conjugator needs. */
  movers: number[];
  triples: { parent: Int32Array; via: Int16Array } | null;
  pairs: { parent: Int32Array; via: Int16Array } | null;
}

interface Library {
  system: MoveSystem;
  model: PuzzleModel<MengerPuzzleState, SolverMove>;
  siteIndex: Map<string, number>;
  atoms: Atom[];
  orbitOf: Int16Array;
  orbits: OrbitData[];
  /** Reference orientation of each site, relative to its orbit's base cell. */
  ref: Uint8Array;
  /** admissible[site * 24 + rot] for the base cell of the site's orbit. */
  admissible: Uint8Array;
  /** Per site: roll atoms (position-fixing, one cell), keyed by their rotation. */
  rollsAt: Array<Map<number, number>>;
  /** Parity vectors reachable by the atoms, each with a shortest word producing it. */
  parityWords: Map<number, number[]>;
}

const libraries = new Map<MoveSystem, Library>();

const eltOfCubies = (cubies: readonly Cubie[], siteIndex: Map<string, number>): Elt | null => {
  if (cubies.length !== N) return null;
  const perm = new Int16Array(N).fill(-1);
  const rot = new Uint8Array(N);
  const taken = new Uint8Array(N);
  for (const cubie of cubies) {
    const from = siteIndex.get(key(cubie.homePosition));
    const to = siteIndex.get(key(cubie.currentPosition));
    const turn = rotOfCubie(cubie);
    if (from === undefined || to === undefined || turn === undefined || perm[from] !== -1 || taken[to]) return null;
    perm[from] = to;
    taken[to] = 1;
    rot[from] = turn;
  }
  return { perm, rot };
};

const buildLibrary = (system: MoveSystem): Library => {
  const model = createMengerPuzzleModel(system);
  const solved = model.createState(2);
  const siteIndex = new Map(solved.cubies.map((cubie, index) => [key(cubie.homePosition), index]));
  const moves = model.legalMoves(solved);
  const labelOf = (move: SolverMove) => `${move.targetId}@${move.angle}`;
  const atoms: Atom[] = moves.map((move, index) => ({
    ...eltOfCubies(model.applyMove(solved, move).cubies, siteIndex)!,
    index,
    label: labelOf(move),
    move,
    inverse: -1,
  }));
  const atomByLabel = new Map(atoms.map((atom) => [atom.label, atom]));
  for (const atom of atoms) {
    const inverseAngle: TwistAngle = atom.move.angle === 180 ? 180 : atom.move.angle === 90 ? -90 : 90;
    atom.inverse = atomByLabel.get(`${atom.move.targetId}@${inverseAngle}`)!.index;
  }
  const wordOf = (labels: readonly string[]): number[] =>
    labels.map((label) => {
      const atom = atomByLabel.get(label);
      if (!atom) throw new Error(`${solverId}: tool word uses unknown atom ${label}`);
      return atom.index;
    });
  const eltOfWord = (word: readonly number[]): Elt => word.reduce((acc, index) => mul(acc, atoms[index]!), identityElt());

  // Site orbits.
  const parent = Array.from({ length: N }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  for (const atom of atoms) for (let i = 0; i < N; i += 1) {
    const [a, b] = [find(i), find(atom.perm[i]!)];
    if (a !== b) parent[a] = b;
  }
  const orbitIds = new Map<number, number>();
  const orbitOf = new Int16Array(N);
  for (let i = 0; i < N; i += 1) {
    const root = find(i);
    if (!orbitIds.has(root)) orbitIds.set(root, orbitIds.size);
    orbitOf[i] = orbitIds.get(root)!;
  }
  const orbitSites: number[][] = Array.from({ length: orbitIds.size }, () => []);
  for (let i = 0; i < N; i += 1) orbitSites[orbitOf[i]!]!.push(i);

  // (site, orientation) automaton of each orbit's base cell.
  const ref = new Uint8Array(N);
  const admissible = new Uint8Array(N * 24);
  const freedoms: number[][] = [];
  for (const sites of orbitSites) {
    const base = sites[0]!;
    const hasRef = new Uint8Array(N);
    hasRef[base] = 1;
    admissible[base * 24] = 1;
    const queue = [base * 24];
    for (let head = 0; head < queue.length; head += 1) {
      const site = Math.floor(queue[head]! / 24);
      const turn = queue[head]! % 24;
      for (const atom of atoms) {
        const nextSite = atom.perm[site]!;
        const nextTurn = rotMul[atom.rot[site]!]![turn]!;
        if (admissible[nextSite * 24 + nextTurn]) continue;
        admissible[nextSite * 24 + nextTurn] = 1;
        if (!hasRef[nextSite]) {
          hasRef[nextSite] = 1;
          ref[nextSite] = nextTurn;
        }
        queue.push(nextSite * 24 + nextTurn);
      }
    }
    freedoms.push(Array.from({ length: 24 }, (_, turn) => turn).filter((turn) => admissible[base * 24 + turn]));
  }

  const rollsAt: Array<Map<number, number>> = Array.from({ length: N }, () => new Map());
  for (const atom of atoms) {
    const support = supportOf(atom);
    if (support.length === 1 && atom.perm[support[0]!] === support[0]) rollsAt[support[0]!]!.set(atom.rot[support[0]!]!, atom.index);
  }

  const orderOf = (turn: number): number => {
    let k = 1;
    for (let x = turn; x !== 0; x = rotMul[turn]![x]!) k += 1;
    return k;
  };

  const orbits: OrbitData[] = orbitSites.map((sites, orbit) => {
    const local = new Int16Array(N).fill(-1);
    sites.forEach((site, index) => {
      local[site] = index;
    });
    const freedom = freedoms[orbit]!;
    let classOf: OrbitData['classOf'] = null;
    let classModulus = 1;
    if (freedom.length === 3) {
      const generator = freedom.find((turn) => turn !== 0)!;
      classOf = (t) => (t === 0 ? 0 : t === generator ? 1 : 2);
      classModulus = 3;
    } else if (freedom.length === 8) {
      const quarter = freedom.find((turn) => orderOf(turn) === 4)!;
      const cyclic = new Set([0, quarter, rotMul[quarter]![quarter]!, rotInv[quarter]!]);
      classOf = (t) => (cyclic.has(t) ? 0 : 1);
      classModulus = 2;
    }
    return {
      sites,
      local,
      freedom,
      classOf,
      classModulus,
      threeCycle: { word: [], from: [0, 0, 0] },
      pairTool: null,
      movers: atoms.filter((atom) => sites.some((site) => atom.perm[site] !== site)).map((atom) => atom.index),
      triples: null,
      pairs: null,
    };
  });

  // Tools. Each word is re-verified here; a library with a bad tool never exists.
  for (const labels of threeCycleWords) {
    const word = wordOf(labels);
    const e = eltOfWord(word);
    const support = supportOf(e);
    if (support.length !== 3 || support.some((site) => e.perm[site] === site)) throw new Error(`${solverId}: a 3-cycle tool is not pure`);
    const a = support[0]!;
    orbits[orbitOf[a]!]!.threeCycle = { word, from: [a, e.perm[a]!, e.perm[e.perm[a]!]!] };
  }
  for (const labels of pairToolWords) {
    const word = wordOf(labels);
    const e = eltOfWord(word);
    const support = supportOf(e);
    if (support.length !== 2 || support.some((site) => e.perm[site] !== site)) throw new Error(`${solverId}: a pair tool is not a two-cell re-orientation`);
    orbits[orbitOf[support[0]!]!]!.pairTool = { word, from: [support[0]!, support[1]!] };
  }
  for (const orbit of orbits) {
    if (orbit.threeCycle.word.length === 0) throw new Error(`${solverId}: an orbit has no 3-cycle tool`);
    if (orbit.classOf && !orbit.pairTool) throw new Error(`${solverId}: an orbit with a twist or flip class has no pair tool`);
    if (orbit.freedom.length === 4 || orbit.freedom.length === 8) {
      // Rolls must generate the cyclic part at every cell of the orbit.
      for (const site of orbit.sites) if (rollsAt[site]!.size !== 3) throw new Error(`${solverId}: site ${site} lacks its three roll atoms`);
    }
  }

  // Parity vectors of the atoms and a shortest word for every reachable one.
  const parityOf = (e: Elt): number => {
    const seen = new Uint8Array(N);
    let mask = 0;
    for (let start = 0; start < N; start += 1) {
      if (seen[start]) continue;
      let length = 0;
      for (let cursor = start; !seen[cursor]; cursor = e.perm[cursor]!) {
        seen[cursor] = 1;
        length += 1;
      }
      if (length % 2 === 0) mask ^= 1 << orbitOf[start]!;
    }
    return mask;
  };
  const atomParity = atoms.map(parityOf);
  const parityWords = new Map<number, number[]>([[0, []]]);
  const frontier = [0];
  for (let head = 0; head < frontier.length; head += 1) {
    const value = frontier[head]!;
    for (const atom of atoms) {
      const next = value ^ atomParity[atom.index]!;
      if (parityWords.has(next)) continue;
      parityWords.set(next, [...parityWords.get(value)!, atom.index]);
      frontier.push(next);
    }
  }

  return { system, model, siteIndex, atoms, orbitOf, orbits, ref, admissible, rollsAt, parityWords };
};

const libraryFor = (system: MoveSystem): Library => {
  let library = libraries.get(system);
  if (!library) {
    library = buildLibrary(system);
    libraries.set(system, library);
  }
  return library;
};

/**
 * Exhaustive breadth-first search over ordered k-tuples of distinct sites of
 * one orbit (k = 2 or 3), from the tool's own tuple. `parent`/`via` let any
 * tuple be traced back to it. Run to exhaustion: no depth or node limit.
 */
const searchTuples = (lib: Library, orbit: OrbitData, from: number[]): { parent: Int32Array; via: Int16Array } => {
  const n = orbit.sites.length;
  const k = from.length;
  const size = n ** k;
  const parent = new Int32Array(size).fill(-1);
  const via = new Int16Array(size).fill(-1);
  const encode = (locals: number[]): number => locals.reduce((acc, value) => acc * n + value, 0);
  const start = encode(from.map((site) => orbit.local[site]!));
  parent[start] = start;
  const queue = new Int32Array(size);
  let tail = 0;
  queue[tail++] = start;
  // Each mover as a permutation of local indices.
  const localPerms = orbit.movers.map((index) => {
    const atom = lib.atoms[index]!;
    return Int16Array.from(orbit.sites, (site) => orbit.local[atom.perm[site]!]!);
  });
  for (let head = 0; head < tail; head += 1) {
    const code = queue[head]!;
    const c = code % n;
    const b = Math.floor(code / n) % n;
    const a = k === 3 ? Math.floor(code / (n * n)) : -1;
    for (let m = 0; m < localPerms.length; m += 1) {
      const perm = localPerms[m]!;
      const next = k === 3 ? (perm[a]! * n + perm[b]!) * n + perm[c]! : perm[b]! * n + perm[c]!;
      if (parent[next] !== -1) continue;
      parent[next] = code;
      via[next] = orbit.movers[m]!;
      queue[tail++] = next;
    }
  }
  const expected = k === 3 ? n * (n - 1) * (n - 2) : n * (n - 1);
  if (tail !== expected) throw new Error(`${solverId}: tuple search reached ${tail} of ${expected} ordered ${k}-tuples`);
  return { parent, via };
};

/** A word g of atoms whose site action carries the tool's tuple to `target`. */
const conjugatorTo = (orbit: OrbitData, table: { parent: Int32Array; via: Int16Array }, target: number[]): number[] => {
  const n = orbit.sites.length;
  let code = target.reduce((acc, site) => acc * n + orbit.local[site]!, 0);
  const reversed: number[] = [];
  while (table.parent[code] !== code) {
    reversed.push(table.via[code]!);
    code = table.parent[code]!;
  }
  return reversed.reverse();
};

/** Builds the solver's library for a system ahead of time (also checks every tool). */
export const warmLevel2CertifiedSolver = (system: MoveSystem = 'standard'): void => {
  libraryFor(system);
};

// ------------------------------------------------------------ solving

interface Outcome { ok: boolean; word: number[]; phases: Array<{ phase: string; atoms: number; note: string }>; failure?: string }

const runPipeline = (lib: Library, input: Elt): Outcome => {
  const { atoms, orbits, orbitOf, ref, admissible, rollsAt } = lib;
  let state = input;
  const word: number[] = [];
  const phases: Outcome['phases'] = [];
  const apply = (indices: readonly number[]): void => {
    for (const index of indices) {
      state = mul(state, atoms[index]!);
      word.push(index);
    }
  };
  const inverseWord = (indices: readonly number[]): number[] => [...indices].reverse().map((index) => atoms[index]!.inverse);

  // Phase 0: admissibility. tau = ref[site]^-1 · rot · ref[home] must be an
  // orientation the orbit's base cell can take at its own site.
  const tauOf = (piece: number): number => rotMul[rotInv[ref[state.perm[piece]!]!]!]![rotMul[state.rot[piece]!]![ref[piece]!]!]!;
  for (let piece = 0; piece < N; piece += 1) {
    const site = state.perm[piece]!;
    if (orbitOf[site] !== orbitOf[piece]) return { ok: false, word: [], phases, failure: 'A cell is outside its site orbit: the state is unreachable.' };
    if (!admissible[site * 24 + rotMul[state.rot[piece]!]![ref[piece]!]!]) {
      return { ok: false, word: [], phases, failure: 'A cell has an orientation its orbit never takes at that site: the state is unreachable.' };
    }
  }
  for (const orbit of orbits) {
    if (!orbit.classOf) continue;
    let sum = 0;
    for (const piece of orbit.sites) sum += orbit.classOf(tauOf(piece));
    if (sum % orbit.classModulus !== 0) {
      return {
        ok: false,
        word: [],
        phases,
        failure: `The ${orbit.classModulus === 3 ? 'twist sum' : 'flip parity'} of a ${orbit.sites.length}-cell orbit is non-zero: the state is unreachable.`,
      };
    }
  }

  // Phase 1: orbit parities.
  const parity = ((): number => {
    const seen = new Uint8Array(N);
    let mask = 0;
    for (let start = 0; start < N; start += 1) {
      if (seen[start]) continue;
      let length = 0;
      for (let cursor = start; !seen[cursor]; cursor = state.perm[cursor]!) {
        seen[cursor] = 1;
        length += 1;
      }
      if (length % 2 === 0) mask ^= 1 << orbitOf[start]!;
    }
    return mask;
  })();
  const parityWord = lib.parityWords.get(parity);
  if (!parityWord) {
    return { ok: false, word: [], phases, failure: 'The orbit parity vector is outside the span of the move set: the state is unreachable in this move system.' };
  }
  apply(parityWord);
  phases.push({ phase: 'invariant', atoms: parityWord.length, note: `parity vector 0x${parity.toString(16)} cancelled` });

  // Phase 2: positions, one orbit at a time, by conjugates of the orbit's 3-cycle.
  let positionAtoms = 0;
  for (const orbit of orbits) {
    const pieceAt = new Int16Array(N);
    const refresh = (): void => {
      for (const piece of orbit.sites) pieceAt[state.perm[piece]!] = piece;
    };
    refresh();
    for (;;) {
      const a = orbit.sites.find((site) => pieceAt[site] !== site);
      if (a === undefined) break;
      const b = pieceAt[a]!; // the piece on a belongs on b
      // Send a -> b and b -> c, where c is the home of the piece on b when that
      // is not a (two cells land); otherwise any other misplaced site.
      let c = pieceAt[b]!;
      if (c === a) {
        const other = orbit.sites.find((site) => site !== a && site !== b && pieceAt[site] !== site);
        if (other === undefined) return { ok: false, word: [], phases, failure: 'An orbit is left with a single transposition: parity was not normalised.' };
        c = other;
      }
      orbit.triples ??= searchTuples(lib, orbit, orbit.threeCycle.from);
      const g = conjugatorTo(orbit, orbit.triples, [a, b, c]);
      const before = word.length;
      apply([...inverseWord(g), ...orbit.threeCycle.word, ...g]);
      positionAtoms += word.length - before;
      refresh();
    }
  }
  phases.push({ phase: 'positions', atoms: positionAtoms, note: 'every cell on its home site' });

  // Phase 3: orientations. Positions are solved, so state.rot[piece] is the
  // orientation of the cell on site `piece`, and tools act on it from the left.
  let orientationAtoms = 0;
  for (const orbit of orbits) {
    if (orbit.freedom.length === 1) continue;
    const before = word.length;
    const rollable = (site: number): Set<number> => new Set([0, ...rollsAt[site]!.keys()]);
    const good = (site: number): boolean =>
      rollsAt[site]!.size > 0 ? rollable(site).has(rotInv[state.rot[site]!]!) : state.rot[site] === 0;
    if (orbit.pairTool) {
      for (let index = 0; index < orbit.sites.length - 1; index += 1) {
        const x = orbit.sites[index]!;
        if (good(x)) continue;
        const y = orbit.sites[index + 1]!;
        orbit.pairs ??= searchTuples(lib, orbit, orbit.pairTool.from);
        const g = conjugatorTo(orbit, orbit.pairs, [x, y]);
        const tool = [...inverseWord(g), ...orbit.pairTool.word, ...g];
        let tries = 0;
        while (!good(x)) {
          if ((tries += 1) > 3) return { ok: false, word: [], phases, failure: 'A pair tool did not bring a cell into its roll coset.' };
          apply(tool);
        }
      }
      if (!good(orbit.sites.at(-1)!)) return { ok: false, word: [], phases, failure: 'The last cell of an orbit is left twisted: the class sum was not zero.' };
    }
    for (const site of orbit.sites) {
      if (state.rot[site] === 0) continue;
      const roll = rollsAt[site]!.get(rotInv[state.rot[site]!]!);
      if (roll === undefined) return { ok: false, word: [], phases, failure: 'A cell needs a roll that is not an atom.' };
      apply([roll]);
    }
    orientationAtoms += word.length - before;
  }
  phases.push({ phase: 'orientations', atoms: orientationAtoms, note: 'every cell in its home orientation' });

  for (let i = 0; i < N; i += 1) {
    if (state.perm[i] !== i || state.rot[i] !== 0) return { ok: false, word: [], phases, failure: 'Internal error: the pipeline ended off the solved state.' };
  }
  return { ok: true, word, phases };
};

/** Cancels adjacent atoms on the same target (g g^-1 pairs between consecutive conjugated tools). */
const simplify = (lib: Library, word: readonly number[]): number[] => {
  const angleOf = (index: number): number => lib.atoms[index]!.move.angle;
  const out: number[] = [];
  for (const index of word) {
    const last = out.at(-1);
    if (last === undefined || lib.atoms[last]!.move.targetId !== lib.atoms[index]!.move.targetId) {
      out.push(index);
      continue;
    }
    out.pop();
    const total = (((angleOf(last) + angleOf(index)) % 360) + 360) % 360;
    if (total === 0) continue;
    const angle = total === 270 ? -90 : total;
    out.push(lib.atoms.find((atom) => atom.move.targetId === lib.atoms[index]!.move.targetId && atom.move.angle === angle)!.index);
  }
  return out;
};

const progressOf = (cubies: readonly Cubie[]): SolverProgress => {
  let positionSolved = 0;
  let solved = 0;
  for (const cubie of cubies) {
    const home = key(cubie.homePosition) === key(cubie.currentPosition);
    if (home) positionSolved += 1;
    if (home && rotOfCubie(cubie) === 0) solved += 1;
  }
  return {
    solvedCubies: solved,
    positionSolved,
    cornerOrientationSolved: 0,
    edgeFrameSolved: 0,
    extensionSolved: 0,
    totalCubies: cubies.length,
    totalCorners: 0,
    totalEdges: 0,
  };
};

const solve = async (
  model: PuzzleModel<MengerPuzzleState, SolverMove>,
  state: MengerPuzzleState,
): Promise<SolverRunResult> => {
  const started = performance.now();
  const progress = progressOf(state.cubies);
  const base = {
    name: solverName,
    version: solverVersion,
    level_supported: [2],
    input_state: { level: state.level, cubieCount: state.cubies.length, stateKey: stateKey(state.cubies, false), progress },
    final_strategy:
      'Normalise the orbit parities with one short word, place every orbit with conjugates of its pure 3-cycle, then ' +
      'remove twists and flips with two-cell tools and single-cell rolls. Every search is exhaustive.',
    complexity_estimate: 'At most one 3-cycle per misplaced cell; conjugators come from an exhaustive search of ordered triples.',
  };
  const fail = (notes: string, explanation: SolverExplanationStep[] = []): SolverRunResult => ({
    ...base,
    output_moves: [],
    move_count: 0,
    success: false,
    runtime_ms: performance.now() - started,
    explanation,
    notes,
  });
  if (state.level !== 2) return fail(`${solverId} only supports Level 2.`);

  const lib = libraryFor(state.moveSystem ?? 'standard');
  const input = eltOfCubies(state.cubies, lib.siteIndex);
  if (!input) return fail('The input is not a placement of the 400 Level 2 cells on the 400 sites.');

  const outcome = runPipeline(lib, input);
  const explanation: SolverExplanationStep[] = outcome.phases.map((phase) => ({
    phase: phase.phase,
    objective: phase.phase,
    observation: `${phase.note} (${phase.atoms} atoms)`,
    progress,
  }));
  if (!outcome.ok) {
    emitSolverDebug(solverId, `rejected: ${outcome.failure}`);
    return fail(outcome.failure!, explanation);
  }

  const word = simplify(lib, outcome.word);
  const moves: SolverMove[] = word.map((index) => ({ ...lib.atoms[index]!.move, reason: '' }));
  // Soundness boundary: replay through the caller's model, judging every move.
  let current = model.cloneState(state);
  for (const move of moves) {
    if (!model.isMoveLegal(current, move)) return fail(`Replay rejected ${move.notation} as illegal.`, explanation);
    current = model.applyMove(current, move);
  }
  if (!model.isSolved(current)) return fail('Replay did not end on the solved state.', explanation);

  emitSolverDebug(solverId, `solved in ${moves.length} atoms (${outcome.word.length} before cancellation)`);
  return {
    ...base,
    output_moves: moves,
    move_count: moves.length,
    success: true,
    runtime_ms: performance.now() - started,
    explanation,
    notes: `Solved by the certified reduction in the ${lib.system} move system.`,
  };
};

/**
 * No `scrambleMovePool`: benchmarks scramble with the model's full legal move
 * set, whichever move system the model belongs to.
 */
export const level2CertifiedAlgorithm: SolverAlgorithm<MengerPuzzleState, SolverMove> = {
  moveSystemsSupported: ['standard', 'inner-square'],
  id: solverId,
  name: solverName,
  version: solverVersion,
  levelsSupported: [2],
  solve,
};

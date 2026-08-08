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
} from '@menger/engine';
import type { SolverAlgorithm, SolverExplanationStep, SolverMove, SolverRunResult } from '../algorithm/types';
import type { PuzzleModel } from '../model/puzzleModel';
import { isExactlySolved, progressForCubies, progressSummary, stateKey } from './level1State';
import { level2BlockQuotientAlgorithm } from './level2BlockQuotientSolver';
import { emitSolverDebug } from '../debug';

const solverId = 'level2-slice-reduction';
const solverName = 'level-2-slice-reduction-commutator';
const solverVersion = '0.3.0';
const primaryComplexityEstimate =
  'One-time commutator tool-library construction (~5s), then per solve: O(orbits) parity normalization, ' +
  '~160 conjugated pure-permutation placements found by pair-BFS over <=9120 states each (3-, 5- and double ' +
  '3-cycles, each landing 2 to 6 cells), and a potential-descent twist cleanup';

/*
 * Level 2 slice-reduction solver.
 *
 * Solves every reachable Level 2 state — scrambles may use single-layer (scale-1)
 * slices, scale-3 block layers, depth-1 block extensions, depth-1.5 slab twists and
 * depth-2 cell rolls. Method (documented in docs/algorithms/level2-slice-reduction-solver.md):
 *
 *   0. fast path: block-rigid states are delegated to the block-quotient solver
 *   1. orbit parity normalization (F2 linear system over quarter-turn parity vectors)
 *   2. corner-block cell placement: CC then CE, via conjugated pure commutators
 *      (3-cycles, 5-cycles and double 3-cycles, scored by how many cells each
 *      actually lands rather than by aiming a single one — see `findPlacement`)
 *   3. corner-block corner-cell orientation (CC twist commutators; may disturb edge regions)
 *   4. edge-block cell placement: EC, EEa, EEo (EC orientation is position-determined)
 *   5. edge-cell orientation normalization: E2 rolls + twist commutators, potential descent
 *   6. exact verification by replay on the real 400-cell state
 *
 * All solving tools are commutators, hence even on every piece orbit (parity fixed once
 * stays fixed) and confined to their piece classes under conjugation (phase isolation).
 */

// ---------- rotation algebra: the 24 orientation-preserving cube rotations ----------

type Mat = readonly number[]; // row-major 3x3, applied as M·v

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
      const key = matKey(next);
      if (!found.has(key)) {
        found.set(key, next);
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
  const inv = rotInv[quarter]!;
  const plus = sign > 0 ? quarter : inv;
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

// ---------- puzzle indexing, atoms, and the commutator tool library ----------

type PieceClass = 'CC' | 'CE' | 'EC' | 'EEa' | 'EEo';
const twistAngles: TwistAngle[] = [90, -90, 180];

interface Atom {
  id: string;
  kind: 'frame' | 'extension';
  refId: string;
  angle: TwistAngle;
  perm: Int16Array; // perm[i] = destination site of content at site i
  rot: number; // rotation index applied to affected cells
  affected: Uint8Array;
  moved: number[];
}

/**
 * A pure tool: it permutes `src` onto `dst` inside one piece class and leaves
 * every other cell — position *and* orientation — untouched.
 *
 * The same 16-atom interchange words that yield 3-cycles also yield 5-cycles,
 * double 3-cycles, 7-cycles and 4+4s (see `research/scratch/l2-longer-cycles.ts`),
 * and those land 4 or 6 cells for the same word length instead of 2. So a
 * template is stored as a general permutation of its support rather than as a
 * 3-cycle, and the placement search scores candidates by how many cells they
 * actually land.
 *
 * No odd permutation can appear here: every commutator is even, which is also
 * why a bare 4-cycle tool does not exist at any length.
 */
interface Template {
  word: Atom[];
  src: number[]; // sites whose content moves
  dst: number[]; // dst[k] = where the content at src[k] ends up
  rots: number[]; // rotation applied to the content coming from src[k]
  cls: PieceClass;
}

/** The support-3 special case, kept separately because twister construction needs it. */
interface CycleTemplate {
  word: Atom[];
  cycle: [number, number, number]; // content at cycle[0] -> cycle[1] -> cycle[2] -> cycle[0]
  rots: [number, number, number];
  cls: PieceClass;
}

interface Twister { word: Atom[]; sites: number[]; rots: number[] }

interface Library {
  canonical: MengerPuzzleState;
  N: number;
  sitePositions: Vector3Tuple[];
  siteIndexByKey: Map<string, number>;
  siteClasses: PieceClass[];
  classSites: Map<PieceClass, number[]>;
  atoms: Atom[];
  atomById: Map<string, Atom>;
  frameAtoms: Atom[];
  posAtoms: Atom[];
  e2Atoms: Atom[];
  byPair: Map<number, Template[]>;
  twisterBySiteRot: Map<number, Twister[]>;
  twisterByPair: Map<number, Array<{ wa: number; wb: number; tw: Twister }>>;
  orbitIndexOfSite: Int16Array;
  orbitCount: number;
  orbitSitesList: number[][];
  parityGenerators: Array<{ atom: Atom; vec: number }>;
  buildMs: number;
}

const posKey = (p: Vector3Tuple): string => `${p[0]},${p[1]},${p[2]}`;

const blockOf = (p: Vector3Tuple): Vector3Tuple => [
  Math.floor((p[0] + 4) / 3) - 1,
  Math.floor((p[1] + 4) / 3) - 1,
  Math.floor((p[2] + 4) / 3) - 1,
];

const classOfPosition = (p: Vector3Tuple): PieceClass => {
  const b = blockOf(p);
  const o: Vector3Tuple = [p[0] - 3 * b[0], p[1] - 3 * b[1], p[2] - 3 * b[2]];
  const bZeros = b.filter((v) => v === 0).length;
  const oZeros = o.filter((v) => v === 0).length;
  if (bZeros === 0 && oZeros === 0) return 'CC';
  if (bZeros === 0) return 'CE';
  if (oZeros === 0) return 'EC';
  return b.findIndex((v) => v === 0) === o.findIndex((v) => v === 0) ? 'EEa' : 'EEo';
};

let libraryCache: Library | null = null;

const buildLibrary = (): Library => {
  if (libraryCache) return libraryCache;
  const start = performance.now();
  const canonical = createMengerPuzzleState(2);
  const sitePositions = canonical.cubies.map((c) => [...c.homePosition] as Vector3Tuple);
  const N = sitePositions.length;
  const siteIndexByKey = new Map<string, number>(sitePositions.map((p, i) => [posKey(p), i]));
  const siteClasses = sitePositions.map(classOfPosition);
  const classSites = new Map<PieceClass, number[]>();
  for (let i = 0; i < N; i += 1) {
    const l = classSites.get(siteClasses[i]!) ?? [];
    l.push(i);
    classSites.set(siteClasses[i]!, l);
  }
  const isCC = (i: number) => siteClasses[i] === 'CC';
  const isCE = (i: number) => siteClasses[i] === 'CE';
  const isCorner = (i: number) => isCC(i) || isCE(i);
  const pairKey = (a: number, b: number) => a * N + b;

  // --- atoms ---
  const buildAtom = (
    id: string,
    kind: 'frame' | 'extension',
    refId: string,
    angle: TwistAngle,
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
      if (dest === undefined) throw new Error(`level2-slice-reduction: atom ${id} maps a cell outside the Menger cell set`);
      perm[i] = dest;
      affected[i] = 1;
      moved.push(i);
    }
    return { id, kind, refId, angle, perm, rot, affected, moved };
  };

  const atoms: Atom[] = [];
  for (const frame of canonical.frames) {
    for (const angle of twistAngles) {
      atoms.push(
        buildAtom(
          `f:${frame.id}:${angle}`,
          'frame',
          frame.id,
          angle,
          frame.selector,
          frame.axis,
          [frame.axis[0] * frame.layer, frame.axis[1] * frame.layer, frame.axis[2] * frame.layer],
        ),
      );
    }
  }
  for (const target of canonical.turnTargets) {
    if (target.kind !== 'extension') continue;
    for (const angle of twistAngles) {
      atoms.push(buildAtom(`e:${target.id}:${angle}`, 'extension', target.id, angle, target.selector, target.axis, target.pivot));
    }
  }
  const atomById = new Map(atoms.map((a) => [a.id, a]));
  const targetById = canonical.turnTargetById;
  const atomTarget = (a: Atom): TurnTarget | undefined => (a.kind === 'extension' ? targetById.get(a.refId) : undefined);
  const frameAtoms = atoms.filter((a) => a.kind === 'frame');
  const blockLocalAtoms = atoms.filter((a) => {
    const t = atomTarget(a);
    return t !== undefined && (t.depth === 1 || t.depth === 1.5);
  });
  const e2Atoms = atoms.filter((a) => atomTarget(a)?.depth === 2);
  const posAtoms = atoms.filter((a) => a.kind === 'frame' || atomTarget(a)!.depth !== 2);

  // --- word helpers ---
  interface Action { perm: Int16Array; rot: Uint8Array }
  const identityAction = (): Action => {
    const perm = new Int16Array(N);
    const rot = new Uint8Array(N).fill(ROT_ID);
    for (let i = 0; i < N; i += 1) perm[i] = i;
    return { perm, rot };
  };
  const applyAtomToAction = (a: Action, b: Atom): Action => {
    const perm = new Int16Array(N);
    const rot = new Uint8Array(N);
    for (let i = 0; i < N; i += 1) {
      const mid = a.perm[i]!;
      perm[i] = b.perm[mid]!;
      rot[i] = b.affected[mid] ? rotMul[b.rot]![a.rot[i]!]! : a.rot[i]!;
    }
    return { perm, rot };
  };
  const actionOfWord = (word: Atom[]): Action => word.reduce(applyAtomToAction, identityAction());
  const inverseAtom = (a: Atom): Atom => {
    const inverseAngle: TwistAngle = a.angle === 180 ? 180 : a.angle === 90 ? -90 : 90;
    return atomById.get(`${a.kind === 'frame' ? 'f' : 'e'}:${a.refId}:${inverseAngle}`)!;
  };
  const inverseWord = (word: Atom[]): Atom[] => [...word].reverse().map(inverseAtom);
  const commutatorWord = (a: Atom[], b: Atom[]): Atom[] => [...a, ...b, ...inverseWord(a), ...inverseWord(b)];

  // --- pure templates: 3-cycles and the longer even permutations alongside them ---
  const maxTemplateSupport = 8;
  const templates: Template[] = [];
  const cycleTemplates: CycleTemplate[] = [];
  const addTemplateIfPure = (word: Atom[], scope: 'edge' | 'corner') => {
    const action = actionOfWord(word);
    const pos: number[] = [];
    for (let i = 0; i < N; i += 1) {
      if (action.perm[i] !== i && (scope === 'edge' || isCorner(i))) pos.push(i);
      if (pos.length > maxTemplateSupport) return;
    }
    if (pos.length < 3) return;
    const cls = siteClasses[pos[0]!]!;
    if (pos.some((s) => siteClasses[s] !== cls)) return;
    if (scope === 'edge') {
      for (let i = 0; i < N; i += 1) if (action.perm[i] === i && action.rot[i] !== ROT_ID) return;
    } else {
      for (let i = 0; i < N; i += 1) if (isCorner(i) && action.perm[i] === i && action.rot[i] !== ROT_ID) return;
    }
    templates.push({
      word,
      src: pos,
      dst: pos.map((s) => action.perm[s]!),
      rots: pos.map((s) => action.rot[s]!),
      cls,
    });
    if (pos.length === 3) {
      const t1 = pos[0]!;
      const t2 = action.perm[t1]!;
      const t3 = action.perm[t2]!;
      if (t3 !== t1 && action.perm[t3] === t1) {
        cycleTemplates.push({
          word,
          cycle: [t1, t2, t3],
          rots: [action.rot[t1]!, action.rot[t2]!, action.rot[t3]!],
          cls,
        });
      }
    }
  };

  // edge classes: interchange pairs of small-support [frame, E1/slab] commutators
  {
    interface Seed { atoms: Atom[]; support: number[] }
    const seeds: Seed[] = [];
    const seen = new Set<string>();
    for (const f of frameAtoms) {
      for (const e of blockLocalAtoms) {
        const word = commutatorWord([f], [e]);
        const action = actionOfWord(word);
        const support: number[] = [];
        let over = false;
        for (let i = 0; i < N; i += 1) {
          if (action.perm[i] !== i || action.rot[i] !== ROT_ID) {
            support.push(i);
            if (support.length > 9) { over = true; break; }
          }
        }
        if (over || support.length === 0) continue;
        const key = support.map((i) => `${i}>${action.perm[i]}#${action.rot[i]}`).join(';');
        if (seen.has(key)) continue;
        seen.add(key);
        seeds.push({ atoms: word, support });
      }
    }
    const siteToSeeds = new Map<number, number[]>();
    seeds.forEach((w, wi) => {
      for (const s of w.support) {
        const l = siteToSeeds.get(s) ?? [];
        l.push(wi);
        siteToSeeds.set(s, l);
      }
    });
    // Plain products of two overlapping seeds are occasionally pure 3-cycles at
    // half the interchange length (8 atoms against 16), but only ever on EEa,
    // and threading them through cut EEa by just 8% while tripling the library
    // build. Not worth it — see docs/algorithms/level2-slice-reduction-solver.md.
    for (let i1 = 0; i1 < seeds.length; i1 += 1) {
      const w1 = seeds[i1]!;
      const partners = new Set<number>();
      for (const s of w1.support) for (const j of siteToSeeds.get(s) ?? []) if (j > i1) partners.add(j);
      // Seeds sharing exactly one site interchange into a 3-cycle; other
      // overlaps give 5-cycles, double 3-cycles and 4+4s from the same 16-atom
      // word, landing twice or three times as many cells. `addTemplateIfPure`
      // keeps whichever shape comes out, so no overlap count is filtered here.
      for (const j of partners) {
        addTemplateIfPure(commutatorWord(w1.atoms, seeds[j]!.atoms), 'edge');
      }
    }
  }
  // corner classes: class-restricted interchange of [slice, conjugated slice]
  {
    const cornerAtoms = frameAtoms.filter((a) => a.moved.some(isCorner));
    interface Cand { word: Atom[]; cc: Set<number>; ce: Set<number> }
    const mkCand = (word: Atom[]): Cand => {
      const action = actionOfWord(word);
      const cc = new Set<number>();
      const ce = new Set<number>();
      for (let i = 0; i < N; i += 1) {
        if (action.perm[i] === i) continue;
        if (isCC(i)) cc.add(i);
        else if (isCE(i)) ce.add(i);
      }
      return { word, cc, ce };
    };
    const singles = cornerAtoms.map((a) => mkCand([a]));
    const conjugates: Cand[] = [];
    for (const g of cornerAtoms) {
      for (const h of cornerAtoms) {
        if (g.refId !== h.refId) conjugates.push(mkCand([g, h, ...inverseWord([g])]));
      }
    }
    const intersect = (a: Set<number>, b: Set<number>) => {
      let n = 0;
      for (const x of a) if (b.has(x)) n += 1;
      return n;
    };
    for (const A of singles) {
      for (const B of conjugates) {
        const cc = intersect(A.cc, B.cc);
        const ce = intersect(A.ce, B.ce);
        if ((cc === 1 && ce === 0) || (ce === 1 && cc === 0)) addTemplateIfPure(commutatorWord(A.word, B.word), 'corner');
      }
    }
  }

  // Ordered-pair index: a template is filed under every "content at p -> q" it
  // offers, in both directions. Wide tools are filed first so they win the
  // per-pair cap — a 5-cycle lands twice what a 3-cycle does for the same word.
  const templatesPerPair = 24;
  const byPair = new Map<number, Template[]>();
  const fileTemplate = (t: Template) => {
    for (let k = 0; k < t.src.length; k += 1) {
      const key = pairKey(t.src[k]!, t.dst[k]!);
      const list = byPair.get(key);
      if (!list) byPair.set(key, [t]);
      else if (list.length < templatesPerPair) list.push(t);
    }
  };
  for (const t of [...templates].sort((a, b) => b.src.length - a.src.length)) {
    fileTemplate(t);
    fileTemplate({
      word: inverseWord(t.word),
      src: t.dst,
      dst: t.src,
      rots: t.rots.map((r) => rotInv[r]!),
      cls: t.cls,
    });
  }

  // --- twisters (position-identity words with small rotation support) ---
  const twisterBySiteRot = new Map<number, Twister[]>();
  const twisterByPair = new Map<number, Array<{ wa: number; wb: number; tw: Twister }>>();
  const seenTwisterProfiles = new Set<string>();
  const registerTwisterProfile = (word: Atom[], sitesIn: number[], rotsIn: number[]): boolean => {
    const sites: number[] = [];
    const rots: number[] = [];
    for (let k = 0; k < sitesIn.length; k += 1) {
      if (rotsIn[k] === ROT_ID) continue;
      sites.push(sitesIn[k]!);
      rots.push(rotsIn[k]!);
    }
    if (sites.length === 0) return false;
    const profile = sites.map((s, k) => `${s}#${rots[k]}`).join(';');
    if (seenTwisterProfiles.has(profile)) return false;
    seenTwisterProfiles.add(profile);
    const tw: Twister = { word, sites, rots };
    for (let k = 0; k < sites.length; k += 1) {
      const idx = sites[k]! * 24 + rots[k]!;
      const list = twisterBySiteRot.get(idx) ?? [];
      if (list.length < 16) {
        list.push(tw);
        twisterBySiteRot.set(idx, list);
      }
    }
    if (sites.length === 2) {
      for (const [ai, bi] of [[0, 1], [1, 0]] as const) {
        const key = pairKey(sites[ai]!, sites[bi]!);
        const list = twisterByPair.get(key) ?? [];
        if (list.length < 24) {
          list.push({ wa: rots[ai]!, wb: rots[bi]!, tw });
          twisterByPair.set(key, list);
        }
      }
    }
    return true;
  };
  {
    // same-ordered-cycle variant pairs: T_i · T_j^-1 is position-identity, rot inv(rj_k)·ri_k at cycle[k]
    const byCycle = new Map<string, CycleTemplate[]>();
    for (const t of cycleTemplates) {
      const key = t.cycle.join(',');
      const l = byCycle.get(key) ?? [];
      if (l.length < 10) l.push(t);
      byCycle.set(key, l);
    }
    for (const group of byCycle.values()) {
      for (let i = 0; i < group.length; i += 1) {
        for (let j = 0; j < group.length; j += 1) {
          if (i === j || group[i]!.rots.join() === group[j]!.rots.join()) continue;
          const ti = group[i]!;
          const tj = group[j]!;
          const rots = ti.cycle.map((_, k) => rotMul[rotInv[tj.rots[k]!]!]![ti.rots[k]!]!);
          registerTwisterProfile([...ti.word, ...inverseWord(tj.word)], [...ti.cycle], rots);
        }
      }
    }
    // [E2, T]: roll at the E2 cell, inverse-conjugated roll at its cycle predecessor
    for (const t of cycleTemplates) {
      if (t.cls !== 'EEa' && t.cls !== 'EEo') continue;
      for (const e2 of e2Atoms) {
        const a = e2.moved[0]!;
        const ka = t.cycle.indexOf(a);
        if (ka < 0) continue;
        const kc = (ka + 2) % 3;
        const c = t.cycle[kc]!;
        const rhoCA = t.rots[kc]!;
        const rotAtC = rotMul[rotInv[rhoCA]!]![rotMul[rotInv[e2.rot]!]![rhoCA]!]!;
        registerTwisterProfile(commutatorWord([e2], t.word), [a, c], [e2.rot, rotAtC]);
      }
    }
  }

  // --- site orbits and parity generators ---
  const orbitIndexOfSite: Int16Array = (() => {
    const parent = new Int32Array(N).map((_, i) => i);
    const find = (x: number): number => {
      let r = x;
      while (parent[r] !== r) r = parent[r]!;
      while (parent[x] !== r) {
        const nx = parent[x]!;
        parent[x] = r;
        x = nx;
      }
      return r;
    };
    for (const a of atoms) {
      for (const i of a.moved) {
        const ra = find(i);
        const rb = find(a.perm[i]!);
        if (ra !== rb) parent[ra] = rb;
      }
    }
    const roots = new Map<number, number>();
    const out = new Int16Array(N);
    for (let i = 0; i < N; i += 1) {
      const r = find(i);
      if (!roots.has(r)) roots.set(r, roots.size);
      out[i] = roots.get(r)!;
    }
    return out;
  })();
  const orbitCount = Math.max(...orbitIndexOfSite) + 1;
  const orbitSitesList: number[][] = Array.from({ length: orbitCount }, () => []);
  for (let i = 0; i < N; i += 1) orbitSitesList[orbitIndexOfSite[i]!]!.push(i);

  const atomParityVector = (a: Atom): number => {
    let vec = 0;
    const seen = new Set<number>();
    for (const i of a.moved) {
      if (seen.has(i)) continue;
      let len = 0;
      let cur = i;
      do {
        seen.add(cur);
        cur = a.perm[cur]!;
        len += 1;
      } while (cur !== i);
      if (len % 2 === 0) vec ^= 1 << orbitIndexOfSite[i]!;
    }
    return vec;
  };
  const parityGenerators: Array<{ atom: Atom; vec: number }> = [];
  {
    const seenVec = new Set<number>();
    for (const a of atoms) {
      if (a.angle !== 90) continue;
      const vec = atomParityVector(a);
      if (vec === 0 || seenVec.has(vec)) continue;
      seenVec.add(vec);
      parityGenerators.push({ atom: a, vec });
    }
  }

  libraryCache = {
    canonical,
    N,
    sitePositions,
    siteIndexByKey,
    siteClasses,
    classSites,
    atoms,
    atomById,
    frameAtoms,
    posAtoms,
    e2Atoms,
    byPair,
    twisterBySiteRot,
    twisterByPair,
    orbitIndexOfSite,
    orbitCount,
    orbitSitesList,
    parityGenerators,
    buildMs: performance.now() - start,
  };
  emitSolverDebug(solverId, `tool library built in ${Math.round(libraryCache.buildMs)}ms: ${templates.length} pure templates (${cycleTemplates.length} of them 3-cycles), ${seenTwisterProfiles.size} twisters, ${parityGenerators.length} parity generators`);
  return libraryCache;
};

/** Pre-builds the commutator tool library (one-time, ~3s). */
export const warmLevel2SliceReductionSolver = (): void => {
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
  const { N, siteClasses, classSites, byPair, twisterBySiteRot, twisterByPair, frameAtoms, posAtoms, e2Atoms } = lib;
  const pairKey = (a: number, b: number) => a * N + b;

  const st: PState = {
    siteOfPiece: input.siteOfPiece.slice(),
    pieceAtSite: input.pieceAtSite.slice(),
    rotOfPiece: input.rotOfPiece.slice(),
  };
  const moves: Atom[] = [];
  const phaseBreaks: PipelineResult['phaseBreaks'] = [];
  const log: string[] = [];

  const applyAtomToState = (state: PState, a: Atom) => {
    const movedPieces: number[] = [];
    for (const s of a.moved) movedPieces.push(state.pieceAtSite[s]!);
    for (let k = 0; k < a.moved.length; k += 1) {
      const p = movedPieces[k]!;
      state.siteOfPiece[p] = a.perm[a.moved[k]!]!;
      state.rotOfPiece[p] = rotMul[a.rot]![state.rotOfPiece[p]!]!;
    }
    for (const p of movedPieces) state.pieceAtSite[state.siteOfPiece[p]!] = p;
  };
  const applyWordToState = (state: PState, w: Atom[]) => {
    for (const a of w) applyAtomToState(state, a);
  };
  const emit = (w: Atom[]) => {
    applyWordToState(st, w);
    moves.push(...w);
  };
  const cloneState = (state: PState): PState => ({
    siteOfPiece: state.siteOfPiece.slice(),
    pieceAtSite: state.pieceAtSite.slice(),
    rotOfPiece: state.rotOfPiece.slice(),
  });
  const markPhase = (phase: string, observation: string) => {
    const previous = phaseBreaks[phaseBreaks.length - 1]?.moveIndex ?? 0;
    emitSolverDebug(solverId, `phase "${phase}": ${moves.length - previous} atoms (running total ${moves.length})`);
    phaseBreaks.push({ phase, observation, moveIndex: moves.length });
  };

  const tracePiece = (site: number, rot: number, w: Atom[]): [number, number] => {
    let s = site;
    let r = rot;
    for (const a of w) {
      if (a.affected[s]) {
        r = rotMul[a.rot]![r]!;
        s = a.perm[s]!;
      }
    }
    return [s, r];
  };
  const inverseAtom = (a: Atom): Atom => {
    const inverseAngle: TwistAngle = a.angle === 180 ? 180 : a.angle === 90 ? -90 : 90;
    return lib.atomById.get(`${a.kind === 'frame' ? 'f' : 'e'}:${a.refId}:${inverseAngle}`)!;
  };
  const inverseWord = (word: Atom[]): Atom[] => [...word].reverse().map(inverseAtom);
  const preimageUnder = (word: Atom[], t: number): number => {
    let s = t;
    for (let i = word.length - 1; i >= 0; i -= 1) {
      const inv = inverseAtom(word[i]!);
      if (inv.affected[s]) s = inv.perm[s]!;
    }
    return s;
  };

  const posProtected = new Uint8Array(N);
  const rotProtected = new Uint8Array(N);
  const protectedOk = (word: Atom[]): PState | null => {
    const trial = cloneState(st);
    applyWordToState(trial, word);
    for (let i = 0; i < N; i += 1) {
      if (posProtected[i] && trial.pieceAtSite[i] !== st.pieceAtSite[i]) return null;
      if (rotProtected[i] && (trial.pieceAtSite[i] !== i || trial.rotOfPiece[i] !== st.rotOfPiece[i]!)) return null;
    }
    return trial;
  };

  // --- conjugated 3-cycle placement: BFS over ordered pairs of class sites ---
  //
  // A 3-cycle moves three cells, so a placement that only aims the first of
  // them wastes two thirds of the tool. The third site is not free to choose
  // outright, but it can be *asked for*: send the cell now sitting on the
  // target to its own home, and one tool lands two cells (three when the
  // permutation's cycle happens to close). Since a tool costs ~22 atoms and one
  // extra BFS level costs 2, it pays to look a few levels deeper for a
  // two-cell placement before settling for a one-cell one.
  //
  // Ranking keeps exact orientation ahead of cell count, so this never trades
  // away the orientation-first property that keeps the twist phase cheap.
  const pairPlacementExtraDepth = 2;

  // Exact orientation of the primary cell outranks everything (it is what keeps
  // the twist phase cheap), then the number of cells the tool lands, then how
  // many of those land already oriented.
  interface Placement { word: Atom[]; perfect: boolean; solved: number; landedOriented: number }
  const placementRank = (p: Placement): number =>
    (p.perfect ? 1000 : 0) + p.solved * 10 + p.landedOriented;

  /** A tool this wide is worth taking immediately rather than searching on. */
  const excellentPlacement = 3;

  const findPlacement = (
    x: number,
    s: number,
    pieceRot: number,
    setupAlphabet: Atom[],
    maxDepth: number,
  ): Placement | null => {
    const startKey = pairKey(x, s);
    const visited = new Map<number, { parent: number; atom: Atom | null }>();
    visited.set(startKey, { parent: -1, atom: null });
    let frontier: number[] = [startKey];
    // Held in an object so the `offer` closure below can update it.
    const found: { best: Placement | null } = { best: null };
    let deadline = maxDepth;
    const reconstructSetup = (key: number): Atom[] => {
      const out: Atom[] = [];
      let k = key;
      while (true) {
        const node = visited.get(k)!;
        if (node.atom === null) break;
        out.push(node.atom);
        k = node.parent;
      }
      return out.reverse();
    };
    for (let depth = 0; depth <= maxDepth && depth <= deadline; depth += 1) {
      for (const key of frontier) {
        const list = byPair.get(key);
        if (!list) continue;
        const setup = reconstructSetup(key);
        const invSetup = inverseWord(setup);

        // Score a template by what it actually does to the current state: every
        // cell it carries home counts, not just the one being aimed at. This is
        // what lets a 5-cycle or a double 3-cycle earn its keep over a 3-cycle
        // of the same length.
        const consider = (t: Template): Placement | null => {
          let solved = 0;
          let aimed = false;
          for (let k = 0; k < t.src.length; k += 1) {
            const from = preimageUnder(setup, t.src[k]!);
            const to = preimageUnder(setup, t.dst[k]!);
            if (posProtected[from] && to !== from) return null;
            if (from === x && to === s) aimed = true;
            if (st.pieceAtSite[from] === to) solved += 1;
          }
          if (!aimed) return null;
          const word = [...setup, ...t.word, ...invSetup];
          const [endSite, endRot] = tracePiece(x, pieceRot, word);
          if (endSite !== s) return null;
          const perfect = endRot === ROT_ID;
          // Orientation bookkeeping costs a trace per moved cell, so skip it
          // for candidates that cannot win even with a perfect one.
          const incumbent = found.best;
          const ceiling = (perfect ? 1000 : 0) + solved * 10 + t.src.length;
          if (incumbent && ceiling < placementRank(incumbent)) return null;
          let landedOriented = 0;
          if (solved > 1) {
            for (let k = 0; k < t.src.length; k += 1) {
              const from = preimageUnder(setup, t.src[k]!);
              const piece = st.pieceAtSite[from]!;
              const [site, rot] = tracePiece(from, st.rotOfPiece[piece]!, word);
              if (site === piece && rot === ROT_ID) landedOriented += 1;
            }
          }
          return { word, perfect, solved, landedOriented };
        };
        const offer = (candidate: Placement | null): boolean => {
          if (!candidate) return false;
          const incumbent = found.best;
          const beats =
            !incumbent ||
            placementRank(candidate) > placementRank(incumbent) ||
            (placementRank(candidate) === placementRank(incumbent) && candidate.word.length < incumbent.word.length);
          if (beats) found.best = candidate;
          return candidate.perfect && candidate.solved >= excellentPlacement;
        };

        for (const t of list) {
          if (offer(consider(t))) return found.best;
        }
      }
      // Once some placement exists, spend only a couple more levels looking for
      // a wider one — beyond that the setup costs more than the tool it saves.
      if (found.best?.perfect && deadline === maxDepth) deadline = Math.min(maxDepth, depth + pairPlacementExtraDepth);
      if (depth === maxDepth) break;
      const next: number[] = [];
      for (const key of frontier) {
        const a0 = Math.floor(key / N);
        const b0 = key % N;
        for (const atom of setupAlphabet) {
          const a1 = atom.perm[a0]!;
          const b1 = atom.perm[b0]!;
          if (a1 === a0 && b1 === b0) continue;
          const nkey = pairKey(a1, b1);
          if (visited.has(nkey)) continue;
          visited.set(nkey, { parent: key, atom });
          next.push(nkey);
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }
    return found.best;
  };

  // --- conjugated twist application: BFS over (site, accumulated rotation) ---
  const findTwistFix = (
    s: number,
    need: number,
    setupAlphabet: Atom[],
    maxDepth: number,
    validate: (word: Atom[]) => boolean,
  ): Atom[] | null => {
    const visited = new Map<number, { parent: number; atom: Atom | null }>();
    const start = s * 24 + ROT_ID;
    visited.set(start, { parent: -1, atom: null });
    let frontier: number[] = [start];
    const reconstructSetup = (key: number): Atom[] => {
      const out: Atom[] = [];
      let k = key;
      while (true) {
        const node = visited.get(k)!;
        if (node.atom === null) break;
        out.push(node.atom);
        k = node.parent;
      }
      return out.reverse();
    };
    for (let depth = 0; depth <= maxDepth; depth += 1) {
      for (const key of frontier) {
        const t = Math.floor(key / 24);
        const rho = key % 24;
        const w = rotMul[rotMul[rho]![need]!]![rotInv[rho]!]!;
        const list = twisterBySiteRot.get(t * 24 + w);
        if (!list) continue;
        const setup = reconstructSetup(key);
        const invSetup = inverseWord(setup);
        for (const tw of list) {
          const word = [...setup, ...tw.word, ...invSetup];
          if (validate(word)) return word;
        }
      }
      if (depth === maxDepth) break;
      const next: number[] = [];
      for (const key of frontier) {
        const site = Math.floor(key / 24);
        const rho = key % 24;
        for (const atom of setupAlphabet) {
          if (!atom.affected[site]) continue;
          const nkey = atom.perm[site]! * 24 + rotMul[atom.rot]![rho]!;
          if (visited.has(nkey)) continue;
          visited.set(nkey, { parent: key, atom });
          next.push(nkey);
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }
    return null;
  };

  const findPairTwistFix = (
    s: number,
    residueS: number,
    q: number,
    residueQ: number,
    setupAlphabet: Atom[],
    maxNodes: number,
    potentialAt: (site: number, rot: number) => number,
    validate: (word: Atom[]) => boolean,
  ): Atom[] | null => {
    const basePotential = potentialAt(s, residueS) + potentialAt(q, residueQ);
    const stateKeyOf = (a: number, ra: number, b: number, rb: number) => ((a * 24 + ra) * N + b) * 24 + rb;
    const visited = new Map<number, { parent: number; atom: Atom | null }>();
    const start = stateKeyOf(s, ROT_ID, q, ROT_ID);
    visited.set(start, { parent: -1, atom: null });
    let frontier: number[] = [start];
    const reconstructSetup = (key: number): Atom[] => {
      const out: Atom[] = [];
      let k = key;
      while (true) {
        const node = visited.get(k)!;
        if (node.atom === null) break;
        out.push(node.atom);
        k = node.parent;
      }
      return out.reverse();
    };
    while (frontier.length > 0 && visited.size < maxNodes) {
      for (const key of frontier) {
        let rest = key;
        const rb = rest % 24;
        rest = (rest - rb) / 24;
        const b = rest % N;
        rest = (rest - b) / N;
        const ra = rest % 24;
        const a = (rest - ra) / 24;
        const list = twisterByPair.get(pairKey(a, b));
        if (!list) continue;
        for (const entry of list) {
          const newS = rotMul[rotMul[rotInv[ra]!]![rotMul[entry.wa]![ra]!]!]![residueS]!;
          const newQ = rotMul[rotMul[rotInv[rb]!]![rotMul[entry.wb]![rb]!]!]![residueQ]!;
          if (potentialAt(s, newS) + potentialAt(q, newQ) >= basePotential) continue;
          const setup = reconstructSetup(key);
          const word = [...setup, ...entry.tw.word, ...inverseWord(setup)];
          if (validate(word)) return word;
        }
      }
      const next: number[] = [];
      for (const key of frontier) {
        if (visited.size >= maxNodes) break;
        let rest = key;
        const rb = rest % 24;
        rest = (rest - rb) / 24;
        const b = rest % N;
        rest = (rest - b) / N;
        const ra = rest % 24;
        const a = (rest - ra) / 24;
        for (const atom of setupAlphabet) {
          const affA = atom.affected[a] === 1;
          const affB = atom.affected[b] === 1;
          if (!affA && !affB) continue;
          const nkey = stateKeyOf(
            affA ? atom.perm[a]! : a,
            affA ? rotMul[atom.rot]![ra]! : ra,
            affB ? atom.perm[b]! : b,
            affB ? rotMul[atom.rot]![rb]! : rb,
          );
          if (visited.has(nkey)) continue;
          visited.set(nkey, { parent: key, atom });
          next.push(nkey);
        }
      }
      frontier = next;
    }
    return null;
  };

  // --- phases ---
  const orbitSign = (state: PState, orbit: number): 0 | 1 => {
    const sites = lib.orbitSitesList[orbit]!;
    const visited = new Set<number>();
    let odd = 0;
    for (const startSite of sites) {
      if (visited.has(startSite)) continue;
      let len = 0;
      let cur = startSite;
      do {
        visited.add(cur);
        cur = state.siteOfPiece[cur]!;
        len += 1;
      } while (cur !== startSite);
      if (len % 2 === 0) odd ^= 1;
    }
    return odd as 0 | 1;
  };

  const solveParity = (target: number): Atom[] | null => {
    if (target === 0) return [];
    const basis: Array<{ vec: number; combo: Set<number> }> = [];
    const reduce = (vecIn: number, comboIn: Set<number>): { vec: number; combo: Set<number> } => {
      let vec = vecIn;
      const combo = new Set(comboIn);
      for (const b of basis) {
        const high = 31 - Math.clz32(b.vec);
        if ((vec >> high) & 1) {
          vec ^= b.vec;
          for (const gi of b.combo) {
            if (combo.has(gi)) combo.delete(gi);
            else combo.add(gi);
          }
        }
      }
      return { vec, combo };
    };
    for (let gi = 0; gi < lib.parityGenerators.length; gi += 1) {
      const r = reduce(lib.parityGenerators[gi]!.vec, new Set([gi]));
      if (r.vec !== 0) {
        basis.push(r);
        basis.sort((p, q) => q.vec - p.vec);
      }
    }
    const r = reduce(target, new Set());
    if (r.vec !== 0) return null;
    return [...r.combo].map((gi) => lib.parityGenerators[gi]!.atom);
  };

  const positionPhase = (cls: PieceClass, setupAlphabet: Atom[], maxDepth: number): boolean => {
    const sites = classSites.get(cls)!;
    let tools = 0;
    let cellsLanded = 0;
    const trySolveSite = (s: number): boolean => {
      const x = st.siteOfPiece[s]!;
      const placement = findPlacement(x, s, st.rotOfPiece[s]!, setupAlphabet, maxDepth);
      if (!placement) return false;
      if (!protectedOk(placement.word)) return false;
      emit(placement.word);
      posProtected[s] = 1;
      tools += 1;
      cellsLanded += placement.solved;
      return true;
    };
    let attempts = 0;
    let sacrificeRotation = 0;
    while (true) {
      const unsolved = sites.filter((s) => st.siteOfPiece[s] !== s);
      if (unsolved.length === 0) break;
      attempts += 1;
      if (attempts > sites.length * 4) {
        log.push(`${cls}: placement attempt budget exhausted with ${unsolved.length} cells left`);
        return false;
      }
      for (const s of sites) posProtected[s] = st.pieceAtSite[s] === s ? 1 : 0;
      const s = unsolved[0]!;
      if (trySolveSite(s)) continue;
      // deadlock: sacrifice one solved cell of this class to change the aux-triple configuration
      const solvedSites = sites.filter((w) => w !== s && st.pieceAtSite[w] === w);
      let escaped = false;
      for (let k = 0; k < solvedSites.length; k += 1) {
        const w = solvedSites[(k + sacrificeRotation) % solvedSites.length]!;
        posProtected[w] = 0;
        if (trySolveSite(s)) {
          escaped = true;
          sacrificeRotation += 1;
          break;
        }
        posProtected[w] = 1;
      }
      if (!escaped) {
        log.push(`${cls}: no conjugated 3-cycle places cell ${s} from ${st.siteOfPiece[s]} even after sacrifices`);
        return false;
      }
    }
    for (const s of sites) posProtected[s] = 1;
    emitSolverDebug(
      solverId,
      `${cls}: ${tools} tool(s) landed ${cellsLanded} cell(s) (${(cellsLanded / Math.max(1, tools)).toFixed(2)} per tool)`,
    );
    return true;
  };

  const orientationPhase = (classes: PieceClass[], setupAlphabet: Atom[], maxDepth: number, label: string): boolean => {
    const sites = classes.flatMap((c) => classSites.get(c)!);
    const e2FixerFor = (s: number, rot: number): Atom | undefined =>
      e2Atoms.find((a) => a.affected[s] && a.moved.length === 1 && rotMul[a.rot]![rot]! === ROT_ID);
    const potentialOf = (s: number, rot: number): number => {
      if (rot === ROT_ID) return 0;
      return e2FixerFor(s, rot) ? 1 : 2;
    };
    const totalPotential = (state: PState): number => {
      let sum = 0;
      for (const s of sites) sum += potentialOf(s, state.rotOfPiece[s]!);
      return sum;
    };
    let guard = 0;
    while (true) {
      guard += 1;
      if (guard > 400) {
        log.push(`${label}: twist descent exceeded its iteration guard`);
        return false;
      }
      for (const s of sites) {
        if (st.rotOfPiece[s] === ROT_ID) continue;
        const direct = e2FixerFor(s, st.rotOfPiece[s]!);
        if (direct) emit([direct]);
      }
      const dirty = sites.filter((s) => st.rotOfPiece[s] !== ROT_ID);
      if (dirty.length === 0) break;
      const before = totalPotential(st);
      const decreasing = (word: Atom[]): boolean => {
        const trial = protectedOk(word);
        if (!trial) return false;
        for (const w of sites) if (trial.pieceAtSite[w] !== w) return false;
        return totalPotential(trial) < before;
      };
      let fix: Atom[] | null = null;
      for (const s of dirty) {
        const r = st.rotOfPiece[s]!;
        const targets: number[] = [ROT_ID];
        for (const a of e2Atoms) {
          if (!a.affected[s] || a.moved.length !== 1) continue;
          const rho = rotInv[a.rot]!;
          if (rho !== r && !targets.includes(rho)) targets.push(rho);
        }
        for (const target of targets) {
          const need = rotMul[target]![rotInv[r]!]!;
          fix = findTwistFix(s, need, setupAlphabet, maxDepth, decreasing);
          if (fix) break;
        }
        if (fix) break;
        for (const q of dirty) {
          if (q === s || siteClasses[q] !== siteClasses[s]) continue;
          fix = findPairTwistFix(s, st.rotOfPiece[s]!, q, st.rotOfPiece[q]!, setupAlphabet, 400000, potentialOf, decreasing);
          if (fix) break;
        }
        if (fix) break;
      }
      if (!fix) {
        log.push(
          `${label}: no potential-decreasing twist application exists for ` +
          `[${dirty.map((q) => `${q}:${siteClasses[q]}#${st.rotOfPiece[q]}`).join(' ')}]`,
        );
        return false;
      }
      emit(fix);
    }
    for (const s of sites) rotProtected[s] = 1;
    return true;
  };

  const fail = (note: string): PipelineResult => ({ ok: false, atoms: moves, note: [note, ...log].join(' | '), phaseBreaks });

  // 0: orbit parity normalization
  {
    let target = 0;
    for (let o = 0; o < lib.orbitCount; o += 1) if (orbitSign(st, o)) target |= 1 << o;
    const fixers = solveParity(target);
    if (!fixers) return fail('orbit parity vector lies outside the reachable span — the state is not reachable by legal moves');
    if (fixers.length > 0) emit(fixers);
    for (let o = 0; o < lib.orbitCount; o += 1) {
      if (orbitSign(st, o)) return fail('internal error: parity normalization left an odd orbit');
    }
    markPhase(
      'orbit parity normalization',
      fixers.length === 0
        ? 'All 11 piece-orbit permutation parities are already even.'
        : `Applied ${fixers.length} quarter turn(s) solving the F2 parity system; every orbit permutation is now even.`,
    );
  }
  // 1-2: corner-region placement
  if (!positionPhase('CC', frameAtoms, 8)) return fail('corner-block corner-cell placement failed');
  markPhase('CC placement', 'All 64 corner-block corner cells are home (placements chosen orientation-first).');
  if (!positionPhase('CE', frameAtoms, 8)) return fail('corner-block edge-cell placement failed');
  markPhase('CE placement', 'All 96 corner-block edge cells are home.');
  // 3: CC orientation (corner twisters may disturb edge regions; edge phases follow)
  if (!orientationPhase(['CC'], frameAtoms, 6, 'CC orientation')) return fail('corner-block corner-cell orientation failed');
  markPhase('CC orientation', 'Corner-block corner cells exactly oriented (twist commutators).');
  // 4-6: edge-region placement
  if (!positionPhase('EC', posAtoms, 8)) return fail('edge-block corner-cell placement failed');
  for (const s of classSites.get('EC')!) {
    if (st.rotOfPiece[s] !== ROT_ID) return fail('internal error: EC cell twisted although EC orientation is position-determined');
  }
  markPhase('EC placement', 'All 96 edge-block corner cells are home — their orientation is forced by position.');
  if (!positionPhase('EEa', posAtoms, 8)) return fail('aligned edge-cell placement failed');
  markPhase('EEa placement', 'All 48 axis-aligned edge-block edge cells are home.');
  if (!positionPhase('EEo', posAtoms, 8)) return fail('oblique edge-cell placement failed');
  markPhase('EEo placement', 'All 96 oblique edge-block edge cells are home.');
  // 7: remaining orientation
  if (!orientationPhase(['CE', 'EEa', 'EEo'], posAtoms, 6, 'edge orientation')) return fail('cell orientation normalization failed');
  markPhase('orientation normalization', 'Every remaining twist removed via E2 rolls and twist commutators (potential descent).');

  for (let i = 0; i < N; i += 1) {
    if (st.siteOfPiece[i] !== i || st.rotOfPiece[i] !== ROT_ID) return fail(`internal error: final integer state not solved at site ${i}`);
  }
  return { ok: true, atoms: moves, note: 'solved', phaseBreaks };
};

// ---------- peephole: merge adjacent turns of the same target ----------

const mergeAdjacentAtoms = (lib: Library, input: Atom[]): Atom[] => {
  const angleOf = (a: Atom): number => (a.angle === -90 ? 270 : a.angle);
  const atomFor = (sample: Atom, angle: number): Atom | null => {
    if (angle === 0) return null;
    const canonical: TwistAngle = angle === 270 ? -90 : (angle as TwistAngle);
    return lib.atomById.get(`${sample.kind === 'frame' ? 'f' : 'e'}:${sample.refId}:${canonical}`)!;
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

// ---------- SolverAlgorithm ----------

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
  const move = createExtensionMove(target, atom.angle);
  return {
    targetKind: 'extension',
    targetId: target.id,
    extensionTargetId: target.id,
    angle: atom.angle,
    notation: move.notation,
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
    objective: 'Build a solve plan from the current 400-cell state without reading move history.',
    observation: progressSummary(inputProgress),
    progress: inputProgress,
  }];

  const failure = (finalStrategy: string, notes: string): SolverRunResult => ({
    name: solverName,
    version: solverVersion,
    level_supported: [2],
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

  if (puzzle.level !== 2) {
    return failure('Level 2 only.', 'This solver currently supports Level 2 only.');
  }

  // Fast path: block-rigid states get the short block-quotient solution.
  emitSolverDebug(solverId, 'solve: trying block-quotient fast path');
  const fastPath = await level2BlockQuotientAlgorithm.solve(model, puzzle);
  if (fastPath.success) {
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
        'The state was block-rigid, so it was delegated to the block-quotient pipeline (macro Level 1 solve plus cell rolls); ' +
        'the slice-reduction phases were not needed.',
      complexity_estimate: primaryComplexityEstimate,
      notes: `Fast path: ${fastPath.notes}`,
    };
  }
  explanation.push({
    phase: 'fast path check',
    objective: 'Detect block-rigid states solvable by the short block-quotient pipeline.',
    observation: 'The state is outside the block-rigid class (single-layer slices or slab twists tore blocks apart); running slice reduction.',
    progress: inputProgress,
  });

  const lib = buildLibrary();

  // Map the incoming cubies onto the integer state.
  const N = lib.N;
  const st: PState = {
    siteOfPiece: new Int16Array(N),
    pieceAtSite: new Int16Array(N),
    rotOfPiece: new Uint8Array(N),
  };
  for (const cubie of puzzle.cubies) {
    const piece = lib.siteIndexByKey.get(posKey(cubie.homePosition as Vector3Tuple));
    const site = lib.siteIndexByKey.get(posKey(cubie.currentPosition as Vector3Tuple));
    const rot = quaternionRotIndex(cubie.orientation);
    if (piece === undefined || site === undefined || rot === undefined) {
      return failure(
        'State mapping failed.',
        `Cell ${cubie.id} does not map onto the canonical Level 2 site/rotation grid (position ${cubie.currentPosition}, non-grid orientation).`,
      );
    }
    st.siteOfPiece[piece] = site;
    st.pieceAtSite[site] = piece;
    st.rotOfPiece[piece] = rot;
  }

  emitSolverDebug(solverId, 'solve: running slice-reduction pipeline');
  const pipeline = runPipeline(lib, st);
  if (!pipeline.ok) {
    explanation.push({
      phase: 'slice reduction',
      objective: 'Place and orient all 400 cells class by class with commutator tools.',
      observation: pipeline.note,
      progress: inputProgress,
    });
    return failure('Slice reduction failed.', pipeline.note);
  }

  const optimized = mergeAdjacentAtoms(lib, pipeline.atoms);

  // Replay on the real cubies phase by phase for verified progress reporting.
  // Phase boundaries refer to indices in the unoptimized atom list, so replay that
  // one for explanations, then verify the optimized list separately.
  let cubies = cloneCubies(puzzle.cubies);
  let cursor = 0;
  for (const phase of pipeline.phaseBreaks) {
    for (; cursor < phase.moveIndex; cursor += 1) {
      const move = atomToSolverMove(lib, pipeline.atoms[cursor]!, phase.phase);
      cubies = applySolverMoveToCubies(cubies, move, puzzle);
    }
    explanation.push({
      phase: phase.phase,
      objective: 'Advance the class-by-class reduction while preserving everything already solved.',
      observation: phase.observation,
      progress: progressForCubies(cubies),
    });
  }

  const outputMoves: SolverMove[] = optimized.map((atom) => atomToSolverMove(lib, atom, 'slice-reduction commutator plan'));
  let verifyCubies = cloneCubies(puzzle.cubies);
  for (const move of outputMoves) verifyCubies = applySolverMoveToCubies(verifyCubies, move, puzzle);
  const finalProgress = progressForCubies(verifyCubies);
  const solved = isExactlySolved(verifyCubies);
  explanation.push({
    phase: 'final verification',
    objective: 'Replay the full move list on the real 400-cell state and require an exact solve.',
    observation: progressSummary(finalProgress),
    progress: finalProgress,
  });
  emitSolverDebug(
    solverId,
    `solve: finished in ${Math.round(performance.now() - start)}ms — success=${solved}, moves=${outputMoves.length} (raw ${pipeline.atoms.length})`,
  );
  if (!solved) {
    return failure('Final verification failed.', 'Replaying the generated moves did not exactly solve the real state.');
  }

  return {
    name: solverName,
    version: solverVersion,
    level_supported: [2],
    input_state: inputState,
    output_moves: outputMoves,
    runtime_ms: performance.now() - start,
    move_count: outputMoves.length,
    success: true,
    explanation,
    final_strategy:
      'Normalize the 11 piece-orbit parities with an F2 linear system, place corner-block cells (CC, CE) with conjugated ' +
      'slice-commutator 3-cycles, orient corner cells with twist commutators, place edge-block cells (EC, EEa, EEo) with ' +
      '[slice, block-extension]-derived 3-cycles that provably never touch corner regions, then remove residual twists ' +
      'with E2 rolls and twist commutators by strict potential descent.',
    complexity_estimate: primaryComplexityEstimate,
    notes: 'Level 2 solved by class-by-class commutator reduction (full slice generator set supported).',
  };
};

// ---------- scramble generator set ----------

const repeatPool = <T>(pool: T[], times: number): T[] => Array.from({ length: times }).flatMap(() => pool);

const solverMovesForTargets = (
  state: MengerPuzzleState,
  predicate: (target: TurnTarget) => boolean,
): SolverMove[] =>
  state.turnTargets
    .filter((target) => target.kind === 'extension' && predicate(target))
    .flatMap((target) =>
      twistAngles.map((angle) => ({
        targetKind: 'extension' as const,
        targetId: target.id,
        extensionTargetId: target.id,
        angle,
        notation: createExtensionMove(target, angle).notation,
        reason: '',
      })),
    );

/**
 * The full Level 2 generator set: scale-1 slices, scale-3 block layers, depth-1
 * block extensions, depth-1.5 slab twists and depth-2 cell rolls. Weighted so
 * scrambles are dominated by cell-transporting moves.
 */
const scrambleMovePool = (
  _model: PuzzleModel<MengerPuzzleState, SolverMove>,
  state: MengerPuzzleState,
): SolverMove[] => {
  const frameMoves = (scale: number): SolverMove[] =>
    state.frames
      .filter((frame) => frame.scale === scale)
      .flatMap((frame) =>
        twistAngles.map((angle) => ({
          targetKind: 'frame' as const,
          targetId: `frame:${frame.id}`,
          frameId: frame.id,
          angle,
          notation: createMove(frame.id, angle, state.frameById).notation,
          reason: '',
        })),
      );
  const sliceMoves = frameMoves(1);
  const blockLayerMoves = frameMoves(3);
  const blockExtensionMoves = solverMovesForTargets(state, (target) => target.depth === 1);
  const slabMoves = solverMovesForTargets(state, (target) => target.depth === 1.5);
  const cellRollMoves = solverMovesForTargets(state, (target) => target.depth === 2 && target.scale === 1);

  // ~45% slices / ~15% block layers / ~10% block extensions / ~15% slabs / ~15% cell rolls
  return [
    ...repeatPool(sliceMoves, 12),
    ...repeatPool(blockLayerMoves, 12),
    ...repeatPool(blockExtensionMoves, 6),
    ...repeatPool(slabMoves, 3),
    ...cellRollMoves,
  ];
};

export const level2SliceReductionAlgorithm: SolverAlgorithm<MengerPuzzleState, SolverMove> = {
  id: solverId,
  name: solverName,
  version: solverVersion,
  levelsSupported: [2],
  solve,
  scrambleMovePool,
};

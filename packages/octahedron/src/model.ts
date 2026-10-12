/**
 * The octahedron puzzle (八面体パズル), Levels 0–3, as pure data.
 *
 * Ported from the four standalone pages in which it was first written. The
 * pages kept their state inside three.js meshes; here the same state is a
 * rotation index per piece, which is exactly what the pages' solvers read back
 * out of the meshes. Geometry, turn regions, scramble rules and the solved test
 * follow the pages line for line; the comments name the page code they mirror.
 *
 * A piece never translates on its own: every turn is a rotation about an axis
 * through the origin, so a piece's current slot is `ROT[r] · home`.
 */
import { level1Solver } from './solvers/level1Solver';

export type Vec3 = [number, number, number];
export type OctaLevel = 0 | 1 | 2 | 3;
/** 1 = +90° (counter-clockwise seen from the axis tip), -1 = -90°, 2 = 180°. */
export type OctaDir = 1 | -1 | 2;

export interface OctaMove {
  /** Index into {@link octaAxes}. */
  axis: number;
  /** Index into the level's {@link OctaPuzzle.regions}. */
  region: number;
  dir: OctaDir;
}

export interface OctaAxis {
  d: Vec3;
  label: string;
  color: number;
}

/** The six turning axes. Vertex colors follow a 2×2×2 cube's faces. */
export const octaAxes: readonly OctaAxis[] = [
  { d: [1, 0, 0], color: 0xe53935, label: '+X' },
  { d: [-1, 0, 0], color: 0xfb8c00, label: '−X' },
  { d: [0, 1, 0], color: 0x43a047, label: '+Y' },
  { d: [0, -1, 0], color: 0x1e88e5, label: '−Y' },
  { d: [0, 0, 1], color: 0xf4f4f4, label: '+Z' },
  { d: [0, 0, -1], color: 0xfdd835, label: '−Z' },
];
/** Color of the faces that point into the solid. */
export const octaInnerColor = 0x2b2f45;

export interface OctaPiece {
  /** The right-angle corner of the tetrahedron, in puzzle units (the octahedron is |x|+|y|+|z| ≤ 1). */
  origin: Vec3;
  /** Direction (±1) of each of the three legs. */
  legs: Vec3;
  /** Leg length, in puzzle units. */
  leg: number;
  /** Integer slot of the solved piece (a fixed multiple of its centroid). */
  home: Vec3;
}

export interface OctaRegion {
  label: string;
  /** Number of pieces the region holds in the solved state. */
  count: number;
}

export interface OctaPuzzle {
  level: OctaLevel;
  pieces: OctaPiece[];
  /** Turnable regions; the same list applies on every axis. */
  regions: OctaRegion[];
  /** Whether a piece in slot `g` lies in `region` of `axis`. */
  inRegion: (g: Vec3, axis: number, region: number) => boolean;
  /** Moves in a scramble, as on the pages. */
  scrambleLength: number;
  /** Animation lengths (ms) the pages used for a manual turn, a scramble turn and a solution turn. */
  durations: { manual: number; scramble: number; solve: number };
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const absSum = (g: Vec3): number => Math.abs(g[0]) + Math.abs(g[1]) + Math.abs(g[2]);
const signs = [1, -1] as const;

/** The 8 central pieces, in the pages' creation order. */
const centralSigns = (): Vec3[] => {
  const out: Vec3[] = [];
  for (const sx of signs) for (const sy of signs) for (const sz of signs) out.push([sx, sy, sz]);
  return out;
};
/** The 4 leg directions of the pieces under each vertex, in the pages' creation order. */
const vertexSigns = (axis: number): Vec3[] => {
  const d = octaAxes[axis]!.d;
  const k = axis >> 1;
  const out: Vec3[] = [];
  for (const p of signs) {
    for (const q of signs) {
      const s: Vec3 = [0, 0, 0];
      s[k] = d[k]!;
      s[(k + 1) % 3] = p;
      s[(k + 2) % 3] = q;
      out.push(s);
    }
  }
  return out;
};

// ---------- Level 0: 8 pieces, one region per vertex ----------

const level0 = (): OctaPuzzle => ({
  level: 0,
  pieces: centralSigns().map((s) => ({ origin: [0, 0, 0], legs: s, leg: 1, home: s })),
  regions: [{ label: 'Vertex half', count: 4 }],
  // `pieces.filter(p=>p.pos.dot(d)>0.5)`
  inRegion: (g, axis) => dot(g, octaAxes[axis]!.d) > 0.5,
  scrambleLength: 20,
  durations: { manual: 260, scramble: 110, solve: 380 },
});

// ---------- Level 1: 32 pieces, three regions per vertex ----------

const level1 = (): OctaPuzzle => {
  const pieces: OctaPiece[] = centralSigns().map((s) => ({ origin: [0, 0, 0], legs: s, leg: 0.5, home: s }));
  octaAxes.forEach((a, axis) => {
    for (const s of vertexSigns(axis)) {
      const origin = a.d.map((x) => x / 2) as Vec3;
      // g = s + 8 · origin
      pieces.push({ origin, legs: s, leg: 0.5, home: s.map((x, i) => x + 8 * origin[i]!) as Vec3 });
    }
  });
  return {
    level: 1,
    pieces,
    regions: [
      { label: 'Pyramid band', count: 12 },
      { label: 'Center half', count: 4 },
      { label: 'Tip', count: 4 },
    ],
    // `inRegion`: k=0 the square pyramid minus its tip / k=1 half the central octahedron / k=2 the tip
    inRegion: (g, axis, k) => {
      const t = dot(g, octaAxes[axis]!.d);
      return k === 0
        ? t > 0 && t < 4
        : k === 1
          ? t > 0 && Math.max(Math.abs(g[0]), Math.abs(g[1]), Math.abs(g[2])) === 1
          : t > 4;
    },
    scrambleLength: 40,
    durations: { manual: 280, scramble: 90, solve: 70 },
  };
};

// ---------- Levels 2 and 3: Sierpiński refinement, frustum regions ----------

interface Seed { r: Vec3; s: Vec3; L: number }

/** Level 1's 32 pieces with the right-angle corner `r` in units where a Level 1 leg is `L`. */
const level1Seeds = (L: number): Seed[] => {
  const out: Seed[] = centralSigns().map((s) => ({ r: [0, 0, 0], s, L }));
  octaAxes.forEach((a, axis) => {
    for (const s of vertexSigns(axis)) out.push({ r: a.d.map((x) => L * x) as Vec3, s, L });
  });
  return out;
};
/** One Sierpiński step: keep a half-size tetrahedron at each of the four corners. */
const shrink = (list: Seed[]): Seed[] => {
  const out: Seed[] = [];
  for (const pc of list) {
    const h = pc.L / 2;
    out.push({ r: pc.r, s: pc.s, L: h });
    for (let i = 0; i < 3; i += 1) {
      const r = pc.r.slice() as Vec3;
      r[i] += pc.s[i]! * h;
      out.push({ r, s: pc.s, L: h });
    }
  }
  return out;
};

/**
 * Turnable regions: the inside of a one-step square pyramid, or of the frustum
 * between two pyramids with the same apex. With t the coordinate on the axis
 * and n the 1-norm of the rest, the pyramid with apex A and height H is
 * `A-H < t < A, n < A-t`. Empty regions and regions holding exactly the same
 * pieces as an earlier one are dropped.
 */
const inFrustum = (g: Vec3, u: Vec3, [A, Ho, Hi]: Vec3): boolean => {
  const t = dot(g, u);
  const n = absSum(g) - Math.abs(t);
  return t > A - Ho && t < A - Hi && n < A - t;
};
const fractionLabel: Record<number, string> = {
  4: '⅛', 8: '¼', 12: '⅜', 16: '½', 20: '⅝', 24: '¾', 28: '⅞', 32: '1',
};

const frustumLevel = (level: 2 | 3): OctaPuzzle => {
  // Level 2: units of 1/4, g = 16 × centroid. Level 3: units of 1/8, g = 32 × centroid.
  const unit = level === 2 ? 4 : 8;
  const seeds = level === 2 ? shrink(level1Seeds(2)) : shrink(shrink(level1Seeds(4)));
  const pieces: OctaPiece[] = seeds.map(({ r, s, L }) => ({
    origin: r.map((x) => x / unit) as Vec3,
    legs: s,
    leg: L / unit,
    home: r.map((x, i) => 4 * x + s[i]!) as Vec3,
  }));
  const apexes = level === 2 ? [4, 8, 12, 16] : [4, 8, 12, 16, 20, 24, 28, 32];
  const specs: Vec3[] = [];
  const seen = new Set<string>();
  for (const A of apexes) {
    for (let j = 1; j <= A / 4; j += 1) {
      const spec: Vec3 = [A, 4 * j, 4 * (j - 1)];
      const key = pieces.map((p) => (inFrustum(p.home, octaAxes[0]!.d, spec) ? 1 : 0)).join('');
      if (key.indexOf('1') < 0 || seen.has(key)) continue;
      seen.add(key);
      specs.push(spec);
    }
  }
  const regions = specs.map(([A], k) => {
    const layer = specs.slice(0, k + 1).filter((spec) => spec[0] === A).length;
    const count = pieces.filter((p) => inFrustum(p.home, octaAxes[0]!.d, specs[k]!)).length;
    // The apex sits at A/16 (Level 2) or A/32 (Level 3) of the way from the center to the vertex.
    const apex = level === 2 ? fractionLabel[A * 2]! : fractionLabel[A]!;
    return { label: `Apex ${apex} · layer ${layer}`, count };
  });
  return {
    level,
    pieces,
    regions,
    inRegion: (g, axis, k) => inFrustum(g, octaAxes[axis]!.d, specs[k]!),
    scrambleLength: level === 2 ? 60 : 100,
    durations: { manual: 280, scramble: 70, solve: 45 },
  };
};

const cache = new Map<OctaLevel, OctaPuzzle>();
export const octaLevels: readonly OctaLevel[] = [0, 1, 2, 3];
export const createOctaPuzzle = (level: OctaLevel): OctaPuzzle => {
  let puzzle = cache.get(level);
  if (!puzzle) {
    puzzle = level === 0 ? level0() : level === 1 ? level1() : frustumLevel(level);
    cache.set(level, puzzle);
  }
  return puzzle;
};

// ---------- rotations and turns ----------

/** The 24 rotations, row-major 3×3, in the order every page's solver enumerates them. */
export const octaRotations: readonly number[][] = level1Solver.ROT;
const ROTIDX: Map<string, number> = level1Solver.ROTIDX;
const MUL: number[][] = level1Solver.MUL;
export const octaIdentity: number = level1Solver.IDENT;
/** Rotation index of a turn about `axis` by `dir`. */
export const octaTurnRotation = (axis: number, dir: OctaDir): number => level1Solver.qr(axis, dir);
export const octaRotationIndex = (matrix: number[]): number | undefined => ROTIDX.get(matrix.join());

/** A state: the rotation index of every piece. */
export type OctaState = Uint8Array;

export const solvedOctaState = (puzzle: OctaPuzzle): OctaState => new Uint8Array(puzzle.pieces.length).fill(octaIdentity);

export const applyRotation = (rot: number, v: Vec3): Vec3 => {
  const m = octaRotations[rot]!;
  return [
    m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2],
    m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2],
    m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2],
  ];
};

/** Current slot of piece `index`. */
export const octaSlot = (puzzle: OctaPuzzle, state: OctaState, index: number): Vec3 =>
  applyRotation(state[index]!, puzzle.pieces[index]!.home);

/** Indices of the pieces a move turns, in the given state. */
export const octaMovedPieces = (puzzle: OctaPuzzle, state: OctaState, move: Pick<OctaMove, 'axis' | 'region'>): number[] => {
  const out: number[] = [];
  for (let i = 0; i < puzzle.pieces.length; i += 1) {
    if (puzzle.inRegion(octaSlot(puzzle, state, i), move.axis, move.region)) out.push(i);
  }
  return out;
};

export const applyOctaMove = (puzzle: OctaPuzzle, state: OctaState, move: OctaMove): OctaState => {
  const next = Uint8Array.from(state);
  const q = octaTurnRotation(move.axis, move.dir);
  for (const i of octaMovedPieces(puzzle, state, move)) next[i] = MUL[q]![state[i]!]!;
  return next;
};

export const inverseOctaMove = (move: OctaMove): OctaMove => ({ ...move, dir: move.dir === 2 ? 2 : (-move.dir as OctaDir) });

/**
 * Solved up to a rotation of the whole puzzle: every piece wears the same
 * rotation. Two pieces with the same coloring cannot have swapped, because the
 * slots they would occupy have different shapes.
 */
export const isOctaSolved = (state: OctaState): boolean => state.every((r) => r === state[0]);

/** A random scramble following the pages' rule: no two consecutive moves on the same target. */
export const octaScramble = (puzzle: OctaPuzzle, random: () => number = Math.random): OctaMove[] => {
  const dirs: OctaDir[] = [1, -1, 2];
  const out: OctaMove[] = [];
  let last = -1;
  for (let n = 0; n < puzzle.scrambleLength; n += 1) {
    let axis: number;
    let region: number;
    if (puzzle.level === 0) {
      // Level 0 also avoids the opposite vertex: turning it is the same move up to a whole rotation.
      do { axis = Math.floor(random() * 6); } while (axis >> 1 === last >> 1);
      region = 0;
      last = axis;
    } else {
      const count = puzzle.regions.length;
      do {
        axis = Math.floor(random() * 6);
        region = Math.floor(random() * count);
      } while (axis * count + region === last);
      last = axis * count + region;
    }
    out.push({ axis, region, dir: dirs[Math.floor(random() * 3)]! });
  }
  return out;
};

// ---------- piece geometry ----------

export interface OctaPieceGeometry {
  /** Triangle vertices, xyz per vertex. */
  positions: number[];
  /** Per vertex: the index of the axis whose color the face takes, or -1 for an inner face. */
  colorAxes: number[];
  /** Line segment endpoints, xyz per point. */
  edges: number[];
}

/**
 * A small right-angle tetrahedron: corner `origin`, legs of length `leg`
 * along `legs`. The slanted face is split into three, each painted with the
 * color of the vertex its leg points to; the three inner faces are dark.
 */
export const octaPieceGeometry = ({ origin, legs, leg }: OctaPiece): OctaPieceGeometry => {
  const V: Vec3[] = [0, 1, 2].map((i) => {
    const v = origin.slice() as Vec3;
    v[i] += legs[i]! * leg;
    return v;
  });
  const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const C: Vec3 = [0, 1, 2].map((c) => (V[0]![c]! + V[1]![c]! + V[2]![c]!) / 3) as Vec3;
  const positions: number[] = [];
  const colorAxes: number[] = [];
  const tri = (a: Vec3, b: Vec3, c: Vec3, color: number) => {
    for (const v of [a, b, c]) { positions.push(...v); colorAxes.push(color); }
  };
  for (let i = 0; i < 3; i += 1) {
    const j = (i + 1) % 3;
    const k = (i + 2) % 3;
    const color = i * 2 + (legs[i]! > 0 ? 0 : 1);
    tri(V[i]!, mid(V[i]!, V[j]!), C, color);
    tri(V[i]!, C, mid(V[i]!, V[k]!), color);
  }
  for (let i = 0; i < 3; i += 1) tri(origin, V[i]!, V[(i + 1) % 3]!, -1);
  const O = origin;
  const edges = [O, V[0]!, O, V[1]!, O, V[2]!, V[0]!, V[1]!, V[1]!, V[2]!, V[2]!, V[0]!].flat();
  return { positions, colorAxes, edges };
};

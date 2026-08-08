/**
 * A wider search for short pure 3-cycles on the edge classes.
 *
 * Run: `npx tsx research/scratch/l2-short-tools2.ts` from the repo root.
 *
 * After the two-cell placement change, an edge placement costs ~18.5 atoms of
 * which 16 are the template itself — setups are down to ~1.25 atoms a side. So
 * template length is now the whole game. `l2-short-tools.ts` ruled out the two
 * obvious families; this sweeps commutator shapes [A,B] with |A|+|B| <= 4,
 * which covers word lengths 4, 6 and 8.
 *
 * Candidates are pre-filtered by support intersection: [A,B] is the identity
 * wherever A and B do not interact, so a pure 3-cycle needs their supports to
 * meet in very few cells.
 */
import {
  N,
  ROT_ID,
  actionOfWord,
  atomsFor,
  commutatorWord,
  siteClasses,
  type Atom,
} from './sim';

type PieceClass = (typeof siteClasses)[number];

const frameAtoms = atomsFor((a) => a.kind === 'frame');
const blockLocalAtoms = atomsFor((a, t) => a.kind === 'extension' && t !== undefined && (t.depth === 1 || t.depth === 1.5));

interface Word {
  atoms: Atom[];
  support: number[];
  mask: Uint8Array;
}

const makeWord = (atoms: Atom[]): Word => {
  const action = actionOfWord(atoms);
  const support: number[] = [];
  const mask = new Uint8Array(N);
  for (let i = 0; i < N; i += 1) {
    if (action.perm[i] !== i || action.rot[i] !== ROT_ID) {
      support.push(i);
      mask[i] = 1;
    }
  }
  return { atoms, support, mask };
};

const intersectionSize = (a: Word, b: Word): number => {
  const [small, big] = a.support.length <= b.support.length ? [a, b] : [b, a];
  let n = 0;
  for (const site of small.support) if (big.mask[site]) n += 1;
  return n;
};

interface Pure3 { word: Atom[]; cycle: [number, number, number]; cls: PieceClass }

const asPure3Cycle = (word: Atom[]): Pure3 | null => {
  const action = actionOfWord(word);
  const moved: number[] = [];
  for (let i = 0; i < N; i += 1) {
    if (action.perm[i] !== i) {
      moved.push(i);
      if (moved.length > 3) return null;
    } else if (action.rot[i] !== ROT_ID) {
      return null;
    }
  }
  if (moved.length !== 3) return null;
  const [a] = moved as [number, number, number];
  const cls = siteClasses[a]!;
  if (moved.some((s) => siteClasses[s] !== cls)) return null;
  if (action.perm[action.perm[a]!] === a) return null;
  const b = action.perm[a]!;
  return { word, cycle: [a, b, action.perm[b]!], cls };
};

// Candidate A/B words, grouped by atom count.
const wordsOfLength = (base: Atom[], length: number): Word[] => {
  if (length === 1) return base.map((a) => makeWord([a]));
  const out: Word[] = [];
  for (const a of base) {
    for (const b of base) {
      if (a.refId === b.refId) continue; // same target twice is just another angle
      out.push(makeWord([a, b]));
    }
  }
  return out;
};

// |A|=2 and |B|=2 together is ~2.4e8 pairs — out of budget for a scratch sweep,
// and 8 atoms is only as good as the seed-product tools already known. The
// shapes below are the ones that would actually beat 8.
const shapes: Array<{ label: string; a: () => Word[]; b: () => Word[] }> = [
  { label: '[frame, E1/slab]      (4 atoms)', a: () => wordsOfLength(frameAtoms, 1), b: () => wordsOfLength(blockLocalAtoms, 1) },
  { label: '[frame^2, E1/slab]    (6 atoms)', a: () => wordsOfLength(frameAtoms, 2), b: () => wordsOfLength(blockLocalAtoms, 1) },
  { label: '[frame, (E1/slab)^2]  (6 atoms)', a: () => wordsOfLength(frameAtoms, 1), b: () => wordsOfLength(blockLocalAtoms, 2) },
];

const maxIntersection = 6;

for (const shape of shapes) {
  const found: Pure3[] = [];
  const seen = new Set<string>();
  let tested = 0;
  const started = performance.now();
  const aWords = shape.a();
  const bWords = shape.b();
  for (const a of aWords) {
    if (a.support.length === 0) continue;
    for (const b of bWords) {
      if (b.support.length === 0) continue;
      const overlap = intersectionSize(a, b);
      if (overlap === 0 || overlap > maxIntersection) continue;
      tested += 1;
      const pure = asPure3Cycle(commutatorWord(a.atoms, b.atoms));
      if (!pure) continue;
      const profile = `${pure.cls}:${pure.cycle.join(',')}`;
      if (seen.has(profile)) continue;
      seen.add(profile);
      found.push(pure);
    }
  }

  const byClass = new Map<PieceClass, Pure3[]>();
  for (const t of found) {
    const list = byClass.get(t.cls) ?? [];
    list.push(t);
    byClass.set(t.cls, list);
  }
  console.log(
    `${shape.label}: |A|=${aWords.length} |B|=${bWords.length}, ${tested} commutators tested, ` +
      `${found.length} pure 3-cycles (${((performance.now() - started) / 1000).toFixed(1)}s)`,
  );
  for (const [cls, list] of [...byClass].sort(([a], [b]) => a.localeCompare(b))) {
    const pairs = new Set<number>();
    for (const t of list) {
      const [x, y, z] = t.cycle;
      for (const [p, q] of [[x, y], [y, z], [z, x], [y, x], [z, y], [x, z]] as const) pairs.add(p * N + q);
    }
    const sites = new Set(list.flatMap((t) => t.cycle));
    const reachable = sites.size * (sites.size - 1);
    console.log(
      `    ${cls}: ${list.length} tools, ${pairs.size}/${reachable} ordered pairs over ${sites.size} sites ` +
        `(${((100 * pairs.size) / reachable).toFixed(0)}% direct coverage)`,
    );
  }
}

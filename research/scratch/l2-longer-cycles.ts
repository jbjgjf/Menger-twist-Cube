/**
 * Would longer cycles beat 3-cycles for the edge classes?
 *
 * Run: `npx tsx research/scratch/l2-longer-cycles.ts` from the repo root.
 *
 * A k-cycle lands k-1 cells, so solving n cells in c cycles needs
 * (n - c)/(k - 1) tools. But move count is tools x word length, so the metric
 * that matters is *atoms per cell landed*. The production edge tool is a
 * 16-atom pure 3-cycle: 8 atoms/cell. A 5-cycle or a double 3-cycle at the same
 * 16 atoms would be 4 atoms/cell — half.
 *
 * Note 4-cycles are odd permutations and every commutator is even, so no word
 * built this way can produce one. That is asserted below rather than assumed.
 *
 * This classifies every pure (rotation-free, single-class) permutation the
 * interchange construction throws off, not just the support-3 ones the
 * production library keeps.
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

interface Seed { atoms: Atom[]; support: number[] }
const seeds: Seed[] = [];
{
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
}
console.log(`small-support seeds: ${seeds.length}`);

/** Cycle structure of a word, if it is pure: no rotation residue, one class. */
interface Pure {
  cls: PieceClass;
  cycles: number[][];
  moved: number;
  /** transpositions the permutation is worth = sum over cycles of (len - 1) */
  transpositions: number;
}

const classifyPure = (word: Atom[], maxMoved: number): Pure | null => {
  const action = actionOfWord(word);
  const moved: number[] = [];
  for (let i = 0; i < N; i += 1) {
    if (action.perm[i] !== i) {
      moved.push(i);
      if (moved.length > maxMoved) return null;
    } else if (action.rot[i] !== ROT_ID) {
      return null; // a stationary cell left twisted is not usable as a pure tool
    }
  }
  if (moved.length === 0) return null;
  const cls = siteClasses[moved[0]!]!;
  if (moved.some((s) => siteClasses[s] !== cls)) return null;
  // Cells that move may carry a rotation — the template records it and the
  // placement search traces it. Only a *stationary* cell left twisted
  // disqualifies the word, which the loop above already rejects.

  const seen = new Set<number>();
  const cycles: number[][] = [];
  for (const start of moved) {
    if (seen.has(start)) continue;
    const cycle: number[] = [];
    let cur = start;
    do {
      seen.add(cur);
      cycle.push(cur);
      cur = action.perm[cur]!;
    } while (cur !== start);
    cycles.push(cycle);
  }
  return {
    cls,
    cycles,
    moved: moved.length,
    transpositions: cycles.reduce((sum, c) => sum + c.length - 1, 0),
  };
};

const siteToSeeds = new Map<number, number[]>();
seeds.forEach((seed, index) => {
  for (const site of seed.support) {
    const list = siteToSeeds.get(site) ?? [];
    list.push(index);
    siteToSeeds.set(site, list);
  }
});

// shape signature, e.g. "3" (a 3-cycle), "5", "3+3" (two disjoint 3-cycles)
const shapeOf = (p: Pure): string => p.cycles.map((c) => c.length).sort((a, b) => b - a).join('+');

interface Bucket { count: number; sites: Set<number>; example: string }
const buckets = new Map<string, Bucket>();
const record = (p: Pure, wordLength: number) => {
  const key = `${p.cls} ${shapeOf(p)} @${wordLength}`;
  const bucket = buckets.get(key) ?? { count: 0, sites: new Set<number>(), example: '' };
  bucket.count += 1;
  for (const cycle of p.cycles) for (const s of cycle) bucket.sites.add(s);
  buckets.set(key, bucket);
};

const started = performance.now();
let tested = 0;
for (let i = 0; i < seeds.length; i += 1) {
  const w1 = seeds[i]!;
  const partners = new Set<number>();
  for (const site of w1.support) for (const j of siteToSeeds.get(site) ?? []) if (j > i) partners.add(j);
  for (const j of partners) {
    const w2 = seeds[j]!;
    tested += 1;
    const pure = classifyPure(commutatorWord(w1.atoms, w2.atoms), 8);
    if (pure) record(pure, 16);
  }
}
console.log(`interchange words tested: ${tested} (${((performance.now() - started) / 1000).toFixed(1)}s)\n`);

const rows = [...buckets.entries()]
  .map(([key, bucket]) => {
    const [cls, shape, at] = key.split(' ');
    const wordLength = Number(at!.slice(1));
    const cycles = shape!.split('+').map(Number);
    const landed = cycles.reduce((sum, len) => sum + len - 1, 0);
    return {
      cls: cls!,
      shape: shape!,
      wordLength,
      landed,
      perCell: wordLength / landed,
      count: bucket.count,
      sites: bucket.sites.size,
    };
  })
  .sort((a, b) => a.cls.localeCompare(b.cls) || a.perCell - b.perCell);

console.log('class  shape   atoms  cells landed  atoms/cell  tools   sites');
for (const r of rows) {
  console.log(
    `${r.cls.padEnd(6)} ${r.shape.padEnd(7)} ${String(r.wordLength).padStart(5)} ` +
      `${String(r.landed).padStart(13)} ${r.perCell.toFixed(2).padStart(11)} ` +
      `${String(r.count).padStart(6)} ${String(r.sites).padStart(7)}`,
  );
}

// Parity check: a k-cycle is worth k-1 transpositions, so a shape is an odd
// permutation iff sum(len - 1) is odd. Every commutator is even, so no odd
// shape may appear — a lone 4-cycle is impossible, while 4+4 is fine.
const oddShapes = rows.filter((r) => r.landed % 2 === 1);
const loneEvenCycles = rows.filter((r) => r.shape.split('+').length === 1 && Number(r.shape) % 2 === 0);
console.log(`\nodd-permutation shapes: ${oddShapes.length} (must be 0 — every commutator is even)`);
console.log(`lone even-length cycles (e.g. a bare 4-cycle): ${loneEvenCycles.length} (must be 0, same reason)`);
console.log(
  `shapes beating the production 3-cycle's 8.00 atoms/cell: ${rows.filter((r) => r.perCell < 8).length} of ${rows.length}`,
);

/**
 * Tools for the classes no extension move can reach.
 *
 * Run: `npx tsx research/scratch/l3-tools-frames.ts` from the repo root.
 *
 * `l3-tools-families.ts` showed depth-2/2.5 commutators cover only the b = E
 * classes, and depth-1/1.5 moves are far too big (400 and 160 cells) to yield
 * any small-support commutator at all. That leaves the 5 classes with b = C
 * (3,200 cells) reachable only by frames.
 *
 * Level 2 has the same problem for corner-block cells and answers it with
 * `[slice, conjugated-slice]` commutators judged **pure on the target classes
 * only** — they may scramble the rest, which is why those phases run first.
 * This checks whether the same works one fractal level up.
 */
import {
  ROT_ID,
  actionOver,
  atomsOfFamily,
  classSites,
  commutatorCandidates,
  commutatorWord,
  siteClasses,
  type Atom,
} from './l3sim';

const allClasses = [...classSites.keys()].sort();
const bCornerClasses = allClasses.filter((c) => c[1] === 'C');
const scope = new Set(bCornerClasses);
console.log(`classes reachable only by frames (b = C): ${bCornerClasses.join(', ')}`);
console.log(`cells in scope: ${bCornerClasses.reduce((n, c) => n + classSites.get(c)!.length, 0)}\n`);

const inScope = (site: number) => scope.has(siteClasses[site]!);

const slices = atomsOfFamily('frame-s1');
const allFrames = atomsOfFamily('frame-s1', 'frame-s3', 'frame-s9');

interface Cand { word: Atom[]; support: number[] }

/** Support of a word restricted to the target classes. */
const scopedSupport = (word: Atom[], candidates: Set<number>): number[] | null => {
  const action = actionOver(word, candidates);
  const support: number[] = [];
  for (const [site, [to, rot]] of action.moves) {
    if (!inScope(site)) continue;
    if (to === site && rot === ROT_ID) continue;
    support.push(site);
  }
  return support;
};

/** A pure 3-cycle *on the target classes*: exactly three in-scope cells move. */
const asScopedPure = (word: Atom[], candidates: Set<number>): { src: number[]; dst: number[]; cls: string } | null => {
  const action = actionOver(word, candidates);
  const src: number[] = [];
  const dst: number[] = [];
  for (const [site, [to, rot]] of action.moves) {
    if (!inScope(site)) continue;
    if (to === site) {
      if (rot !== ROT_ID) return null; // in-scope cell left twisted in place
      continue;
    }
    src.push(site);
    dst.push(to);
    if (src.length > 8) return null;
  }
  if (src.length < 3) return null;
  const cls = siteClasses[src[0]!]!;
  if (src.some((s) => siteClasses[s] !== cls)) return null;
  return { src, dst, cls };
};

// --- step 1: bare [frame, frame] commutators ---
{
  const started = performance.now();
  const perClass = new Map<string, number>();
  let tested = 0;
  let small = 0;
  for (const a of slices) {
    for (const b of allFrames) {
      if (a.refId === b.refId) continue;
      tested += 1;
      const candidates = commutatorCandidates([a], [b]);
      const support = scopedSupport(commutatorWord([a], [b]), candidates)!;
      if (support.length > 0 && support.length <= 9) small += 1;
      const t = asScopedPure(commutatorWord([a], [b]), candidates);
      if (t) perClass.set(t.cls, (perClass.get(t.cls) ?? 0) + 1);
    }
  }
  console.log(`[frame, frame] (4 atoms): ${tested.toLocaleString()} tested, ${small} with small in-scope support, ` +
    `${[...perClass.values()].reduce((x, y) => x + y, 0)} scope-pure (${((performance.now() - started) / 1000).toFixed(1)}s)`);
  for (const cls of bCornerClasses) console.log(`    ${cls.padEnd(10)} ${perClass.get(cls) ?? 0}`);
}

// --- step 2: interchange pairs of small-in-scope-support commutators ---
{
  const started = performance.now();
  const seeds: Cand[] = [];
  const seen = new Set<string>();
  for (const a of slices) {
    for (const b of allFrames) {
      if (a.refId === b.refId) continue;
      const word = commutatorWord([a], [b]);
      const candidates = commutatorCandidates([a], [b]);
      const support = scopedSupport(word, candidates)!;
      if (support.length === 0 || support.length > 6) continue;
      const action = actionOver(word, candidates);
      const key = support.map((i) => `${i}>${action.moves.get(i)![0]}#${action.moves.get(i)![1]}`).join(';');
      if (seen.has(key)) continue;
      seen.add(key);
      seeds.push({ word, support });
    }
  }
  console.log(`\nseeds with in-scope support <= 6: ${seeds.length} (${((performance.now() - started) / 1000).toFixed(1)}s)`);

  const siteToSeeds = new Map<number, number[]>();
  seeds.forEach((seed, index) => {
    for (const site of seed.support) {
      const list = siteToSeeds.get(site) ?? [];
      list.push(index);
      siteToSeeds.set(site, list);
    }
  });

  const perClass = new Map<string, number>();
  const pairsByClass = new Map<string, Set<number>>();
  let pairs = 0;
  const budgetMs = 180_000;
  let stopped = false;
  for (let i = 0; i < seeds.length && !stopped; i += 1) {
    const w1 = seeds[i]!;
    const partners = new Set<number>();
    for (const site of w1.support) for (const j of siteToSeeds.get(site) ?? []) if (j > i) partners.add(j);
    for (const j of partners) {
      if (performance.now() - started > budgetMs) { stopped = true; break; }
      pairs += 1;
      const w2 = seeds[j]!;
      const word = commutatorWord(w1.word, w2.word);
      const t = asScopedPure(word, commutatorCandidates(w1.word, w2.word));
      if (!t) continue;
      perClass.set(t.cls, (perClass.get(t.cls) ?? 0) + 1);
      const set = pairsByClass.get(t.cls) ?? new Set<number>();
      for (let k = 0; k < t.src.length; k += 1) {
        set.add(t.src[k]! * 8000 + t.dst[k]!);
        set.add(t.dst[k]! * 8000 + t.src[k]!);
      }
      pairsByClass.set(t.cls, set);
    }
  }
  console.log(`interchange: ${pairs.toLocaleString()} pairs${stopped ? ' (budget hit)' : ''}, ` +
    `${((performance.now() - started) / 1000).toFixed(1)}s\n`);
  console.log('class        cells     tools   ordered pairs covered');
  for (const cls of bCornerClasses) {
    const cells = classSites.get(cls)!.length;
    const possible = cells * (cells - 1);
    const covered = pairsByClass.get(cls)?.size ?? 0;
    console.log(
      `${cls.padEnd(11)} ${String(cells).padStart(5)} ${String(perClass.get(cls) ?? 0).padStart(9)}   ` +
        `${covered.toLocaleString()}/${possible.toLocaleString()} (${((100 * covered) / possible).toFixed(2)}%)`,
    );
  }
}

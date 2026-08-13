/**
 * Tools for the b = C classes, using Level 2's actual corner construction.
 *
 * Run: `npx tsx research/scratch/l3-tools-frames2.ts` from the repo root.
 *
 * The previous probe asked the wrong question. Level 2 does not look for
 * commutators with *small* support on the corner classes; it looks for two
 * words whose corner-restricted supports **meet in exactly one cell**. Two
 * permutations overlapping in a single point always interchange into a 3-cycle
 * on that point's orbit, however large their supports are. That is what makes
 * the construction work despite slices moving many cells.
 *
 * Expected overlap here is ~4.5 cells (two ~120-cell in-scope supports inside
 * 3,200 sites), so exactly-one overlaps should exist — just more rarely than at
 * Level 2, where supports of ~15 sit inside 160 corner sites.
 */
import {
  ROT_ID,
  actionOver,
  atomsOfFamily,
  classSites,
  commutatorCandidates,
  commutatorWord,
  inverseAtom,
  siteClasses,
  supportCandidates,
  type Atom,
} from './l3sim';

const allClasses = [...classSites.keys()].sort();
const bCornerClasses = allClasses.filter((c) => c[1] === 'C');
const scope = new Set(bCornerClasses);
const inScope = (site: number) => scope.has(siteClasses[site]!);
console.log(`target classes (b = C): ${bCornerClasses.join(', ')} — ${bCornerClasses.reduce((n, c) => n + classSites.get(c)!.length, 0)} cells\n`);

const slices = atomsOfFamily('frame-s1');
const allFrames = atomsOfFamily('frame-s1', 'frame-s3', 'frame-s9');

interface Cand { word: Atom[]; support: number[]; mask: Uint8Array }

const makeCand = (word: Atom[], support: number[]): Cand => {
  const mask = new Uint8Array(8000);
  for (const s of support) mask[s] = 1;
  return { word, support, mask };
};

/** In-scope support of a single atom: the cells it moves that lie in the target classes. */
const atomScopeSupport = (a: Atom): number[] => {
  const out: number[] = [];
  for (const [from, to] of a.map) if (from !== to && inScope(from)) out.push(from);
  return out;
};

const started = performance.now();

// Singles: the slices themselves.
const singles: Cand[] = slices.map((a) => makeCand([a], atomScopeSupport(a)));

// Conjugates g h g^-1: applied left to right this is x -> g^-1(h(g(x))), so its
// support is the preimage of supp(h) under g — one lookup per moved cell of h.
const conjugates: Cand[] = [];
for (const g of slices) {
  const gInv = inverseAtom(g);
  for (const h of allFrames) {
    if (g.refId === h.refId) continue;
    const support: number[] = [];
    for (const [from, to] of h.map) {
      if (from === to) continue;
      const pre = gInv.map.get(from) ?? from;
      if (inScope(pre)) support.push(pre);
    }
    if (support.length === 0) continue;
    conjugates.push(makeCand([g, h, gInv], support));
  }
}
console.log(`singles ${singles.length}, conjugates ${conjugates.length} (${((performance.now() - started) / 1000).toFixed(1)}s)`);
console.log(
  `  in-scope support sizes: singles ~${Math.round(singles.reduce((n, c) => n + c.support.length, 0) / singles.length)}, ` +
    `conjugates ~${Math.round(conjugates.reduce((n, c) => n + c.support.length, 0) / conjugates.length)}`,
);

// Prefer the conjugates with the smallest in-scope support: a smaller support
// makes an exactly-one overlap likelier and the resulting tool tighter.
conjugates.sort((a, b) => a.support.length - b.support.length);
const kept = conjugates.slice(0, 20000);
console.log(`  keeping the ${kept.length} tightest conjugates (support ${kept[0]!.support.length}..${kept[kept.length - 1]!.support.length})\n`);

const intersectionSize = (a: Cand, b: Cand): number => {
  const [small, big] = a.support.length <= b.support.length ? [a, b] : [b, a];
  let n = 0;
  for (const site of small.support) if (big.mask[site]) n += 1;
  return n;
};

const asScopedPure = (word: Atom[], candidates: Set<number>) => {
  const action = actionOver(word, candidates);
  const src: number[] = [];
  const dst: number[] = [];
  for (const [site, [to, rot]] of action.moves) {
    if (!inScope(site)) continue;
    if (to === site) {
      if (rot !== ROT_ID) return null;
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

const perClass = new Map<string, number>();
const pairsByClass = new Map<string, Set<number>>();
let overlapOne = 0;
let tested = 0;
const budgetMs = 300_000;
let stopped = false;
for (const A of singles) {
  if (stopped) break;
  if (A.support.length === 0) continue;
  for (const B of kept) {
    if (performance.now() - started > budgetMs) { stopped = true; break; }
    tested += 1;
    if (intersectionSize(A, B) !== 1) continue;
    overlapOne += 1;
    const word = commutatorWord(A.word, B.word);
    // The commutator-support bound needs B small; here both are large, so close
    // the full support instead.
    const t = asScopedPure(word, supportCandidates(word));
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

console.log(
  `pairs tested ${tested.toLocaleString()}${stopped ? ' (budget hit)' : ''}, ` +
    `overlap-exactly-one ${overlapOne.toLocaleString()}, ` +
    `scope-pure tools ${[...perClass.values()].reduce((x, y) => x + y, 0).toLocaleString()} ` +
    `(${((performance.now() - started) / 1000).toFixed(1)}s)\n`,
);
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

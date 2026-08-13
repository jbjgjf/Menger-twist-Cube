/**
 * Can a Level 3 cell-reduction tool library be built at all?
 *
 * Run: `npx tsx research/scratch/l3-tools-probe.ts` from the repo root.
 *
 * This is the critical path for a full Level 3 solver. Level 2 builds its
 * library by brute force over 15,552 [frame, E1/slab] commutators on 400 sites
 * in ~5s. Level 3 has 20x the sites and, naively, ~65x the candidate pairs.
 * The probe measures whether the same construction survives the jump, using
 * sparse atoms and the commutator-support bound from `l3sim.ts`.
 */
import {
  ROT_ID,
  N,
  actionOver,
  atoms,
  atomsOfFamily,
  classSites,
  commutatorCandidates,
  commutatorWord,
  siteClasses,
  summary,
  type Atom,
} from './l3sim';

const t0 = performance.now();
console.log(`sim built in ${(performance.now() - t0).toFixed(0)}ms:`, JSON.stringify(summary(), null, 0));

// Sanity: every atom is a bijection on the cells it touches, and the engine
// agrees the puzzle has 8000 cells in 15 classes.
{
  let bad = 0;
  for (const a of atoms) {
    const seen = new Set(a.map.values());
    if (seen.size !== a.map.size) bad += 1;
  }
  console.log(`atoms that are not injective on their support: ${bad} (must be 0)`);
  console.log(`class sizes: ${[...classSites].map(([c, s]) => `${c}:${s.length}`).sort().join(' ')}`);
}

// --- seeds: [frame, mid-block-local] commutators with small support ---

const frameAtoms = atomsOfFamily('frame-s1', 'frame-s3', 'frame-s9');
const localAtoms = atomsOfFamily('ext-d2', 'ext-d2.5');
console.log(`\nframe atoms: ${frameAtoms.length}, mid-block-local atoms (depth 2 / 2.5): ${localAtoms.length}`);
console.log(`candidate pairs: ${(frameAtoms.length * localAtoms.length).toLocaleString()}`);

interface Seed { word: Atom[]; support: number[]; cls: string }

const maxSeedSupport = 9;
const seeds: Seed[] = [];
const seenSeed = new Set<string>();
let evaluated = 0;

const tSeeds = performance.now();
for (const f of frameAtoms) {
  for (const e of localAtoms) {
    // Prefilter: if the frame does not disturb the local move's cells at all,
    // the two commute and the commutator is the identity.
    let touches = false;
    for (const site of e.map.keys()) {
      if (f.map.has(site)) {
        touches = true;
        break;
      }
    }
    if (!touches) continue;

    evaluated += 1;
    const word = commutatorWord([f], [e]);
    const action = actionOver(word, commutatorCandidates([f], [e]));
    if (action.moves.size === 0 || action.moves.size > maxSeedSupport) continue;

    const support = [...action.moves.keys()].sort((a, b) => a - b);
    const key = support.map((i) => `${i}>${action.moves.get(i)![0]}#${action.moves.get(i)![1]}`).join(';');
    if (seenSeed.has(key)) continue;
    seenSeed.add(key);
    const classes = new Set(support.map((s) => siteClasses[s]!));
    seeds.push({ word, support, cls: classes.size === 1 ? [...classes][0]! : 'mixed' });
  }
}
console.log(
  `\nseeds: evaluated ${evaluated.toLocaleString()} commutators, kept ${seeds.length} distinct with support <= ${maxSeedSupport} ` +
    `(${((performance.now() - tSeeds) / 1000).toFixed(1)}s)`,
);
{
  const bySize = new Map<number, number>();
  for (const s of seeds) bySize.set(s.support.length, (bySize.get(s.support.length) ?? 0) + 1);
  console.log(`  support sizes: ${[...bySize].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' ')}`);
  const byCls = new Map<string, number>();
  for (const s of seeds) byCls.set(s.cls, (byCls.get(s.cls) ?? 0) + 1);
  console.log(`  classes touched: ${[...byCls].sort().map(([k, v]) => `${k}:${v}`).join(' ')}`);
}

// --- interchange: pairs of seeds sharing support give pure tools ---

interface Template { word: Atom[]; src: number[]; dst: number[]; rots: number[]; cls: string; shape: string }

const asPureTemplate = (word: Atom[], candidates: Set<number>): Template | null => {
  const action = actionOver(word, candidates);
  const src: number[] = [];
  const dst: number[] = [];
  const rots: number[] = [];
  for (const [site, [to, rot]] of action.moves) {
    if (to === site) {
      if (rot !== ROT_ID) return null; // a stationary cell left twisted
      continue;
    }
    src.push(site);
    dst.push(to);
    rots.push(rot);
  }
  if (src.length < 3 || src.length > 8) return null;
  const cls = siteClasses[src[0]!]!;
  if (src.some((s) => siteClasses[s] !== cls)) return null;

  const perm = new Map(src.map((s, k) => [s, dst[k]!]));
  const seen = new Set<number>();
  const lengths: number[] = [];
  for (const start of src) {
    if (seen.has(start)) continue;
    let len = 0;
    let cur = start;
    do {
      seen.add(cur);
      cur = perm.get(cur)!;
      len += 1;
    } while (cur !== start);
    lengths.push(len);
  }
  return { word, src, dst, rots, cls, shape: lengths.sort((a, b) => b - a).join('+') };
};

const siteToSeeds = new Map<number, number[]>();
seeds.forEach((seed, index) => {
  for (const site of seed.support) {
    const list = siteToSeeds.get(site) ?? [];
    list.push(index);
    siteToSeeds.set(site, list);
  }
});

const templates: Template[] = [];
const tInter = performance.now();
let interchanges = 0;
const budgetMs = 240_000;
let stopped = false;
for (let i = 0; i < seeds.length && !stopped; i += 1) {
  const w1 = seeds[i]!;
  const partners = new Set<number>();
  for (const site of w1.support) for (const j of siteToSeeds.get(site) ?? []) if (j > i) partners.add(j);
  for (const j of partners) {
    if (performance.now() - tInter > budgetMs) {
      stopped = true;
      console.log(`\n  (interchange search stopped at the ${budgetMs / 1000}s budget, i=${i}/${seeds.length})`);
      break;
    }
    const w2 = seeds[j]!;
    interchanges += 1;
    const word = commutatorWord(w1.word, w2.word);
    const t = asPureTemplate(word, commutatorCandidates(w1.word, w2.word));
    if (t) templates.push(t);
  }
}
console.log(
  `\ninterchange: ${interchanges.toLocaleString()} pairs tested, ${templates.length.toLocaleString()} pure templates ` +
    `(${((performance.now() - tInter) / 1000).toFixed(1)}s)`,
);

// --- coverage: what fraction of ordered site pairs can a tool reach directly? ---

const byClass = new Map<string, Template[]>();
for (const t of templates) {
  const list = byClass.get(t.cls) ?? [];
  list.push(t);
  byClass.set(t.cls, list);
}
console.log('\nclass        cells   tools   shapes                 ordered pairs covered');
for (const [cls, sites] of [...classSites].sort()) {
  const list = byClass.get(cls) ?? [];
  const pairs = new Set<number>();
  const shapes = new Map<string, number>();
  for (const t of list) {
    shapes.set(t.shape, (shapes.get(t.shape) ?? 0) + 1);
    for (let k = 0; k < t.src.length; k += 1) {
      pairs.add(t.src[k]! * N + t.dst[k]!);
      pairs.add(t.dst[k]! * N + t.src[k]!);
    }
  }
  const possible = sites.length * (sites.length - 1);
  console.log(
    `${cls.padEnd(12)} ${String(sites.length).padStart(5)} ${String(list.length).padStart(7)}   ` +
      `${[...shapes].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s, n]) => `${s}x${n}`).join(' ').padEnd(22)} ` +
      `${pairs.size.toLocaleString()}/${possible.toLocaleString()} (${((100 * pairs.size) / possible).toFixed(2)}%)`,
  );
}

console.log(`\ntotal ${((performance.now() - t0) / 1000).toFixed(1)}s`);
/**
 * Are there shorter pure 3-cycles for the edge classes (EC / EEa / EEo)?
 *
 * Run: `npx tsx research/scratch/l2-short-tools.ts` from the repo root.
 *
 * The production solver builds edge tools as an *interchange* of two 4-atom
 * [frame, E1/slab] commutators — 16 atoms per 3-cycle — and the edge placement
 * phases cost ~14 atoms per cell against ~5.5 for the corner phases, which is
 * 76% of a whole solve. This asks whether 4-atom or 8-atom words can do the
 * same job, and (just as important) whether they cover enough ordered site
 * pairs to actually be usable by the placement search.
 */
import {
  N,
  ROT_ID,
  actionOfWord,
  atomsFor,
  commutatorWord,
  inverseWord,
  siteClasses,
  state,
  type Atom,
} from './sim';

type PieceClass = (typeof siteClasses)[number];

const frameAtoms = atomsFor((a) => a.kind === 'frame');
const blockLocalAtoms = atomsFor((a, t) => a.kind === 'extension' && t !== undefined && (t.depth === 1 || t.depth === 1.5));
console.log(`frame atoms: ${frameAtoms.length}, E1/slab atoms: ${blockLocalAtoms.length}`);

interface Pure3 {
  word: Atom[];
  cycle: [number, number, number];
  cls: PieceClass;
}

/** A pure 3-cycle: exactly three cells move, nothing else even rotates. */
const asPure3Cycle = (word: Atom[]): Pure3 | null => {
  const action = actionOfWord(word);
  const moved: number[] = [];
  for (let i = 0; i < N; i += 1) {
    if (action.perm[i] !== i) {
      moved.push(i);
      if (moved.length > 3) return null;
    } else if (action.rot[i] !== ROT_ID) {
      return null; // a stationary cell left twisted is not a pure 3-cycle
    }
  }
  if (moved.length !== 3) return null;
  const [a] = moved as [number, number, number];
  const cls = siteClasses[a]!;
  if (moved.some((s) => siteClasses[s] !== cls)) return null;
  if (action.perm[action.perm[a]!] === a) return null; // a transposition, not a 3-cycle
  const b = action.perm[a]!;
  const c = action.perm[b]!;
  return { word, cycle: [a, b, c], cls };
};

const report = (label: string, found: Pure3[], wordLength: number) => {
  const byClass = new Map<PieceClass, Pure3[]>();
  for (const t of found) {
    const list = byClass.get(t.cls) ?? [];
    list.push(t);
    byClass.set(t.cls, list);
  }
  const summary = [...byClass.entries()]
    .map(([cls, list]) => {
      // Ordered-pair coverage: how many (source, destination) pairs can a
      // template place directly, before any setup conjugation? Each 3-cycle
      // gives 6 usable ordered pairs (3 rotations x 2 directions).
      const pairs = new Set<number>();
      for (const t of list) {
        const [x, y, z] = t.cycle;
        for (const [p, q] of [[x, y], [y, z], [z, x], [y, x], [z, y], [x, z]] as const) pairs.add(p * N + q);
      }
      const sites = new Set(list.flatMap((t) => t.cycle));
      return `${cls}: ${list.length} tools, ${pairs.size} ordered pairs, ${sites.size} distinct sites`;
    })
    .join('\n      ');
  console.log(`  ${label} (${wordLength} atoms): ${found.length} pure 3-cycles`);
  if (found.length > 0) console.log(`      ${summary}`);
};

// --- 1. the 4-atom seeds themselves ---
// The production library collects these as *seeds* and only ever tests their
// pairwise interchange. If a seed is already a pure 3-cycle, that is a
// ready-made template a quarter of the length.
console.log('\n1. bare [frame, E1/slab] commutators');
const seeds: Array<{ word: Atom[]; support: number[] }> = [];
const seedPure: Pure3[] = [];
const seenSeed = new Set<string>();
for (const f of frameAtoms) {
  for (const e of blockLocalAtoms) {
    const word = commutatorWord([f], [e]);
    const action = actionOfWord(word);
    const support: number[] = [];
    let over = false;
    for (let i = 0; i < N; i += 1) {
      if (action.perm[i] !== i || action.rot[i] !== ROT_ID) {
        support.push(i);
        if (support.length > 9) {
          over = true;
          break;
        }
      }
    }
    if (over || support.length === 0) continue;
    const profile = support.map((i) => `${i}>${action.perm[i]}#${action.rot[i]}`).join(';');
    if (seenSeed.has(profile)) continue;
    seenSeed.add(profile);
    seeds.push({ word, support });
    const pure = asPure3Cycle(word);
    if (pure) seedPure.push(pure);
  }
}
console.log(`  distinct small-support seeds: ${seeds.length}`);
report('bare seeds', seedPure, 4);

// --- 2. 8-atom products of two seeds ---
// If two seeds overlap in the right way, their plain product (not the
// commutator) can already be a pure 3-cycle at half the interchange length.
console.log('\n2. products of two seeds');
const siteToSeeds = new Map<number, number[]>();
seeds.forEach((seed, index) => {
  for (const site of seed.support) {
    const list = siteToSeeds.get(site) ?? [];
    list.push(index);
    siteToSeeds.set(site, list);
  }
});
const productPure: Pure3[] = [];
const seenProduct = new Set<string>();
for (let i = 0; i < seeds.length; i += 1) {
  const w1 = seeds[i]!;
  const partners = new Set<number>();
  for (const site of w1.support) for (const j of siteToSeeds.get(site) ?? []) if (j !== i) partners.add(j);
  for (const j of partners) {
    const w2 = seeds[j]!;
    for (const word of [[...w1.word, ...w2.word], [...w1.word, ...inverseWord(w2.word)]]) {
      const pure = asPure3Cycle(word);
      if (!pure) continue;
      const profile = pure.cycle.join(',');
      if (seenProduct.has(profile)) continue;
      seenProduct.add(profile);
      productPure.push(pure);
    }
  }
}
report('seed products', productPure, 8);

// --- 3. the production construction, for comparison ---
console.log('\n3. interchange of two seeds sharing exactly one site (what the solver uses today)');
const interchangePure: Pure3[] = [];
const seenInterchange = new Set<string>();
for (let i = 0; i < seeds.length; i += 1) {
  const w1 = seeds[i]!;
  const partners = new Set<number>();
  for (const site of w1.support) for (const j of siteToSeeds.get(site) ?? []) if (j > i) partners.add(j);
  for (const j of partners) {
    const w2 = seeds[j]!;
    let shared = 0;
    for (const site of w1.support) if (w2.support.includes(site)) shared += 1;
    if (shared !== 1) continue;
    const pure = asPure3Cycle(commutatorWord(w1.word, w2.word));
    if (!pure) continue;
    const profile = pure.cycle.join(',');
    if (seenInterchange.has(profile)) continue;
    seenInterchange.add(profile);
    interchangePure.push(pure);
  }
}
report('interchange', interchangePure, 16);

console.log(`\ntotal cells per class: ${JSON.stringify(
  siteClasses.reduce<Record<string, number>>((acc, cls) => ({ ...acc, [cls]: (acc[cls] ?? 0) + 1 }), {}),
)}`);
console.log(`(state has ${state.cubies.length} cells)`);

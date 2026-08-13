/**
 * Which seed family reaches which of the 15 Level 3 piece classes?
 *
 * Run: `npx tsx research/scratch/l3-tools-families.ts` from the repo root.
 *
 * Level 2 needs two tool families because the extension moves cannot touch
 * corner blocks: corner-block cells are reachable only by slices, so they get
 * `[slice, conjugated-slice]` tools (pure on corner classes only) and are solved
 * first, while edge-block cells get fully pure `[frame, E1/slab]` tools last.
 *
 * Level 3 has one more fractal level, so the same argument should give a
 * three-tier hierarchy keyed on the hierarchical digits p = 9B + 3b + o:
 *
 *   depth-1/1.5 targets exist only in edge sub-blocks   -> support has B = E
 *   depth-2/2.5 targets exist only at edge mid-blocks   -> support has b = E
 *   depth-3 targets exist only at edge cells            -> support has o = E
 *
 * and class invariance should confine each commutator family accordingly. This
 * measures that: per family, which classes get pure tools and what the support
 * is confined to.
 */
import {
  ROT_ID,
  actionOver,
  atomsOfFamily,
  classSites,
  commutatorCandidates,
  commutatorWord,
  digitsOf,
  siteClasses,
  sitePositions,
  type Atom,
} from './l3sim';

const frameAtoms = atomsOfFamily('frame-s1', 'frame-s3', 'frame-s9');
const maxSeedSupport = 9;

const digitTag = (site: number): string => {
  const digits = digitsOf(sitePositions[site]!);
  return digits.map((d) => (d.findIndex((v) => v === 0) === -1 ? 'C' : 'E')).join('');
};

interface Seed { word: Atom[]; support: number[] }

const buildSeeds = (local: Atom[]): Seed[] => {
  const seeds: Seed[] = [];
  const seen = new Set<string>();
  for (const f of frameAtoms) {
    for (const e of local) {
      let touches = false;
      for (const site of e.map.keys()) {
        if (f.map.has(site)) { touches = true; break; }
      }
      if (!touches) continue;
      const word = commutatorWord([f], [e]);
      const action = actionOver(word, commutatorCandidates([f], [e]));
      if (action.moves.size === 0 || action.moves.size > maxSeedSupport) continue;
      const support = [...action.moves.keys()].sort((a, b) => a - b);
      const key = support.map((i) => `${i}>${action.moves.get(i)![0]}#${action.moves.get(i)![1]}`).join(';');
      if (seen.has(key)) continue;
      seen.add(key);
      seeds.push({ word, support });
    }
  }
  return seeds;
};

interface Template { src: number[]; dst: number[]; cls: string }

const asPure = (word: Atom[], candidates: Set<number>): Template | null => {
  const action = actionOver(word, candidates);
  const src: number[] = [];
  const dst: number[] = [];
  for (const [site, [to, rot]] of action.moves) {
    if (to === site) {
      if (rot !== ROT_ID) return null;
      continue;
    }
    src.push(site);
    dst.push(to);
  }
  if (src.length < 3 || src.length > 8) return null;
  const cls = siteClasses[src[0]!]!;
  if (src.some((s) => siteClasses[s] !== cls)) return null;
  return { src, dst, cls };
};

const families: Array<{ label: string; local: Atom[] }> = [
  { label: 'depth-1 + depth-1.5 (sub-block local)', local: atomsOfFamily('ext-d1', 'ext-d1.5') },
  { label: 'depth-2 + depth-2.5 (mid-block local)', local: atomsOfFamily('ext-d2', 'ext-d2.5') },
];

const allClasses = [...classSites.keys()].sort();

for (const family of families) {
  const started = performance.now();
  const seeds = buildSeeds(family.local);

  // What does a bare seed's support look like? This is the corner-safety claim.
  const seedTags = new Set<string>();
  for (const seed of seeds) for (const site of seed.support) seedTags.add(digitTag(site));

  const siteToSeeds = new Map<number, number[]>();
  seeds.forEach((seed, index) => {
    for (const site of seed.support) {
      const list = siteToSeeds.get(site) ?? [];
      list.push(index);
      siteToSeeds.set(site, list);
    }
  });

  const perClass = new Map<string, number>();
  const budgetMs = 120_000;
  let pairs = 0;
  let stopped = false;
  for (let i = 0; i < seeds.length && !stopped; i += 1) {
    const w1 = seeds[i]!;
    const partners = new Set<number>();
    for (const site of w1.support) for (const j of siteToSeeds.get(site) ?? []) if (j > i) partners.add(j);
    for (const j of partners) {
      if (performance.now() - started > budgetMs) { stopped = true; break; }
      pairs += 1;
      const w2 = seeds[j]!;
      const t = asPure(commutatorWord(w1.word, w2.word), commutatorCandidates(w1.word, w2.word));
      if (t) perClass.set(t.cls, (perClass.get(t.cls) ?? 0) + 1);
    }
  }

  console.log(`\n=== ${family.label} ===`);
  console.log(`  local atoms ${family.local.length}, seeds ${seeds.length}, interchange pairs ${pairs.toLocaleString()}` +
    `${stopped ? ' (budget hit)' : ''}, ${((performance.now() - started) / 1000).toFixed(1)}s`);
  console.log(`  seed supports live on digit patterns: {${[...seedTags].sort().join(', ')}}`);
  const covered = allClasses.filter((c) => (perClass.get(c) ?? 0) > 0);
  console.log(`  classes with pure tools: ${covered.length}/15`);
  for (const cls of allClasses) {
    const n = perClass.get(cls) ?? 0;
    console.log(`    ${cls.padEnd(12)} ${n > 0 ? String(n).padStart(8) : '       -'}`);
  }
}

/**
 * Why do the tight rung-2 words fail to be pure tools?
 *
 * Run: `npx tsx research/scratch/l3-why-impure.ts` from the repo root.
 *
 * `l3-ladder.ts` found 3,528 interchange words with support <= 6 on the
 * `EEE/B|b|o` orbit, but `l3-wide-tools.ts` accepted none of them even after the
 * cycle-shape restriction was lifted. A word fails purity for exactly two
 * reasons, and which one it is decides what to try next:
 *
 *   spills   some moved cell lies outside the target orbit — the word is a
 *            perfectly good tool, just for a different orbit, and the search
 *            should be re-aimed rather than widened;
 *   twisted  a cell returns to its own site carrying a rotation — the word is a
 *            mixed move/twist, and a further commutator is needed to separate
 *            the two effects.
 */
import {
  ROT_ID, actionOver, atoms, commutatorCandidates, commutatorWord, N, siteClasses,
} from './l3sim';
import { findOrbitLocalTools } from './l3tools';

const parent = new Int32Array(N).map((_, i) => i);
const findRoot = (x: number): number => {
  let r = x;
  while (parent[r] !== r) r = parent[r]!;
  while (parent[x] !== r) { const n = parent[x]!; parent[x] = r; x = n; }
  return r;
};
for (const a of atoms) for (const [from, to] of a.map) {
  if (from === to) continue;
  const ra = findRoot(from); const rb = findRoot(to);
  if (ra !== rb) parent[ra] = rb;
}
const orbitOfSite = new Int32Array(N).fill(-1);
const orbitSites: number[][] = [];
{
  const idx = new Map<number, number>();
  for (let i = 0; i < N; i += 1) {
    const r = findRoot(i);
    let k = idx.get(r);
    if (k === undefined) { k = orbitSites.length; orbitSites.push([]); idx.set(r, k); }
    orbitOfSite[i] = k; orbitSites[k]!.push(i);
  }
}

for (const cls of ['EEE/B|b|o', 'ECC', 'EEE/B|bo']) {
  const o = orbitSites.findIndex((s) => siteClasses[s[0]!] === cls);
  const sites = orbitSites[o]!;
  const local = findOrbitLocalTools(sites, 600);
  const seeds = [...local].sort((a, b) => a.gsup.length - b.gsup.length).slice(0, 150);

  let tight = 0;
  let spills = 0;
  let twisted = 0;
  let both = 0;
  let clean = 0;
  const spanHist = new Map<number, number>();
  for (let i = 0; i < seeds.length; i += 1) {
    for (let j = i + 1; j < seeds.length; j += 1) {
      const action = actionOver(
        commutatorWord(seeds[i]!.word, seeds[j]!.word),
        commutatorCandidates(seeds[i]!.word, seeds[j]!.word),
      );
      if (action.moves.size === 0 || action.moves.size > 8) continue;
      tight += 1;
      let outside = false;
      let rotated = false;
      const orbitsTouched = new Set<number>();
      for (const [s, [to, rot]] of action.moves) {
        if (to === s && rot !== ROT_ID) rotated = true;
        if (to !== s) {
          orbitsTouched.add(orbitOfSite[s]!);
          if (orbitOfSite[s] !== o) outside = true;
        }
      }
      spanHist.set(orbitsTouched.size, (spanHist.get(orbitsTouched.size) ?? 0) + 1);
      if (outside && rotated) both += 1;
      else if (outside) spills += 1;
      else if (rotated) twisted += 1;
      else clean += 1;
    }
  }
  console.log(`${cls}  (orbit of ${sites.length} cells)`);
  console.log(`  tight words (support <= 8): ${tight}`);
  console.log(`    spill outside the orbit only: ${spills}`);
  console.log(`    leave a stationary cell twisted only: ${twisted}`);
  console.log(`    both: ${both}`);
  console.log(`    clean (a usable pure tool): ${clean}`);
  console.log(`  orbits spanned by the moved cells: ${[...spanHist].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' ')}\n`);
}

/**
 * Step 5b diagnostic: how far down does the tightening ladder actually go?
 *
 * Run: `npx tsx research/scratch/l3-ladder.ts` from the repo root.
 *
 * Level 2 descends atoms(44) -> seeds(<=9) -> tools(3) in two rungs. At Level 3
 * the orbit-local tools bottom out around 50 cells of global support and step 2
 * could not interchange them down to 3, which is why 40 orbits have no globally
 * pure tool and the phase order does not close.
 *
 * Rather than guess at another seed family, measure the rung directly: take the
 * tightest orbit-local tools for a blocking orbit, interchange them, and look at
 * the *distribution* of resulting support sizes. Mass at 4-12 means one more
 * rung reaches 3 and the ladder closes; mass staying near 50 means this route is
 * exhausted and the tools have to come from somewhere else.
 *
 * The exactly-one-overlap rule is only a sufficient condition, so it is not used
 * as a gate here — every pair is evaluated.
 */
import {
  ROT_ID, actionOver, atoms, commutatorCandidates, commutatorWord, N, siteClasses,
} from './l3sim';
import { findOrbitLocalTools } from './l3tools';

// ---------- orbits ----------
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

const blocking = new Set(['ECC', 'ECE/Bo', 'ECE/B|o', 'EEC/B|b', 'EEE/Bo|b', 'EEE/B|bo', 'EEE/B|b|o']);
const sample: number[] = [];
const seenClass = new Set<string>();
for (let o = 0; o < orbitSites.length; o += 1) {
  const cls = siteClasses[orbitSites[o]![0]!]!;
  if (!blocking.has(cls) || seenClass.has(cls)) continue;
  seenClass.add(cls);
  sample.push(o);
}
console.log(`sampling one blocking orbit per class: ${sample.length}\n`);

console.log('class          rung-1 tools  min supp  |  rung-2 support distribution           min  pure');
for (const o of sample) {
  const sites = orbitSites[o]!;
  const started = performance.now();
  const local = findOrbitLocalTools(sites, 600);
  if (local.length === 0) { console.log(`${siteClasses[sites[0]!]!.padEnd(12)}  no rung-1 tools`); continue; }
  const rung1Min = Math.min(...local.map((t) => t.gsup.length));

  const seeds = [...local].sort((a, b) => a.gsup.length - b.gsup.length).slice(0, 150);
  const hist = new Map<number, number>();
  let minSupport = Infinity;
  let pure = 0;
  let tested = 0;
  for (let i = 0; i < seeds.length; i += 1) {
    for (let j = i + 1; j < seeds.length; j += 1) {
      tested += 1;
      const action = actionOver(
        commutatorWord(seeds[i]!.word, seeds[j]!.word),
        commutatorCandidates(seeds[i]!.word, seeds[j]!.word),
      );
      const size = action.moves.size;
      if (size === 0) continue;
      const bucket = size <= 3 ? 3 : size <= 6 ? 6 : size <= 12 ? 12 : size <= 24 ? 24 : size <= 48 ? 48 : 99;
      hist.set(bucket, (hist.get(bucket) ?? 0) + 1);
      if (size < minSupport) minSupport = size;
      if (size !== 3) continue;
      let ok = true;
      const src: number[] = [];
      for (const [s, [to, rot]] of action.moves) {
        if (to === s) { if (rot !== ROT_ID) { ok = false; break; } continue; }
        src.push(s);
      }
      if (ok && src.length === 3 && src.every((s) => orbitOfSite[s] === o)) pure += 1;
    }
  }
  const dist = [3, 6, 12, 24, 48, 99].map((b) => `${b === 99 ? '>48' : `<=${b}`}:${hist.get(b) ?? 0}`).join(' ');
  console.log(
    `${siteClasses[sites[0]!]!.padEnd(12)} ${String(local.length).padStart(12)} ${String(rung1Min).padStart(9)}  |  ` +
    `${dist.padEnd(38)} ${String(minSupport === Infinity ? '-' : minSupport).padStart(4)} ${String(pure).padStart(5)}` +
    `   (${tested.toLocaleString()} pairs, ${((performance.now() - started) / 1000).toFixed(0)}s)`,
  );
}

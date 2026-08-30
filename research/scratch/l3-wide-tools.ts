/**
 * Step 5b: globally pure tools of *any* cycle shape for the blocking orbits.
 *
 * Run: `npx tsx research/scratch/l3-wide-tools.ts` from the repo root.
 *
 * `l3-ladder.ts` showed the tightening ladder does descend for the orbits that
 * block the phase order — `EEE/B|b|o` reaches support 6, `EEE/B|bo` and
 * `ECC`/`ECE/Bo` reach 9 — yet reported zero pure tools. The reason was in the
 * search, not the puzzle: `findPureTools` requires the result to be a 3-cycle.
 *
 * That is the same mistake Level 2 v0.1.0 made and v0.3.0 fixed. A globally pure
 * word confined to one orbit is a usable tool whatever its cycle shape, and the
 * wider shapes are *better*: a 5-cycle or a double 3-cycle lands 4 cells for the
 * same word length instead of 2. Level 2's placement search already scores tools
 * by cells landed rather than cycle length.
 *
 * So: accept any pure permutation of the target orbit with support up to 8.
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

const blockingClasses = new Set(['ECC', 'ECE/Bo', 'ECE/B|o', 'EEC/B|b', 'EEE/Bo|b', 'EEE/B|bo', 'EEE/B|b|o']);
const blocking = Array.from({ length: orbitSites.length }, (_, o) => o)
  .filter((o) => blockingClasses.has(siteClasses[orbitSites[o]![0]!]!));
console.log(`blocking orbits: ${blocking.length}\n`);

/** Cycle shape of a pure permutation, as "3", "5", "3+3", ... */
const shapeOf = (src: number[], dst: number[]): string => {
  const perm = new Map(src.map((s, k) => [s, dst[k]!]));
  const seen = new Set<number>();
  const lens: number[] = [];
  for (const s of src) {
    if (seen.has(s)) continue;
    let len = 0;
    let cur = s;
    do { seen.add(cur); cur = perm.get(cur)!; len += 1; } while (cur !== s);
    lens.push(len);
  }
  return lens.sort((a, b) => b - a).join('+');
};

console.log('class          orbits  with pure tool  tools  shapes seen');
const rows = new Map<string, { n: number; got: number; tools: number; shapes: Map<string, number> }>();
const started = performance.now();

for (const o of blocking) {
  const sites = orbitSites[o]!;
  const cls = siteClasses[sites[0]!]!;
  const local = findOrbitLocalTools(sites, 600);
  const seeds = [...local].sort((a, b) => a.gsup.length - b.gsup.length).slice(0, 150);

  let tools = 0;
  const shapes = new Map<string, number>();
  const seen = new Set<string>();
  outer:
  for (let i = 0; i < seeds.length; i += 1) {
    for (let j = i + 1; j < seeds.length; j += 1) {
      const action = actionOver(
        commutatorWord(seeds[i]!.word, seeds[j]!.word),
        commutatorCandidates(seeds[i]!.word, seeds[j]!.word),
      );
      if (action.moves.size === 0 || action.moves.size > 8) continue;
      const src: number[] = [];
      const dst: number[] = [];
      let ok = true;
      for (const [s, [to, rot]] of action.moves) {
        if (to === s) { if (rot !== ROT_ID) { ok = false; break; } continue; }
        if (orbitOfSite[s] !== o) { ok = false; break; }
        src.push(s); dst.push(to);
      }
      if (!ok || src.length < 3) continue;
      const key = src.map((s, k) => `${s}>${dst[k]}`).sort().join(';');
      if (seen.has(key)) continue;
      seen.add(key);
      tools += 1;
      const sh = shapeOf(src, dst);
      shapes.set(sh, (shapes.get(sh) ?? 0) + 1);
      if (tools >= 400) break outer;
    }
  }

  const r = rows.get(cls) ?? { n: 0, got: 0, tools: 0, shapes: new Map<string, number>() };
  r.n += 1;
  if (tools > 0) { r.got += 1; r.tools += tools; }
  for (const [k, v] of shapes) r.shapes.set(k, (r.shapes.get(k) ?? 0) + v);
  rows.set(cls, r);
}

for (const [cls, r] of [...rows].sort()) {
  console.log(
    `${cls.padEnd(12)} ${String(r.n).padStart(7)} ${String(r.got).padStart(15)} ${String(r.tools).padStart(6)}  ` +
    `${[...r.shapes].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}x${v}`).join(' ') || '-'}`,
  );
}
const covered = [...rows.values()].reduce((n, r) => n + r.got, 0);
const total = [...rows.values()].reduce((n, r) => n + r.n, 0);
console.log(`\nblocking orbits with a globally pure tool: ${covered}/${total} (${((performance.now() - started) / 1000).toFixed(0)}s)`);
console.log(covered === total
  ? '\nRESULT: every blocking orbit now has a globally pure tool, so all 164 orbits do.\nThe phase order constraint disappears — pure tools disturb nothing, so any order works.'
  : `\nRESULT: ${total - covered} blocking orbit(s) still uncovered.`);

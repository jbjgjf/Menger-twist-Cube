/**
 * Step 2: a pure tool for every one of the 164 orbits.
 *
 * Run: `npx tsx research/scratch/l3-orbit-tools.ts` from the repo root.
 *
 * Step 1 proved Alt(orbit) <= G everywhere, so a 3-cycle exists on every orbit.
 * It also showed conjugation cannot carry a tool from one orbit to another —
 * orbits are G-invariant, so conjugating a tool for O yields another tool for O.
 * Each orbit therefore needs its own tool found directly.
 *
 * The earlier searches worked at *class* level (up to 768 cells), where supports
 * are large and an exactly-one overlap is rare. Restricted to an orbit the same
 * words have tiny supports — a scale-1 slice moves 296 cells but may meet a
 * 24-cell orbit in just one — which is the regime where the interchange
 * criterion fires:
 *
 *   |supp_O(A) ∩ supp_O(B)| = 1  =>  [A,B] is a 3-cycle on O.
 *
 * Pass 1 uses bare atoms, giving 4-atom tools. Pass 2 adds conjugates g·h·g⁻¹
 * for the orbits pass 1 misses, giving 8-atom tools — still half of what Level 2
 * needs for its edge classes.
 */
import {
  ROT_ID,
  actionOver,
  atoms,
  atomsOfFamily,
  commutatorCandidates,
  commutatorWord,
  inverseAtom,
  N,
  supportCandidates,
  siteClasses,
  type Atom,
} from './l3sim';

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
  const idxOfRoot = new Map<number, number>();
  for (let i = 0; i < N; i += 1) {
    const r = findRoot(i);
    let idx = idxOfRoot.get(r);
    if (idx === undefined) { idx = orbitSites.length; orbitSites.push([]); idxOfRoot.set(r, idx); }
    orbitOfSite[i] = idx;
    orbitSites[idx]!.push(i);
  }
}

// ---------- tool search over a candidate pool ----------
interface Cand { word: Atom[]; support: number[] }
interface Tool { word: Atom[]; a: Atom[]; b: Atom[]; cycle: number[]; pure: boolean }

const orbitMask = new Uint8Array(N);

/** Interchange candidates whose orbit-restricted supports meet in exactly one cell. */
const searchOrbit = (sites: number[], cands: Cand[], limit: number): Tool[] => {
  const tools: Tool[] = [];
  const seenCycle = new Set<string>();
  const bySite = new Map<number, number[]>();
  cands.forEach((c, i) => { for (const s of c.support) { const l = bySite.get(s) ?? []; l.push(i); bySite.set(s, l); } });

  for (const site of sites) {
    for (const i of bySite.get(site) ?? []) {
      const A = cands[i]!;
      for (const j of bySite.get(site) ?? []) {
        if (j <= i) continue;
        const B = cands[j]!;
        let shared = 0;
        for (const s of A.support) { if (B.support.includes(s)) { shared += 1; if (shared > 1) break; } }
        if (shared !== 1) continue;

        const word = commutatorWord(A.word, B.word);
        const action = actionOver(word, commutatorCandidates(A.word, B.word));
        const src: number[] = [];
        const dst: number[] = [];
        let pure = true;
        let ok = true;
        for (const [s, [to, rot]] of action.moves) {
          if (!orbitMask[s]) { pure = false; continue; }
          if (to === s) { if (rot !== ROT_ID) { ok = false; break; } continue; }
          src.push(s); dst.push(to);
          if (src.length > 3) { ok = false; break; }
        }
        if (!ok || src.length !== 3) continue;
        const perm = new Map(src.map((s, k) => [s, dst[k]!]));
        let cur = src[0]!;
        for (let k = 0; k < 3; k += 1) cur = perm.get(cur)!;
        if (cur !== src[0]!) continue;

        const key = `${src.slice().sort((a, b) => a - b).join(',')}#${dst.join(',')}`;
        if (seenCycle.has(key)) continue;
        seenCycle.add(key);
        tools.push({ word, a: A.word, b: B.word, cycle: src, pure });
        if (tools.length >= limit) return tools;
      }
    }
  }
  return tools;
};

const frames = atomsOfFamily('frame-s1', 'frame-s3', 'frame-s9');

interface Result {
  size: number; cls: string; tools: number; pureTools: number; pairs: number; wordLen: number; pass: number;
  globalSupport: number; interchanged: number; interchangedPairs: number;
}
const results: Result[] = [];

const started = performance.now();
for (let o = 0; o < orbitSites.length; o += 1) {
  const sites = orbitSites[o]!;
  orbitMask.fill(0);
  for (const s of sites) orbitMask[s] = 1;

  // pass 1: bare atoms (4-atom tools)
  const bare: Cand[] = [];
  for (const a of atoms) {
    const support: number[] = [];
    for (const [from, to] of a.map) if (from !== to && orbitMask[from]) support.push(from);
    if (support.length >= 1 && support.length <= 24) bare.push({ word: [a], support });
  }
  let tools = searchOrbit(sites, bare, 600);
  let pass = 1;

  // pass 2: add conjugates g·h·g⁻¹ (8-atom tools) when pass 1 comes up empty
  if (tools.length === 0) {
    pass = 2;
    const cands: Cand[] = [...bare];
    const conj: Cand[] = [];
    const touching = atoms.filter((h) => { for (const [from, to] of h.map) if (from !== to && orbitMask[from]) return true; return false; });
    for (const g of frames) {
      const gInv = inverseAtom(g);
      for (const h of touching) {
        if (g.refId === h.refId) continue;
        // supp_O(g h g^-1) = { s in O : g(s) is moved by h }
        const support: number[] = [];
        for (const s of sites) {
          const gs = g.map.get(s) ?? s;
          const hgs = h.map.get(gs);
          if (hgs !== undefined && hgs !== gs) support.push(s);
        }
        if (support.length >= 1 && support.length <= 3) conj.push({ word: [g, h, gInv], support });
      }
    }
    // Pairing cost is quadratic in the pool, so keep only the tightest
    // candidates — a one-cell overlap is likeliest between small supports.
    conj.sort((a, b) => a.support.length - b.support.length);
    cands.push(...conj.slice(0, 1500));
    tools = searchOrbit(sites, cands, 600);
  }

  // Global support of the 4-atom tools: three orbit cells plus whatever they
  // disturb elsewhere. Level 2's recipe for a *globally* pure tool is to
  // interchange two such seeds that meet in exactly one cell overall.
  const globalSupports = tools.map((t) => {
    const action = actionOver(t.word, commutatorCandidates(t.a, t.b));
    const sup: number[] = [];
    for (const [site, [to, rot]] of action.moves) if (to !== site || rot !== ROT_ID) sup.push(site);
    return sup;
  });
  const tightest = globalSupports.length ? Math.min(...globalSupports.map((g) => g.length)) : 0;
  const medianGlobal = globalSupports.length
    ? [...globalSupports.map((g) => g.length)].sort((a, b) => a - b)[Math.floor(globalSupports.length / 2)]!
    : 0;

  // Interchange the orbit tools with each other, aiming for global purity.
  let interchanged = 0;
  const interPairs = new Set<number>();
  {
    // Interchange works best between *globally* tight words: two supports meet
    // in exactly one cell far more often when they are small. Level 2's seeds
    // have support <= 9; here the 4-atom tools run to 50-80, so pick the
    // tightest rather than the first found.
    const seeds = tools
      .map((t, k) => ({ word: t.word, a: t.a, b: t.b, support: globalSupports[k]! }))
      .sort((x, y) => x.support.length - y.support.length)
      .slice(0, 250);
    const seenCyc = new Set<string>();
    outer:
    for (let i = 0; i < seeds.length; i += 1) {
      for (let j = i + 1; j < seeds.length; j += 1) {
        let shared = 0;
        for (const x of seeds[i]!.support) { if (seeds[j]!.support.includes(x)) { shared += 1; if (shared > 1) break; } }
        if (shared !== 1) continue;
        const word = commutatorWord(seeds[i]!.word, seeds[j]!.word);
        const action = actionOver(word, supportCandidates(word));
        const src: number[] = [];
        const dst: number[] = [];
        let ok = true;
        for (const [site, [to, rot]] of action.moves) {
          if (to === site) { if (rot !== ROT_ID) { ok = false; break; } continue; }
          src.push(site); dst.push(to);
          if (src.length > 3) { ok = false; break; }
        }
        if (!ok || src.length !== 3) continue;
        if (src.some((x) => !orbitMask[x])) continue;
        const key = src.slice().sort((a, b) => a - b).join(',');
        if (seenCyc.has(key)) continue;
        seenCyc.add(key);
        interchanged += 1;
        for (let k = 0; k < 3; k += 1) { interPairs.add(src[k]! * N + dst[k]!); interPairs.add(dst[k]! * N + src[k]!); }
        if (interchanged >= 400) break outer;
      }
    }
  }

  const pairs = new Set<number>();
  for (const t of tools) {
    const perm = new Map(t.cycle.map((s, k) => [s, t.cycle[(k + 1) % 3]!]));
    for (const s of t.cycle) { pairs.add(s * N + perm.get(s)!); pairs.add(perm.get(s)! * N + s); }
  }
  results.push({
    size: sites.length, cls: siteClasses[sites[0]!]!, tools: tools.length,
    pureTools: tools.filter((t) => t.pure).length, pairs: pairs.size,
    wordLen: tools[0]?.word.length ?? 0, pass,
    globalSupport: tightest, interchanged, interchangedPairs: interPairs.size,
  });
}

// ---------- report ----------
console.log(`search time ${((performance.now() - started) / 1000).toFixed(0)}s\n`);
console.log('size  class          orbits  covered  4-atom tools  min glob supp  pure(16-atom)  pure pair cov');
const buckets = new Map<string, { orbits: number; covered: number; tools: number[]; pure: number[]; cov: number[]; words: Set<number>; gsup: number[]; inter: number[]; icov: number[] }>();
for (const r of results) {
  const key = `${String(r.size).padStart(4)}  ${r.cls.padEnd(12)}`;
  const b = buckets.get(key) ?? { orbits: 0, covered: 0, tools: [], pure: [], cov: [], words: new Set<number>(), gsup: [], inter: [], icov: [] };
  b.orbits += 1;
  if (r.tools > 0) { b.covered += 1; b.words.add(r.wordLen); }
  b.tools.push(r.tools); b.pure.push(r.pureTools);
  b.cov.push(r.pairs / (r.size * (r.size - 1)));
  b.gsup.push(r.globalSupport); b.inter.push(r.interchanged);
  b.icov.push(r.interchangedPairs / (r.size * (r.size - 1)));
  buckets.set(key, b);
}
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; };
for (const [key, b] of [...buckets].sort()) {
  console.log(
    `${key} ${String(b.orbits).padStart(6)} ${String(b.covered).padStart(8)} ${String(median(b.tools)).padStart(13)} ` +
      `${String(median(b.gsup)).padStart(12)} ${String(median(b.inter)).padStart(14)}  ${(100 * median(b.icov)).toFixed(1).padStart(12)}%`,
  );
}
const covered = results.filter((r) => r.tools > 0);
const fullyPure = results.filter((r) => r.pureTools > 0);
console.log(`\norbits with a tool:        ${covered.length}/164   (${covered.reduce((n, r) => n + r.size, 0)}/${N} cells)`);
console.log(`orbits with a *pure* tool: ${fullyPure.length}/164   (4-atom tools disturb other orbits, as expected)`);
const interOk = results.filter((r) => r.interchanged > 0);
console.log(`orbits with a globally pure 16-atom tool (interchanged): ${interOk.length}/164   (${interOk.reduce((n, r) => n + r.size, 0)}/${N} cells)`);
const miss = results.filter((r) => r.tools === 0);
if (miss.length) {
  const byKey = new Map<string, number>();
  for (const r of miss) byKey.set(`${r.cls}(${r.size})`, (byKey.get(`${r.cls}(${r.size})`) ?? 0) + 1);
  console.log(`still missing: ${[...byKey].map(([k, v]) => `${k}x${v}`).join(' ')}`);
}

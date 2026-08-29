/**
 * Step 2 deliverable: the per-orbit tool inventory.
 *
 * Run: `npx tsx research/scratch/l3-tool-inventory.ts` from the repo root.
 *
 * Three constructions produce pure 3-cycles, and they cover different orbits:
 *
 *   orbit-local  [atom, atom] judged pure *on one orbit* — 4 atoms, but it
 *                disturbs ~50-80 cells elsewhere, so it is only usable while
 *                those other orbits are still unsolved;
 *   interchange  two orbit-local tools meeting in exactly one cell overall —
 *                16 atoms and globally pure, usable at any point;
 *   class-level  the [frame, depth-2/2.5] family from l3-tools-probe.ts, also
 *                globally pure and reaching the large orbits the orbit-local
 *                interchange cannot.
 *
 * A solver needs, for every orbit, at least one tool it may use at that orbit's
 * turn in the phase order. This counts what is in hand.
 */
import {
  ROT_ID, actionOver, atoms, commutatorCandidates, commutatorWord, N,
  siteClasses, supportCandidates, atomsOfFamily, type Atom,
} from './l3sim';

// ---------- orbits ----------
const parent = new Int32Array(N).map((_, i) => i);
const findRoot = (x: number): number => { let r = x; while (parent[r] !== r) r = parent[r]!; while (parent[x] !== r) { const n = parent[x]!; parent[x] = r; x = n; } return r; };
for (const a of atoms) for (const [from, to] of a.map) { if (from === to) continue; const ra = findRoot(from); const rb = findRoot(to); if (ra !== rb) parent[ra] = rb; }
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
const O = orbitSites.length;
const orbitLocal = new Uint8Array(O);
const globallyPure = new Uint8Array(O);

const pure3 = (word: Atom[], cands: Set<number>) => {
  const action = actionOver(word, cands);
  const src: number[] = []; const dst: number[] = [];
  for (const [s, [to, rot]] of action.moves) {
    if (to === s) { if (rot !== ROT_ID) return null; continue; }
    src.push(s); dst.push(to);
    if (src.length > 3) return null;
  }
  if (src.length !== 3) return null;
  const perm = new Map(src.map((s, k) => [s, dst[k]!]));
  let cur = src[0]!;
  for (let k = 0; k < 3; k += 1) cur = perm.get(cur)!;
  return cur === src[0]! ? src : null;
};
const markPure = (src: number[]) => {
  const o = orbitOfSite[src[0]!]!;
  if (src.every((s) => orbitOfSite[s] === o)) globallyPure[o] = 1;
};

// ---------- construction 1+2: orbit-local, and their interchange ----------
const t0 = performance.now();
const mask = new Uint8Array(N);
for (let o = 0; o < O; o += 1) {
  const sites = orbitSites[o]!;
  mask.fill(0);
  for (const s of sites) mask[s] = 1;

  interface C { a: Atom[]; b: Atom[]; word: Atom[]; sup: number[] }
  const local: C[] = [];
  const cands: Array<{ atom: Atom; sup: number[] }> = [];
  for (const a of atoms) {
    const sup: number[] = [];
    for (const [from, to] of a.map) if (from !== to && mask[from]) sup.push(from);
    if (sup.length >= 1 && sup.length <= 24) cands.push({ atom: a, sup });
  }
  const bySite = new Map<number, number[]>();
  cands.forEach((c, i) => { for (const s of c.sup) { const l = bySite.get(s) ?? []; l.push(i); bySite.set(s, l); } });
  const seen = new Set<string>();
  for (const site of sites) {
    const list = bySite.get(site) ?? [];
    for (let x = 0; x < list.length && local.length < 400; x += 1) {
      for (let y = x + 1; y < list.length && local.length < 400; y += 1) {
        const A = cands[list[x]!]!; const B = cands[list[y]!]!;
        let sh = 0;
        for (const s of A.sup) { if (B.sup.includes(s)) { sh += 1; if (sh > 1) break; } }
        if (sh !== 1) continue;
        const small = A.atom.map.size <= B.atom.map.size;
        const [P, Q] = small ? [[B.atom], [A.atom]] : [[A.atom], [B.atom]];
        const word = commutatorWord(P, Q);
        const action = actionOver(word, commutatorCandidates(P, Q));
        const src: number[] = []; const dst: number[] = []; const sup: number[] = [];
        let ok = true;
        for (const [s, [to, rot]] of action.moves) {
          if (to !== s || rot !== ROT_ID) sup.push(s);
          if (!mask[s]) continue;
          if (to === s) { if (rot !== ROT_ID) { ok = false; break; } continue; }
          src.push(s); dst.push(to);
          if (src.length > 3) { ok = false; break; }
        }
        if (!ok || src.length !== 3) continue;
        const perm = new Map(src.map((s, k) => [s, dst[k]!]));
        let cur = src[0]!;
        for (let k = 0; k < 3; k += 1) cur = perm.get(cur)!;
        if (cur !== src[0]!) continue;
        const key = src.slice().sort((a, b) => a - b).join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        orbitLocal[o] = 1;
        if (sup.length === 3) globallyPure[o] = 1;
        local.push({ a: P, b: Q, word, sup });
      }
    }
  }
  // interchange the globally tightest of them
  local.sort((x, y) => x.sup.length - y.sup.length);
  const seeds = local.slice(0, 200);
  outer:
  for (let i = 0; i < seeds.length; i += 1) {
    for (let j = i + 1; j < seeds.length; j += 1) {
      let sh = 0;
      for (const s of seeds[i]!.sup) { if (seeds[j]!.sup.includes(s)) { sh += 1; if (sh > 1) break; } }
      if (sh !== 1) continue;
      const word = commutatorWord(seeds[i]!.word, seeds[j]!.word);
      const src = pure3(word, supportCandidates(word));
      if (src) { markPure(src); break outer; }
    }
  }
}
console.log(`orbit-local + interchange: ${((performance.now() - t0) / 1000).toFixed(0)}s`);

// ---------- construction 3: the class-level [frame, depth-2/2.5] family ----------
{
  const t1 = performance.now();
  const frameAtoms = atomsOfFamily('frame-s1', 'frame-s3', 'frame-s9');
  const localAtoms = atomsOfFamily('ext-d2', 'ext-d2.5');
  interface Seed { word: Atom[]; sup: number[] }
  const seeds: Seed[] = [];
  const seen = new Set<string>();
  for (const f of frameAtoms) for (const e of localAtoms) {
    let touches = false;
    for (const s of e.map.keys()) if (f.map.has(s)) { touches = true; break; }
    if (!touches) continue;
    const word = commutatorWord([f], [e]);
    const action = actionOver(word, commutatorCandidates([f], [e]));
    if (action.moves.size === 0 || action.moves.size > 9) continue;
    const sup = [...action.moves.keys()].sort((a, b) => a - b);
    const key = sup.map((i) => `${i}>${action.moves.get(i)![0]}#${action.moves.get(i)![1]}`).join(';');
    if (seen.has(key)) continue;
    seen.add(key);
    seeds.push({ word, sup });
  }
  const bySite = new Map<number, number[]>();
  seeds.forEach((s, i) => { for (const x of s.sup) { const l = bySite.get(x) ?? []; l.push(i); bySite.set(x, l); } });
  for (let i = 0; i < seeds.length; i += 1) {
    const w1 = seeds[i]!;
    const partners = new Set<number>();
    for (const s of w1.sup) for (const j of bySite.get(s) ?? []) if (j > i) partners.add(j);
    for (const j of partners) {
      const src = pure3(commutatorWord(w1.word, seeds[j]!.word), commutatorCandidates(w1.word, seeds[j]!.word));
      if (src) markPure(src);
    }
  }
  console.log(`class-level [frame, depth-2/2.5]: ${((performance.now() - t1) / 1000).toFixed(0)}s`);
}

// ---------- report ----------
console.log('\nsize  class          orbits  orbit-local  globally pure');
const rows = new Map<string, { n: number; loc: number; pure: number }>();
for (let o = 0; o < O; o += 1) {
  const key = `${String(orbitSites[o]!.length).padStart(4)}  ${siteClasses[orbitSites[o]![0]!]!.padEnd(12)}`;
  const r = rows.get(key) ?? { n: 0, loc: 0, pure: 0 };
  r.n += 1; r.loc += orbitLocal[o]!; r.pure += globallyPure[o]!;
  rows.set(key, r);
}
for (const [key, r] of [...rows].sort()) {
  console.log(`${key} ${String(r.n).padStart(6)} ${String(r.loc).padStart(12)} ${String(r.pure).padStart(14)}`);
}
const cellsOf = (m: Uint8Array) => orbitSites.reduce((n, s, o) => n + (m[o] ? s.length : 0), 0);
const anyTool = orbitSites.map((_, o) => (orbitLocal[o] || globallyPure[o] ? 1 : 0));
console.log(`\norbit-local tool:   ${orbitLocal.reduce((a, b) => a + b, 0)}/164 orbits, ${cellsOf(orbitLocal)}/${N} cells`);
console.log(`globally pure tool: ${globallyPure.reduce((a, b) => a + b, 0)}/164 orbits, ${cellsOf(globallyPure)}/${N} cells`);
console.log(`any tool at all:    ${anyTool.reduce((a, b) => a + b, 0)}/164 orbits, ${cellsOf(Uint8Array.from(anyTool))}/${N} cells`);
const none = orbitSites.map((s, o) => (anyTool[o] ? null : `${siteClasses[s[0]!]!}(${s.length})`)).filter(Boolean) as string[];
if (none.length) {
  const c = new Map<string, number>();
  for (const k of none) c.set(k, (c.get(k) ?? 0) + 1);
  console.log(`no tool yet: ${[...c].map(([k, v]) => `${k}x${v}`).join(' ')}`);
}

/**
 * Step 1, settled: the permutation group induced on every Level 3 orbit.
 *
 * Run: `npx tsx research/scratch/l3-orbit-groups.ts` from the repo root.
 *
 * Method, in increasing order of effort:
 *   1. orbits of the move group on the 8000 cells (a cell never leaves its own);
 *   2. primitivity, decided exactly via minimal G-congruences;
 *   3. the group itself:
 *        - orbits of size <= 8 are enumerated outright;
 *        - otherwise exhibit a p-cycle (p prime, p <= n-3) and apply Jordan's
 *          theorem: a primitive group containing one contains Alt(n).
 *
 * The p-cycle is obtained from a random element by the standard power trick: if
 * g has exactly one cycle of prime length p and K is the lcm of its other cycle
 * lengths with p not dividing K, then g^K kills every other cycle and leaves a
 * bare p-cycle. That is a constructive certificate, not a statistical one — the
 * element is exhibited and its support verified.
 */
import { atoms, N, siteClasses } from './l3sim';

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
const orbitSites: number[][] = [];
const orbitIndexOfRoot = new Map<number, number>();
for (let i = 0; i < N; i += 1) {
  const r = findRoot(i);
  let idx = orbitIndexOfRoot.get(r);
  if (idx === undefined) { idx = orbitSites.length; orbitSites.push([]); orbitIndexOfRoot.set(r, idx); }
  orbitSites[idx]!.push(i);
}

// ---------- helpers ----------
type Perm = Int32Array;
const compose = (a: Perm, b: Perm): Perm => { const r = new Int32Array(a.length); for (let i = 0; i < a.length; i += 1) r[i] = b[a[i]!]!; return r; };
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;
const isPrime = (p: number): boolean => { if (p < 2) return false; for (let d = 2; d * d <= p; d += 1) if (p % d === 0) return false; return true; };
const cycleLengths = (p: Perm): number[] => {
  const seen = new Uint8Array(p.length);
  const out: number[] = [];
  for (let i = 0; i < p.length; i += 1) {
    if (seen[i]) continue;
    let len = 0; let cur = i;
    do { seen[cur] = 1; cur = p[cur]!; len += 1; } while (cur !== i);
    out.push(len);
  }
  return out;
};
const power = (p: Perm, k: number): Perm => {
  let result = new Int32Array(p.length).map((_, i) => i);
  let base = p;
  let e = k;
  while (e > 0) { if (e & 1) result = compose(result, base); base = compose(base, base); e >>= 1; }
  return result;
};
// deterministic RNG so the certificates are reproducible
let rngState = 12345;
const rnd = (n: number): number => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState % n; };

const minimalCongruenceParts = (n: number, gens: Perm[], a: number, b: number): number => {
  const uf = new Int32Array(n).map((_, i) => i);
  const f = (x: number): number => { while (uf[x] !== x) { uf[x] = uf[uf[x]!]!; x = uf[x]!; } return x; };
  const union = (x: number, y: number): boolean => { const rx = f(x); const ry = f(y); if (rx === ry) return false; uf[rx] = ry; return true; };
  const stack: Array<[number, number]> = [];
  if (union(a, b)) stack.push([a, b]);
  while (stack.length) {
    const [x, y] = stack.pop()!;
    for (const g of gens) { const gx = g[x]!; const gy = g[y]!; if (union(gx, gy)) stack.push([gx, gy]); }
  }
  let parts = 0;
  for (let i = 0; i < n; i += 1) if (f(i) === i) parts += 1;
  return parts;
};

// ---------- per orbit ----------
interface Verdict { size: number; cls: string; primitive: boolean; blocks: number; settled: boolean; how: string }
const verdicts: Verdict[] = [];

for (const sites of orbitSites) {
  const n = sites.length;
  const cls = siteClasses[sites[0]!]!;
  const local = new Map(sites.map((s, i) => [s, i]));
  const gens: Perm[] = [];
  const seenGen = new Set<string>();
  for (const a of atoms) {
    const perm = new Int32Array(n);
    let moved = false;
    for (let i = 0; i < n; i += 1) {
      const dest = a.map.get(sites[i]!);
      const li = dest === undefined ? i : local.get(dest)!;
      perm[i] = li;
      if (li !== i) moved = true;
    }
    if (!moved) continue;
    const key = perm.join(',');
    if (seenGen.has(key)) continue;
    seenGen.add(key);
    gens.push(perm);
  }

  let bestParts = 1;
  for (let b = 1; b < n; b += 1) bestParts = Math.max(bestParts, minimalCongruenceParts(n, gens, 0, b));
  const primitive = bestParts === 1;

  // small orbits: enumerate outright
  if (n <= 8) {
    const identity = new Int32Array(n).map((_, i) => i);
    const seen = new Set<string>([identity.join(',')]);
    let frontier = [identity];
    while (frontier.length) {
      const next: Perm[] = [];
      for (const p of frontier) for (const g of gens) {
        const q = compose(p, g);
        const key = q.join(',');
        if (!seen.has(key)) { seen.add(key); next.push(q); }
      }
      frontier = next;
    }
    let fact = 1;
    for (let k = 2; k <= n; k += 1) fact *= k;
    verdicts.push({
      size: n, cls, primitive, blocks: bestParts, settled: seen.size >= fact / 2,
      how: seen.size === fact ? `Sym(${n}) enumerated` : seen.size === fact / 2 ? `Alt(${n}) enumerated` : `order ${seen.size} of ${fact}`,
    });
    continue;
  }

  // larger orbits: exhibit a p-cycle, then Jordan
  let how = '';
  for (let trial = 0; trial < 4000 && how === ''; trial += 1) {
    let g = new Int32Array(n).map((_, i) => i);
    const wordLength = 8 + rnd(40);
    for (let k = 0; k < wordLength; k += 1) g = compose(g, gens[rnd(gens.length)]!);
    const lens = cycleLengths(g);
    for (const p of new Set(lens)) {
      if (!isPrime(p) || p > n - 3) continue;
      if (lens.filter((l) => l === p).length !== 1) continue; // need exactly one such cycle
      let K = 1;
      for (const l of lens) if (l !== p) K = lcm(K, l);
      if (K % p === 0) continue;
      const h = power(g, K);
      let support = 0;
      for (let i = 0; i < n; i += 1) if (h[i] !== i) support += 1;
      const hLens = cycleLengths(h).filter((l) => l > 1);
      if (support === p && hLens.length === 1 && hLens[0] === p) {
        // Jordan: primitive + p-cycle (p prime, p <= n-3) gives Alt(n);
        // for p = 2 the transposition case gives the full Sym(n).
        how = p === 2 ? `primitive + transposition -> Sym(${n}) (Jordan)` : `primitive + ${p}-cycle -> Alt(${n}) (Jordan)`;
        break;
      }
    }
  }
  verdicts.push({ size: n, cls, primitive, blocks: bestParts, settled: how !== '' && primitive, how: how || 'no p-cycle certificate found' });
}

// ---------- report ----------
console.log(`orbits ${verdicts.length}, all primitive: ${verdicts.every((v) => v.primitive)}\n`);
const SEP = '\u0001'; // class names contain '|', so use a character they never hold
console.log('size  class          orbits  cells   verdict');
const buckets = new Map<string, { orbits: number; cells: number }>();
for (const v of verdicts) {
  const key = [String(v.size).padStart(4), v.cls.padEnd(12), v.settled ? 'Alt <= G' : 'OPEN    ', v.how].join(SEP);
  const b = buckets.get(key) ?? { orbits: 0, cells: 0 };
  b.orbits += 1; b.cells += v.size;
  buckets.set(key, b);
}
for (const [key, b] of [...buckets].sort()) {
  const [size, cls, status, how] = key.split(SEP);
  console.log(`${size}  ${cls} ${String(b.orbits).padStart(6)} ${String(b.cells).padStart(6)}   ${status} ${how}`);
}
const settled = verdicts.filter((v) => v.settled);
const open = verdicts.filter((v) => !v.settled);
const cells = (l: Verdict[]) => l.reduce((n, v) => n + v.size, 0);
console.log(`\nsettled: ${settled.length}/164 orbits, ${cells(settled)}/8000 cells`);
console.log(`open:    ${open.length}/164 orbits, ${cells(open)}/8000 cells`);

// With Alt(n) on every orbit, the permutation part of the state space is at
// least the product of n!/2 over orbits — a lower bound on the group order, and
// so on the information-theoretic lower bound for God's number.
if (open.length === 0) {
  const log10Factorial = (n: number): number => { let s = 0; for (let i = 2; i <= n; i += 1) s += Math.log10(i); return s; };
  let logPositions = 0;
  for (const v of verdicts) logPositions += log10Factorial(v.size) - Math.log10(2);
  const branching = Math.log10(atoms.length);
  console.log(`\nreachable cell arrangements >= 10^${logPositions.toFixed(0)} (product of |Alt(orbit)|)`);
  console.log(`legal move atoms: ${atoms.length}, so God's number >= ${Math.round(logPositions / branching)} moves`);
  console.log('(positions only — cell orientations multiply this further)');
}

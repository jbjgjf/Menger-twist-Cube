/**
 * The full orbit decomposition of the Level 3 cells under the legal move group.
 *
 * Run: `npx tsx research/scratch/l3-orbit-decomposition.ts` from the repo root.
 *
 * `l3-class-transitivity.ts` showed the move group does not act freely on the
 * classes: a CCC cell reaches only 8 of its class's 512 sites. So the unit that
 * matters for solving is not the class but the **orbit** — a cell can only ever
 * be permuted within one, and a 3-cycle can only exist inside one.
 */
import { atoms, classSites, N, siteClasses } from './l3sim';

const parent = new Int32Array(N).map((_, i) => i);
const find = (x: number): number => {
  let r = x;
  while (parent[r] !== r) r = parent[r]!;
  while (parent[x] !== r) { const n = parent[x]!; parent[x] = r; x = n; }
  return r;
};
for (const a of atoms) {
  for (const [from, to] of a.map) {
    if (from === to) continue;
    const ra = find(from);
    const rb = find(to);
    if (ra !== rb) parent[ra] = rb;
  }
}

const orbits = new Map<number, number[]>();
for (let i = 0; i < N; i += 1) {
  const r = find(i);
  const list = orbits.get(r) ?? [];
  list.push(i);
  orbits.set(r, list);
}

const sizeCount = new Map<number, number>();
for (const list of orbits.values()) sizeCount.set(list.length, (sizeCount.get(list.length) ?? 0) + 1);

console.log(`cells ${N}, orbits ${orbits.size}`);
console.log(`orbit size distribution: ${[...sizeCount].sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s}x${n}`).join('  ')}`);

// Every orbit sits inside one class (class invariance), so classes split into orbits.
const perClass = new Map<string, number[]>();
for (const list of orbits.values()) {
  const cls = siteClasses[list[0]!]!;
  if (list.some((s) => siteClasses[s] !== cls)) throw new Error('orbit crosses a class boundary');
  const sizes = perClass.get(cls) ?? [];
  sizes.push(list.length);
  perClass.set(cls, sizes);
}
console.log('\nclass         cells   orbits   orbit sizes');
for (const [cls, sites] of [...classSites].sort()) {
  const sizes = (perClass.get(cls) ?? []).sort((a, b) => a - b);
  const counts = new Map<number, number>();
  for (const s of sizes) counts.set(s, (counts.get(s) ?? 0) + 1);
  console.log(
    `${cls.padEnd(12)} ${String(sites.length).padStart(5)} ${String(sizes.length).padStart(8)}   ` +
      `${[...counts].map(([s, n]) => `${s}x${n}`).join(' ')}`,
  );
}

// The within-orbit ordered pairs are the only ones a tool could ever need.
let withinOrbitPairs = 0;
for (const list of orbits.values()) withinOrbitPairs += list.length * (list.length - 1);
console.log(`\nordered pairs a tool could ever need (within-orbit): ${withinOrbitPairs.toLocaleString()}`);
console.log(`ordered pairs if cells were freely permutable: ${(N * (N - 1)).toLocaleString()}`);
console.log(`=> the real problem is ${((N * (N - 1)) / withinOrbitPairs).toFixed(0)}x smaller than a naive class-level view suggests`);

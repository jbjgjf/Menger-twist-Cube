/**
 * Step 5c: inventory the tight Level 3 tools as coupled-orbit tools.
 *
 * Run: `npx tsx research/scratch/l3-coupled-pairs.ts` from the repo root.
 *
 * `l3-why-impure.ts` established that the tight rung-2 words rejected by the
 * per-orbit inventory move cells in exactly two position orbits.  This script
 * asks whether that second orbit is structural: for every one of the 40
 * blocking 96-cell orbits, it records which partner orbit occurs, the cycle
 * shape on both halves, and whether the induced correspondence is consistent.
 *
 * The expensive orbit-local search remains in `l3tools.ts`; this is only a new
 * consumer of that shared inventory, not a second implementation of it.
 */
import { readFileSync } from 'node:fs';
import {
  ROT_ID, actionOver, atoms, commutatorCandidates, commutatorWord, N,
  siteClasses,
} from './l3sim';
import { findOrbitLocalTools } from './l3tools';

// ---------- position orbits ----------
const parent = new Int32Array(N).map((_, i) => i);
const findRoot = (x: number): number => {
  let r = x;
  while (parent[r] !== r) r = parent[r]!;
  while (parent[x] !== r) { const next = parent[x]!; parent[x] = r; x = next; }
  return r;
};
for (const atom of atoms) for (const [from, to] of atom.map) {
  if (from === to) continue;
  const a = findRoot(from);
  const b = findRoot(to);
  if (a !== b) parent[a] = b;
}
const orbitOfSite = new Int32Array(N).fill(-1);
const orbitSites: number[][] = [];
{
  const index = new Map<number, number>();
  for (let site = 0; site < N; site += 1) {
    const root = findRoot(site);
    let orbit = index.get(root);
    if (orbit === undefined) {
      orbit = orbitSites.length;
      index.set(root, orbit);
      orbitSites.push([]);
    }
    orbitOfSite[site] = orbit;
    orbitSites[orbit]!.push(site);
  }
}

interface PhaseOrderCache { hasPure: number[] }
const cachePath = new URL('./l3-phase-order.cache.json', import.meta.url);
const cache = JSON.parse(readFileSync(cachePath, 'utf8')) as PhaseOrderCache;
const blocking = orbitSites.map((_, orbit) => orbit).filter((orbit) => !cache.hasPure[orbit]);

const permutationShape = (moves: Map<number, [number, number]>, sites: number[]): string => {
  const set = new Set(sites);
  const seen = new Set<number>();
  const cycles: number[] = [];
  for (const start of sites) {
    if (seen.has(start)) continue;
    let current = start;
    let length = 0;
    do {
      seen.add(current);
      const next = moves.get(current)?.[0] ?? current;
      if (!set.has(next)) throw new Error(`orbit action escapes: ${current} -> ${next}`);
      current = next;
      length += 1;
    } while (current !== start);
    if (length > 1) cycles.push(length);
  }
  return cycles.sort((a, b) => b - a).join('+');
};

console.log(`blocking orbits: ${blocking.length}\n`);
console.log('orbit class        partners (tight clean words; shape pairs)');

const coupling = new Map<number, Set<number>>();
let totalTight = 0;
for (const orbit of blocking) {
  const local = findOrbitLocalTools(orbitSites[orbit]!, 600);
  const seeds = [...local].sort((a, b) => a.gsup.length - b.gsup.length).slice(0, 150);
  const partners = new Map<number, { count: number; shapes: Map<string, number> }>();

  for (let i = 0; i < seeds.length; i += 1) {
    for (let j = i + 1; j < seeds.length; j += 1) {
      const action = actionOver(
        commutatorWord(seeds[i]!.word, seeds[j]!.word),
        commutatorCandidates(seeds[i]!.word, seeds[j]!.word),
      );
      if (action.moves.size === 0 || action.moves.size > 12) continue;
      let clean = true;
      const movedByOrbit = new Map<number, number[]>();
      for (const [site, [to, rot]] of action.moves) {
        if (to === site) {
          if (rot !== ROT_ID) clean = false;
          continue;
        }
        const destinationOrbit = orbitOfSite[to]!;
        const sourceOrbit = orbitOfSite[site]!;
        if (sourceOrbit !== destinationOrbit) throw new Error('a move crossed position orbits');
        const list = movedByOrbit.get(sourceOrbit) ?? [];
        list.push(site);
        movedByOrbit.set(sourceOrbit, list);
      }
      if (!clean || movedByOrbit.size !== 2 || !movedByOrbit.has(orbit)) continue;
      const other = [...movedByOrbit.keys()].find((candidate) => candidate !== orbit)!;
      const ownShape = permutationShape(action.moves, movedByOrbit.get(orbit)!);
      const otherShape = permutationShape(action.moves, movedByOrbit.get(other)!);
      const entry = partners.get(other) ?? { count: 0, shapes: new Map<string, number>() };
      entry.count += 1;
      const shape = `${ownShape}/${otherShape}`;
      entry.shapes.set(shape, (entry.shapes.get(shape) ?? 0) + 1);
      partners.set(other, entry);
      totalTight += 1;
    }
  }

  coupling.set(orbit, new Set(partners.keys()));
  const description = [...partners]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([other, data]) => {
      const shapes = [...data.shapes].sort((a, b) => b[1] - a[1]).map(([shape, count]) => `${shape}:${count}`).join(',');
      return `${other}:${siteClasses[orbitSites[other]![0]!]!} (${data.count}; ${shapes})`;
    })
    .join(' | ');
  console.log(`${String(orbit).padStart(3)} ${siteClasses[orbitSites[orbit]![0]!]!.padEnd(12)} ${description || '-'}`);
}

let deterministic = 0;
let mutual = 0;
for (const orbit of blocking) {
  const partners = coupling.get(orbit)!;
  if (partners.size !== 1) continue;
  deterministic += 1;
  const partner = [...partners][0]!;
  if (coupling.get(partner)?.size === 1 && coupling.get(partner)!.has(orbit)) mutual += 1;
}
console.log(`\ntight clean words: ${totalTight.toLocaleString()}`);
console.log(`deterministic partner: ${deterministic}/${blocking.length}`);
console.log(`mutual deterministic partner: ${mutual}/${blocking.length}`);

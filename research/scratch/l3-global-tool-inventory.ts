/**
 * Build one globally pure even-permutation tool for every Level 3 position
 * orbit and cache the atom words for the production solver.
 *
 * Run: `npx tsx research/scratch/l3-global-tool-inventory.ts`.
 * Delete `l3-global-tool-inventory.cache.json` to rebuild from scratch.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  ROT_ID, actionOver, atomById, atoms, N, siteClasses, supportCandidates,
} from './l3sim';
import {
  findClassLevelPureTools, findConjugateIsolatedTools, findOrbitLocalTools,
  findPureTools, type PureTool,
} from './l3tools';

// ---------- orbits ----------
const parent = new Int32Array(N).map((_, i) => i);
const root = (x: number): number => { let r = x; while (parent[r] !== r) r = parent[r]!; while (parent[x] !== r) { const n = parent[x]!; parent[x] = r; x = n; } return r; };
for (const atom of atoms) for (const [from, to] of atom.map) {
  if (from === to) continue;
  const a = root(from); const b = root(to); if (a !== b) parent[a] = b;
}
const orbitOfSite = new Int16Array(N).fill(-1);
const orbitSites: number[][] = [];
{
  const index = new Map<number, number>();
  for (let site = 0; site < N; site += 1) {
    const r = root(site); let orbit = index.get(r);
    if (orbit === undefined) { orbit = orbitSites.length; index.set(r, orbit); orbitSites.push([]); }
    orbitOfSite[site] = orbit; orbitSites[orbit]!.push(site);
  }
}

interface CachedTool { orbit: number; word: string[]; source: 'interchange' | 'conjugate-isolation' }
interface CacheFile { version: 1; tools: CachedTool[] }
const cachePath = new URL('./l3-global-tool-inventory.cache.json', import.meta.url);
let cached: CacheFile = { version: 1, tools: [] };
if (existsSync(cachePath)) cached = JSON.parse(readFileSync(cachePath, 'utf8')) as CacheFile;
const cachedByOrbit = new Map(cached.tools.map((tool) => [tool.orbit, tool]));

const tools: CachedTool[] = [];
let classLevelTools: Map<number, PureTool> | null = null;
const started = performance.now();
for (let orbit = 0; orbit < orbitSites.length; orbit += 1) {
  let record = cachedByOrbit.get(orbit);
  if (!record) {
    const local = findOrbitLocalTools(orbitSites[orbit]!, 600);
    let pure: PureTool[] = findPureTools(orbitSites[orbit]!, local, 1);
    let source: CachedTool['source'] = 'interchange';
    if (pure.length === 0) {
      pure = findConjugateIsolatedTools(orbitSites[orbit]!, local, 1);
      source = 'conjugate-isolation';
    }
    if (pure.length === 0) {
      classLevelTools ??= findClassLevelPureTools(
        orbitOfSite,
        new Set(orbitSites.map((_, candidate) => candidate)),
      );
      const classLevel = classLevelTools.get(orbit);
      if (classLevel) {
        pure = [classLevel];
        source = 'interchange';
      }
    }
    if (pure.length === 0) throw new Error(`no globally pure tool for orbit ${orbit} (${siteClasses[orbitSites[orbit]![0]!]})`);
    record = { orbit, word: pure[0]!.word.map((atom) => atom.id), source };
    cachedByOrbit.set(orbit, record);
    writeFileSync(cachePath, JSON.stringify({ version: 1, tools: [...cachedByOrbit.values()].sort((a, b) => a.orbit - b.orbit) }));
  }
  tools.push(record);
  console.log(
    `${String(orbit + 1).padStart(3)}/${orbitSites.length} ` +
    `${siteClasses[orbitSites[orbit]![0]!]!.padEnd(12)} size=${String(orbitSites[orbit]!.length).padStart(3)} ` +
    `${record.source.padEnd(19)} atoms=${record.word.length}`,
  );
}

// Exact global verification, independent of the bounded support used by search.
const widths = new Map<number, number>();
for (const record of tools) {
  const word = record.word.map((id) => {
    const atom = atomById.get(id);
    if (!atom) throw new Error(`unknown cached atom ${id}`);
    return atom;
  });
  const action = actionOver(word, supportCandidates(word));
  const moved: number[] = [];
  for (const [site, [to, rot]] of action.moves) {
    if (to === site) {
      if (rot !== ROT_ID) throw new Error(`orbit ${record.orbit}: stationary twist at ${site}`);
      continue;
    }
    moved.push(site);
    if (orbitOfSite[site] !== record.orbit) throw new Error(`orbit ${record.orbit}: global spill at ${site}`);
  }
  if (moved.length < 3) throw new Error(`orbit ${record.orbit}: trivial position action`);
  widths.set(moved.length, (widths.get(moved.length) ?? 0) + 1);
}

const bySource = new Map<string, number>();
for (const tool of tools) bySource.set(tool.source, (bySource.get(tool.source) ?? 0) + 1);
console.log(`\nverified globally pure tools: ${tools.length}/${orbitSites.length}`);
console.log(`sources: ${[...bySource].map(([source, count]) => `${source}=${count}`).join(', ')}`);
console.log(`support widths: ${[...widths].sort((a, b) => a[0] - b[0]).map(([width, count]) => `${width}:${count}`).join(' ')}`);
console.log(`elapsed: ${((performance.now() - started) / 1000).toFixed(1)}s`);

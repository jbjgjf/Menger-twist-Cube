import { mkdirSync, writeFileSync } from 'node:fs';
import { createSparseGroup, orientationFrames, parityBasis } from '../../packages/solver-core/src/algorithms/mengerSparseGroup';

const level = Number(process.argv.find((a) => a.startsWith('--level='))?.split('=')[1] ?? 4);
const group = createSparseGroup(level, console.log);
const frames = orientationFrames(group);
const basis = parityBasis(group);
const sizes: Record<string, number> = {};
const freedom: Record<string, { orbits: number; cells: number }> = {};
const families: Record<string, { atoms: number; selectedEntries: number }> = {};
for (const [i, sites] of group.orbits.entries()) {
  sizes[sites.length] = (sizes[sites.length] ?? 0) + 1;
  const order = frames[i]!.freedom.length;
  const b = freedom[order] ??= { orbits: 0, cells: 0 };
  b.orbits++; b.cells += sites.length;
}
for (const atom of group.atoms) {
  const family = families[atom.family] ??= { atoms: 0, selectedEntries: 0 };
  family.atoms++; family.selectedEntries += atom.map.size;
}
const logFactorial = (n: number): number => { let sum = 0; for (let i = 2; i <= n; i++) sum += Math.log10(i); return sum; };
const report = {
  schema: 1, level, cells: group.N, candidateTargets: group.canonical.turnTargets.length,
  legalAtoms: group.atoms.length, orbits: group.orbits.length, sizes, freedom,
  parityRank: basis.length, families,
  // This is only a candidate until independent globally pure cycles are certified.
  candidateLog10AlternatingProduct: group.orbits.reduce((s, o) => s + logFactorial(o.length) - Math.log10(2), 0),
  buildMs: group.buildMs, memory: process.memoryUsage(),
};
mkdirSync('research/level4/out', { recursive: true });
writeFileSync(`research/level4/out/census-L${level}.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));

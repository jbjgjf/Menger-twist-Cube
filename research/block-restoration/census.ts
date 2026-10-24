import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getCachedSparseGroup, parityBasis } from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
const rows = JSON.parse(readFileSync('research/results/block-restoration-counting-bound.json', 'utf8')) as Array<{ level: number; rank: number; atoms: number; orbits: number[][] }>;
for (const row of rows) {
  const group = getCachedSparseGroup(row.level);
  const sizes = new Map<number, number>();
  for (const orbit of group.orbits) sizes.set(orbit.length, (sizes.get(orbit.length) ?? 0) + 1);
  assert.deepEqual([...sizes].sort((a, b) => a[0] - b[0]), row.orbits);
  assert.equal(group.atoms.length, row.atoms);
  assert.equal(parityBasis(group).length, row.rank);
  console.log(`Level ${row.level}: orbit sizes, legal alphabet and parity rank agree with counting inputs`);
}

import { writeFileSync } from 'node:fs';
// Fixed-level positional group orders from the existing independent alternating
// orbit and parity certificates. This does not extrapolate those facts to n>4.
const rows = [
  { level: 3, rank: 15, atoms: 3591, orbits: [[8, 4], [24, 112], [96, 45], [192, 1], [384, 2]] },
  { level: 4, rank: 66, atoms: 44784, orbits: [[8, 8], [24, 2124], [96, 855], [384, 60], [768, 1], [1536, 2]] },
];
const factorial = (n: number): bigint => { let f = 1n; for (let i = 2; i <= n; i++) f *= BigInt(i); return f; };
const records = rows.map(row => {
  const N = 20 ** row.level; const B = N / 20;
  const positionOrder = row.orbits.reduce((g, [m, count]) => g * (factorial(m!) / 2n) ** BigInt(count!), 2n ** BigInt(row.rank));
  const ambientRigidOrder = 24n ** BigInt(B) * factorial(B);
  const cosetsAtLeast = (positionOrder + ambientRigidOrder - 1n) / ambientRigidOrder;
  const words = (d: number) => (BigInt(row.atoms) ** BigInt(d + 1) - 1n) / BigInt(row.atoms - 1);
  let hi = 1; while (words(hi) < cosetsAtLeast) hi *= 2;
  let lo = 0; while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (words(mid) < cosetsAtLeast) lo = mid + 1; else hi = mid; }
  if (!(words(lo - 1) < cosetsAtLeast && words(lo) >= cosetsAtLeast)) throw new Error('Counting boundary failed');
  return { ...row, cells: N, blocks: B, positionalOrderDigits: positionOrder.toString().length,
    ambientRigidOrderDigits: ambientRigidOrder.toString().length, cosetsLowerBoundDigits: cosetsAtLeast.toString().length,
    restorationDiameterLowerBound: lo,
    statement: `Some reachable Level ${row.level} states require at least ${lo} target turns to restore positional leaf-block rigidity, even with orientations ignored.` };
});
console.log(JSON.stringify(records, null, 2));
writeFileSync('research/results/block-restoration-counting-bound.json', JSON.stringify(records, null, 2)+'\n');

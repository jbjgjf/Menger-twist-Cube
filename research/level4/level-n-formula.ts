import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createPuzzleConfig, isMengerCell } from '../../packages/engine/src/generateMenger';

/** Exact for the standard frame/block/slab move system, n >= 1. */
export const legalCellRollTargets = (n: number): bigint => {
  if (!Number.isSafeInteger(n) || n < 1) throw new Error('Level must be a positive integer');
  return (100n * 20n ** BigInt(n - 1) + 272n * 8n ** BigInt(n - 1) + 648n * 3n ** BigInt(n - 1)) / 85n;
};
export const legalMoveAtoms = (n: number): bigint => {
  const frames = 9n * (3n ** BigInt(n) - 1n) / 2n;
  let coarserRolls = 0n;
  for (let d = 1; d < n; d++) coarserRolls += legalCellRollTargets(d);
  return 3n * (frames + legalCellRollTargets(n) + 4n * coarserRolls);
};

const rows = [];
for (let n = 1; n <= 10; n++) {
  const rolls = legalCellRollTargets(n); const atoms = legalMoveAtoms(n);
  if (n <= 5) {
    // Independent geometric enumeration of A_(n-1): a site with both its
    // negative Y and negative Z neighbours missing. Symmetry gives R_n=12A.
    let A = 0;
    if (n === 1) A = 1;
    else {
      const c = createPuzzleConfig(n - 1);
      const occupied = (x: number, y: number, z: number): boolean =>
        Math.abs(x) <= c.extent && Math.abs(y) <= c.extent && Math.abs(z) <= c.extent && isMengerCell([x, y, z], c);
      for (const x of c.coordinates) for (const y of c.coordinates) for (const z of c.coordinates) {
        if (occupied(x, y, z) && !occupied(x, y - 1, z) && !occupied(x, y, z - 1)) A++;
      }
    }
    if (rolls !== 12n * BigInt(A)) throw new Error(`Direct boundary enumeration differs at n=${n}`);
  }
  if (n <= 4) {
    const census = JSON.parse(readFileSync(`research/level4/out/census-L${n}.json`, 'utf8'));
    if (atoms !== BigInt(census.legalAtoms)) throw new Error(`Engine census differs at n=${n}`);
    for (let d = 1; d <= n; d++) {
      if (BigInt(census.families[`ext-d${d}`].atoms) !== 3n * legalCellRollTargets(d)) throw new Error('Block depth census differs');
      if (d < n && BigInt(census.families[`ext-d${d + 0.5}`].atoms) !== 9n * legalCellRollTargets(d)) throw new Error('Slab depth census differs');
    }
  }
  let rollOnlyGodsLowerBound: number | undefined;
  if (n <= 5) {
    const states = 4n ** rolls;
    let d = Math.ceil(Number(rolls) * Math.log10(4) / Math.log10(Number(atoms)));
    const ball = (r: number): bigint => (atoms ** BigInt(r + 1) - 1n) / (atoms - 1n);
    while (d > 0 && ball(d - 1) >= states) d--;
    while (ball(d) < states) d++;
    rollOnlyGodsLowerBound = d;
  }
  rows.push({ level: n, cells: (20n ** BigInt(n)).toString(), independentCellRollTargets: rolls.toString(), legalAtoms: atoms.toString(), rollOnlyGodsLowerBound });
}
mkdirSync('research/level4/out', { recursive: true });
writeFileSync('research/level4/out/level-n-formula.json', JSON.stringify({
  formula: 'R_n = (100*20^(n-1) + 272*8^(n-1) + 648*3^(n-1))/85',
  atomFormula: 'M_n = 3*(9*(3^n-1)/2 + R_n + 4*sum_(d=1)^(n-1) R_d)',
  directBoundaryEnumerationThroughLevel: 5, engineCensusAgreementThroughLevel: 4,
  theorem: 'G_n = Omega(20^n/n), from the independent subgroup C4^(R_n) and the exact move alphabet M_n', rows,
}, null, 2) + '\n');
console.log(JSON.stringify(rows, null, 2));

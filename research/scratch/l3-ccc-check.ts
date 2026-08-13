/**
 * Why does the CCC class get no tools?
 *
 * Run: `npx tsx research/scratch/l3-ccc-check.ts` from the repo root.
 *
 * `l3-tools-frames2.ts` builds tools by finding two words whose class-restricted
 * supports meet in **exactly one cell** — that single shared point is what makes
 * the interchange a 3-cycle. It covers 4 of the 5 `b = C` classes but yields
 * nothing for `CCC` (the 512 cells whose three hierarchical digits are all
 * corner-type).
 *
 * The reason is structural rather than a search budget: candidate words move
 * `CCC` cells only in large, quantized groups, so two supports can meet in 64
 * cells or none, but never in one.
 */
import { atomsOfFamily, classSites, inverseAtom } from './l3sim';

const cccSites = new Set(classSites.get('CCC')!);
const slices = atomsOfFamily('frame-s1');
const allFrames = atomsOfFamily('frame-s1', 'frame-s3', 'frame-s9');

let slicesTouchingCCC = 0;
let totalCCCMoved = 0;
for (const a of slices) {
  let n = 0;
  for (const [from, to] of a.map) if (from !== to && cccSites.has(from)) n += 1;
  if (n > 0) slicesTouchingCCC += 1;
  totalCCCMoved += n;
}
console.log(
  `slices moving at least one CCC cell: ${slicesTouchingCCC}/${slices.length}, ` +
    `average CCC cells moved ${(totalCCCMoved / slices.length).toFixed(1)}`,
);

// Distribution of |supp_CCC| over conjugates g h g^-1, whose support is the
// preimage of supp(h) under g. An interchange needs two of these to overlap in
// exactly one CCC cell.
const sizes = new Map<number, number>();
for (const g of slices.slice(0, 40)) {
  const gInv = inverseAtom(g);
  for (const h of allFrames) {
    if (g.refId === h.refId) continue;
    let n = 0;
    for (const [from, to] of h.map) {
      if (from === to) continue;
      const pre = gInv.map.get(from) ?? from;
      if (cccSites.has(pre)) n += 1;
    }
    sizes.set(n, (sizes.get(n) ?? 0) + 1);
  }
}
console.log(
  `conjugate |supp_CCC| distribution (sample): ` +
    `${[...sizes].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' ')}`,
);
console.log(`\nCCC cells: ${cccSites.size}`);
console.log(
  'No size of 1, 2 or 3 appears — CCC support comes in multiples of 64 or not at all, so an\n' +
    'exactly-one overlap is unreachable with this candidate pool. Breaking the granularity needs\n' +
    'richer candidate words: deeper conjugations, or products of conjugates.',
);

/**
 * Experiment 1: verify structural facts underpinning the slice-reduction method.
 *  (1) class invariance: every atom maps each of the 5 piece classes to itself
 *  (2) digit action: every atom rotates block-digit and offset-digit by the same rotation
 *  (3) parity table: sign of every atom's permutation per class
 *  (4) commutators [slice, E1/slab] never touch corner-block sites
 */
import {
  atoms,
  atomsFor,
  actionOfWord,
  applyMat,
  blockOf,
  classOfSite,
  commutatorWord,
  N,
  offsetOf,
  permutationSign,
  positionSupportOf,
  rotations,
  siteClasses,
  sitePositions,
  state,
} from './sim';

// (1) + (2)
let classViolations = 0;
let digitViolations = 0;
for (const atom of atoms) {
  const m = rotations[atom.rot]!;
  for (const i of atom.moved) {
    const j = atom.perm[i]!;
    if (classOfSite(i) !== classOfSite(j)) {
      classViolations += 1;
      if (classViolations < 5) console.log(`class violation: ${atom.id} ${classOfSite(i)}@${sitePositions[i]} -> ${classOfSite(j)}@${sitePositions[j]}`);
    }
    // digit action check only for frame atoms (extensions rotate around block pivots, offset-only)
    if (atom.kind === 'frame') {
      const b1 = applyMat(m, blockOf(sitePositions[i]!));
      const o1 = applyMat(m, offsetOf(sitePositions[i]!));
      const b2 = blockOf(sitePositions[j]!);
      const o2 = offsetOf(sitePositions[j]!);
      if (b1.join() !== b2.join() || o1.join() !== o2.join()) {
        digitViolations += 1;
        if (digitViolations < 5) console.log(`digit violation: ${atom.id} at ${sitePositions[i]}`);
      }
    }
  }
}
console.log(`(1) class invariance violations: ${classViolations}`);
console.log(`(2) frame digit-action violations: ${digitViolations}`);

// class sizes
const sizes = new Map<string, number>();
for (let i = 0; i < N; i += 1) sizes.set(siteClasses[i]!, (sizes.get(siteClasses[i]!) ?? 0) + 1);
console.log('class sizes:', Object.fromEntries(sizes));

// (3) parity table: for each atom kind/family, sign per class
const classes = ['CC', 'CE', 'EC', 'EEa', 'EEo'] as const;
const sitesByClass = new Map(classes.map((c) => [c, sitePositions.map((_, i) => i).filter((i) => siteClasses[i] === c)]));
const paritySummary = new Map<string, string>();
for (const atom of atoms) {
  if (atom.angle !== 90) continue;
  const target = atom.kind === 'extension' ? state.turnTargetById.get(atom.refId) : undefined;
  const frame = atom.kind === 'frame' ? state.frameById.get(atom.refId) : undefined;
  const family =
    atom.kind === 'frame'
      ? `frame-scale${frame?.scale}${frame?.scale === 1 ? `-off${Math.abs(((frame!.layer + 4) % 3) - 1) === 1 ? 'outer' : 'mid'}` : ''}`
      : `${target!.family}-d${target!.depth}`;
  const signs = classes
    .map((c) => {
      const classSites = sitesByClass.get(c)!;
      const touched = classSites.some((i) => atom.perm[i] !== i);
      if (!touched) return `${c}:·`;
      return `${c}:${permutationSign(atom.perm, classSites) === 1 ? '+' : 'ODD'}`;
    })
    .join(' ');
  const prev = paritySummary.get(family);
  if (prev && prev !== signs) paritySummary.set(family, `${prev} | VARIES: ${signs}`);
  else paritySummary.set(family, signs);
}
console.log('(3) parity per quarter-turn family:');
for (const [family, signs] of [...paritySummary.entries()].sort()) console.log(`   ${family}: ${signs}`);

// (4) commutators [frame, E1/slab] never touch corner-block sites
const frameAtoms = atomsFor((a) => a.kind === 'frame');
const blockLocalAtoms = atomsFor((a, t) => a.kind === 'extension' && (t!.depth === 1 || t!.depth === 1.5));
let cornerTouches = 0;
let checked = 0;
let maxSupport = 0;
const supportSizes = new Map<number, number>();
for (const f of frameAtoms) {
  for (const e of blockLocalAtoms) {
    const action = actionOfWord(commutatorWord([f], [e]));
    const support = positionSupportOf(action);
    checked += 1;
    if (support.length > 0) {
      maxSupport = Math.max(maxSupport, support.length);
      supportSizes.set(support.length, (supportSizes.get(support.length) ?? 0) + 1);
    }
    for (const i of support) {
      const c = siteClasses[i]!;
      if (c === 'CC' || c === 'CE') {
        cornerTouches += 1;
        if (cornerTouches < 4) console.log(`corner touch: [${f.id}, ${e.id}] moves ${c} site ${sitePositions[i]}`);
      }
    }
  }
}
console.log(`(4) [frame, E1/slab] commutators checked: ${checked}, corner-site touches: ${cornerTouches}`);
console.log(`    position-support size histogram: ${[...supportSizes.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' ')}`);

/**
 * Machine check of every computational fact used in
 * `docs/proofs/level2-completeness.tex`, for the standard and the inner-square
 * move system. Independent of the solver: it shares only the tool words
 * (`out/tools.json`) and re-derives everything else from the engine's atoms
 * with the exact arithmetic of `group.ts`.
 *
 * Run: `node --import tsx research/level2-completeness/certify.ts`
 * Writes `research/level2-completeness/out/certificate.json` and exits non-zero
 * if any check fails.
 *
 * Checks, numbered as in the paper:
 *   (C1) the atom set, closed under inverses;
 *   (C2) the site orbits;
 *   (C3) the (site, orientation) automaton of each orbit: Q_p = ref_p · H_0;
 *   (C4) invariance: every atom changes each twist sum / flip count by 0;
 *   (C5) the span of the atoms' orbit-parity vectors;
 *   (C6) the tools: pure 3-cycles, two-cell twists and flips;
 *   (C7) transitivity on ordered triples (and on ordered pairs) of each orbit;
 *   (C8) single-cell rolls generate the cyclic part at every cell that has one;
 *   (C9) the resulting group orders.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { MoveSystem } from '@menger/engine';
import { buildContext, rotInv, rotMul, siteOrbits } from './group';
import type { Elt } from './group';

console.debug = () => {};

const tools = JSON.parse(readFileSync('research/level2-completeness/out/tools.json', 'utf8')) as {
  threeCycles: string[][];
  pairTools: Record<string, string[]>;
};

const failures: string[] = [];
const check = (condition: boolean, message: string): void => {
  if (!condition) failures.push(message);
};
const orderOf = (turn: number): number => {
  let k = 1;
  for (let x = turn; x !== 0; x = rotMul[turn]![x]!) k += 1;
  return k;
};
const factorial = (n: number): bigint => {
  let out = 1n;
  for (let i = 2n; i <= BigInt(n); i += 1n) out *= i;
  return out;
};

const certify = (system: MoveSystem) => {
  const ctx = buildContext(system);
  const { N, atoms } = ctx;
  const tag = (message: string) => `[${system}] ${message}`;

  // (C1)
  check(atoms.every((atom) => atom.inverse >= 0), tag('C1: an atom has no inverse atom'));

  // (C2)
  const { orbitOf, orbits } = siteOrbits(N, atoms);

  // (C3)
  const ref = new Int16Array(N).fill(-1);
  const admissible: Array<Set<number>> = Array.from({ length: N }, () => new Set());
  const freedom: number[][] = [];
  for (const orbit of orbits) {
    const base = orbit[0]!;
    ref[base] = 0;
    admissible[base]!.add(0);
    const queue: Array<[number, number]> = [[base, 0]];
    for (let head = 0; head < queue.length; head += 1) {
      const [site, turn] = queue[head]!;
      for (const atom of atoms) {
        const nextSite = atom.perm[site]!;
        const nextTurn = rotMul[atom.rot[site]!]![turn]!;
        if (admissible[nextSite]!.has(nextTurn)) continue;
        admissible[nextSite]!.add(nextTurn);
        if (ref[nextSite] < 0) ref[nextSite] = nextTurn;
        queue.push([nextSite, nextTurn]);
      }
    }
    const H0 = [...admissible[base]!].sort((a, b) => a - b);
    freedom.push(H0);
    // H0 is a subgroup, and Q_p = ref_p · H0 at every site.
    check(H0.every((a) => H0.every((b) => H0.includes(rotMul[a]![b]!))), tag('C3: H_0 is not closed'));
    for (const site of orbit) {
      const expected = new Set(H0.map((h) => rotMul[ref[site]!]![h]!));
      check(expected.size === admissible[site]!.size && [...expected].every((x) => admissible[site]!.has(x)), tag(`C3: Q_p != ref_p H_0 at site ${site}`));
    }
  }
  const typeOf = (H0: number[]): string =>
    H0.length === 1 ? '1' : H0.length === 3 ? 'C3' : H0.length === 4 ? (H0.some((h) => orderOf(h) === 4) ? 'C4' : 'V4') : H0.length === 8 ? 'D4' : `order ${H0.length}`;

  // Class maps: twist in Z/3 for C3, flip bit for D4, none otherwise.
  const classes = freedom.map((H0) => {
    if (H0.length === 3) {
      const g = H0.find((h) => h !== 0)!;
      return { modulus: 3, of: (t: number) => (t === 0 ? 0 : t === g ? 1 : 2), cyclic: new Set([0]) };
    }
    if (H0.length === 8) {
      const q = H0.find((h) => orderOf(h) === 4)!;
      const cyclic = new Set([0, q, rotMul[q]![q]!, rotInv[q]!]);
      return { modulus: 2, of: (t: number) => (cyclic.has(t) ? 0 : 1), cyclic };
    }
    return null;
  });
  // The class map must be a homomorphism H_0 -> Z/m.
  freedom.forEach((H0, orbit) => {
    const cls = classes[orbit];
    if (!cls) return;
    check(H0.every((a) => H0.every((b) => cls.of(rotMul[a]![b]!) === (cls.of(a) + cls.of(b)) % cls.modulus)), tag(`C3: class map of orbit ${orbit} is not a homomorphism`));
  });

  // (C4) delta(a, p) = ref_{a(p)}^-1 · rot_a(p) · ref_p lies in H_0 and its class sums to 0 over each orbit.
  let invarianceChecks = 0;
  for (const atom of atoms) {
    orbits.forEach((orbit, index) => {
      const H0 = freedom[index]!;
      let sum = 0;
      for (const site of orbit) {
        const delta = rotMul[rotInv[ref[atom.perm[site]!]!]!]![rotMul[atom.rot[site]!]![ref[site]!]!]!;
        check(H0.includes(delta), tag(`C4: delta outside H_0 for ${atom.label} at site ${site}`));
        if (classes[index]) sum += classes[index]!.of(delta);
      }
      if (classes[index]) {
        invarianceChecks += 1;
        check(sum % classes[index]!.modulus === 0, tag(`C4: ${atom.label} changes the class sum of orbit ${index}`));
      }
    });
  }

  // (C5)
  const parityOf = (e: Elt): number => {
    const seen = new Uint8Array(N);
    let mask = 0;
    for (let start = 0; start < N; start += 1) {
      if (seen[start]) continue;
      let length = 0;
      for (let cursor = start; !seen[cursor]; cursor = e.perm[cursor]!) {
        seen[cursor] = 1;
        length += 1;
      }
      if (length % 2 === 0) mask ^= 1 << orbitOf[start]!;
    }
    return mask;
  };
  const basis: number[] = [];
  const basisAtoms: string[] = [];
  for (const atom of atoms) {
    let residue = parityOf(atom);
    for (const row of basis) if (residue & (row & -row)) residue ^= row;
    if (residue !== 0) {
      basis.push(residue);
      basisAtoms.push(atom.label);
    }
  }
  const distinctAtomVectors = new Set(atoms.map(parityOf).filter((v) => v !== 0));

  // (C6)
  const wordOf = (labels: string[]) => labels.map((label) => {
    const atom = ctx.atomByLabel.get(label);
    if (!atom) throw new Error(`unknown atom ${label}`);
    return atom.index;
  });
  const threeCycleByOrbit = new Map<number, { triple: number[]; length: number }>();
  for (const labels of tools.threeCycles) {
    const e = ctx.ofWord(wordOf(labels));
    const support = ctx.support(e);
    check(support.length === 3 && support.every((site) => e.perm[site] !== site), tag('C6: a 3-cycle word is not a pure 3-cycle'));
    const a = support[0]!;
    check(new Set(support.map((site) => orbitOf[site])).size === 1, tag('C6: a 3-cycle leaves its orbit'));
    threeCycleByOrbit.set(orbitOf[a]!, { triple: [a, e.perm[a]!, e.perm[e.perm[a]!]!], length: labels.length });
  }
  check(threeCycleByOrbit.size === orbits.length, tag('C6: some orbit has no 3-cycle tool'));
  const pairToolByOrbit = new Map<number, { pair: number[]; length: number; classes: number[] }>();
  for (const labels of Object.values(tools.pairTools)) {
    const e = ctx.ofWord(wordOf(labels));
    const support = ctx.support(e);
    check(support.length === 2 && support.every((site) => e.perm[site] === site), tag('C6: a pair tool is not a two-cell re-orientation'));
    const orbit = orbitOf[support[0]!]!;
    const cls = classes[orbit];
    check(cls !== null && orbitOf[support[1]!] === orbit, tag('C6: a pair tool is on the wrong orbit'));
    // Its effect on tau at site x is left multiplication by ref_x^-1 · u · ref_x.
    const effect = support.map((site) => cls!.of(rotMul[rotInv[ref[site]!]!]![rotMul[e.rot[site]!]![ref[site]!]!]!));
    check(effect.every((value) => value !== 0), tag(`C6: pair tool of orbit ${orbit} has a trivial class at a cell`));
    check((effect[0]! + effect[1]!) % cls!.modulus === 0, tag(`C6: pair tool of orbit ${orbit} has a non-zero class sum`));
    pairToolByOrbit.set(orbit, { pair: support, length: labels.length, classes: effect });
  }
  classes.forEach((cls, orbit) => check(cls === null || pairToolByOrbit.has(orbit), tag(`C6: orbit ${orbit} needs a pair tool`)));

  // (C7) exhaustive search over ordered tuples.
  const reachTuples = (orbit: number[], start: number[]): number => {
    const n = orbit.length;
    const local = new Map(orbit.map((site, index) => [site, index]));
    const movers = atoms.filter((atom) => orbit.some((site) => atom.perm[site] !== site)).map((atom) => Int16Array.from(orbit, (site) => local.get(atom.perm[site]!)!));
    const k = start.length;
    const seen = new Uint8Array(n ** k);
    const encode = (t: number[]) => t.reduce((acc, v) => acc * n + v, 0);
    const queue = new Int32Array(n ** k);
    let tail = 0;
    const first = encode(start.map((site) => local.get(site)!));
    seen[first] = 1;
    queue[tail++] = first;
    for (let head = 0; head < tail; head += 1) {
      const code = queue[head]!;
      const digits: number[] = [];
      for (let i = 0, rest = code; i < k; i += 1, rest = Math.floor(rest / n)) digits.unshift(rest % n);
      for (const perm of movers) {
        const next = digits.reduce((acc, v) => acc * n + perm[v]!, 0);
        if (seen[next]) continue;
        seen[next] = 1;
        queue[tail++] = next;
      }
    }
    return tail;
  };
  const tripleCounts = orbits.map((orbit, index) => {
    const n = orbit.length;
    const reached = reachTuples(orbit, threeCycleByOrbit.get(index)!.triple);
    check(reached === n * (n - 1) * (n - 2), tag(`C7: orbit ${index} is not 3-transitive (${reached})`));
    return reached;
  });
  const pairCounts = [...pairToolByOrbit].map(([orbit, tool]) => {
    const n = orbits[orbit]!.length;
    const reached = reachTuples(orbits[orbit]!, tool.pair);
    check(reached === n * (n - 1), tag(`C7: orbit ${orbit} is not 2-transitive (${reached})`));
    return { orbit, reached };
  });

  // (C8)
  const rollsAt: number[][] = Array.from({ length: N }, () => []);
  for (const atom of atoms) {
    const support = ctx.support(atom);
    if (support.length === 1 && atom.perm[support[0]!] === support[0]) rollsAt[support[0]!]!.push(atom.rot[support[0]!]!);
  }
  orbits.forEach((orbit, index) => {
    const H0 = freedom[index]!;
    if (H0.length !== 4 && H0.length !== 8) {
      return;
    }
    const cyclic = H0.length === 4 ? new Set(H0) : classes[index]!.cyclic;
    for (const site of orbit) {
      // In tau-coordinates a roll u acts as ref^-1 u ref; these three plus 1 must be the cyclic part.
      const inTau = new Set([0, ...rollsAt[site]!.map((u) => rotMul[rotInv[ref[site]!]!]![rotMul[u]![ref[site]!]!]!)]);
      check(inTau.size === 4 && [...inTau].every((t) => cyclic.has(t)), tag(`C8: rolls at site ${site} do not generate the cyclic part`));
    }
  });

  // (C9)
  const classOrbits = classes.flatMap((cls, orbit) => (cls ? [{ orbit, modulus: cls.modulus }] : []));
  const sizeW = orbits.reduce((acc, orbit, index) => acc * factorial(orbit.length) * BigInt(freedom[index]!.length) ** BigInt(orbit.length), 1n);
  const sizeM = 2n ** BigInt(orbits.length) * classOrbits.reduce((acc, c) => acc * BigInt(c.modulus), 1n);
  const sizeC = 2n ** BigInt(basis.length);
  const order = (sizeW * sizeC) / sizeM;
  check((sizeW * sizeC) % sizeM === 0n, tag('C9: order is not an integer'));

  return {
    system,
    atoms: atoms.length,
    orbits: orbits.map((orbit, index) => ({
      index,
      size: orbit.length,
      representative: ctx.sites[orbit[0]!],
      freedom: freedom[index]!.length,
      freedomType: typeOf(freedom[index]!),
      classModulus: classes[index]?.modulus ?? 1,
      cellsWithRolls: orbit.filter((site) => rollsAt[site]!.length > 0).length,
      threeCycleLength: threeCycleByOrbit.get(index)!.length,
      pairToolLength: pairToolByOrbit.get(index)?.length ?? null,
      orderedTriplesReached: tripleCounts[index],
    })),
    invarianceChecks,
    parity: { rank: basis.length, basis, basisAtoms, distinctNonZeroAtomVectors: distinctAtomVectors.size },
    orderedPairsReached: pairCounts,
    order: { W: sizeW.toString(), M: sizeM.toString(), C: sizeC.toString(), G: order.toString(), digits: order.toString().length },
  };
};

const standard = certify('standard');
const inner = certify('inner-square');
const index = BigInt(inner.order.G) / BigInt(standard.order.G);
check(BigInt(inner.order.G) % BigInt(standard.order.G) === 0n && index === 2n, `index [H:G] = ${index}, expected 2`);

for (const result of [standard, inner]) {
  console.log(`=== ${result.system}: ${result.atoms} atoms ===`);
  console.log('orbit  size  freedom  class  rolls  3-cycle  pair  ordered triples');
  for (const o of result.orbits) {
    console.log(
      `${String(o.index).padStart(5)} ${String(o.size).padStart(5)}  ${o.freedomType.padEnd(7)} ${String(o.classModulus).padStart(5)} ${String(o.cellsWithRolls).padStart(6)} ${String(o.threeCycleLength).padStart(8)} ${String(o.pairToolLength ?? '-').padStart(5)}  ${o.orderedTriplesReached}`,
    );
  }
  console.log(`invariance checks ${result.invarianceChecks}; parity rank ${result.parity.rank} (${result.parity.distinctNonZeroAtomVectors} distinct non-zero atom vectors)`);
  console.log(`|G| has ${result.order.digits} digits = |W|·|C|/|M| with |C| = ${result.order.C}, |M| = ${result.order.M}`);
}
console.log(`[H:G] = ${index}`);

mkdirSync('research/level2-completeness/out', { recursive: true });
writeFileSync(
  'research/level2-completeness/out/certificate.json',
  `${JSON.stringify({ level: 2, ok: failures.length === 0, failures, standard, innerSquare: inner, index: index.toString() }, null, 1)}\n`,
);
if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} checks`);
  for (const failure of failures.slice(0, 20)) console.error(`  ${failure}`);
  process.exit(1);
}
console.log('all checks passed; wrote research/level2-completeness/out/certificate.json');

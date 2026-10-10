/**
 * Finds the static tool words the Level 3 completeness proof needs beyond the
 * 164 pure tools already shipped in `level3SliceReductionToolData.ts`:
 *
 *   - a globally pure 3-cycle for each of the 31 orbits whose shipped tool is a
 *     double transposition (width 4) or a pair of 3-cycles (width 6);
 *   - a two-cell twister (c, -c) for each of the four C3 orbits;
 *   - the index of a shipped D4 twister that flips exactly two cells.
 *
 * Run: `node --import tsx research/level3-completeness/find-tools.ts`
 * Writes `research/level3-completeness/out/tools.json` and the production
 * module `packages/solver-core/src/algorithms/level3SliceReductionCertifiedData.ts`.
 *
 * The search is deterministic (breadth-first, no random numbers). Nothing found
 * here is trusted: `certify.ts` re-checks every word on all 8000 cells.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  level3D4Orbit,
  level3D4TwisterWords,
  level3PureToolWords,
} from '../../packages/solver-core/src/algorithms/level3SliceReductionToolData';
import { ROT_ID, atoms, frameOf, fullAction, inverseAtom, inverseWord, orbitOf, orbits, resolveWord, rotMul } from './group';
import type { Action, Atom } from './group';

const movedSites = (action: Action): number[] => [...action].filter(([site, [to]]) => site !== to).map(([site]) => site);

/** A globally pure 3-cycle inside `orbit`: three cells move, nothing else changes at all. */
const isPureThreeCycle = (action: Action, orbit: number): boolean => {
  if (movedSites(action).length !== 3) return false;
  for (const [site, [to, rot]] of action) {
    if (site === to) { if (rot !== ROT_ID) return false; continue; }
    if (orbitOf[site] !== orbit) return false;
  }
  return true;
};

/** One representative atom per distinct position action on the orbit. */
const setupAlphabet = (orbit: number): Atom[] => {
  const seen = new Set<string>();
  const out: Atom[] = [];
  for (const atom of atoms) {
    const key = orbits[orbit]!
      .filter((site) => (atom.map.get(site) ?? site) !== site)
      .map((site) => `${site}>${atom.map.get(site)}`)
      .join(',');
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(atom);
  }
  return out;
};

// ---------- 3-cycles for the wide-tool orbits ----------

interface Variant { word: Atom[]; perm: Map<number, number> }

/**
 * Two conjugates A, B of the wide tool whose product moves exactly three cells.
 * For a double transposition that means sharing one transposition; for a pair
 * of 3-cycles, sharing one 3-cycle inverted. Conjugates are enumerated breadth
 * first by setup length, so the first hit per depth is among the shortest.
 */
const deriveThreeCycle = (orbit: number, tool: Atom[]): Atom[] => {
  const alphabet = setupAlphabet(orbit);
  const permOf = (word: Atom[]): Map<number, number> => {
    const perm = new Map<number, number>();
    for (const [site, [to]] of fullAction(word)) if (site !== to) perm.set(site, to);
    return perm;
  };
  const keyOf = (perm: Map<number, number>): string => [...perm].sort((a, b) => a[0] - b[0]).map(([s, t]) => `${s}>${t}`).join(',');

  const variants: Variant[] = [];
  const seen = new Set<string>();
  const push = (word: Atom[], perm: Map<number, number>): boolean => {
    const key = keyOf(perm);
    if (seen.has(key)) return false;
    seen.add(key);
    variants.push({ word, perm });
    return true;
  };
  const base = permOf(tool);
  push(tool, base);
  push(inverseWord(tool), new Map([...base].map(([s, t]) => [t, s])));

  const tryPairs = (from: number): Atom[] | null => {
    let best: Atom[] | null = null;
    for (let i = 0; i < variants.length; i += 1) {
      for (let j = Math.max(from, i + 1); j < variants.length; j += 1) {
        const a = variants[i]!;
        const b = variants[j]!;
        let moved = 0;
        let overlap = false;
        for (const site of a.perm.keys()) if (b.perm.has(site)) { overlap = true; break; }
        if (!overlap) continue;
        for (const site of new Set([...a.perm.keys(), ...b.perm.keys()])) {
          const middle = a.perm.get(site) ?? site;
          if ((b.perm.get(middle) ?? middle) !== site) moved += 1;
        }
        if (moved !== 3) continue;
        const word = [...a.word, ...b.word];
        if (best && best.length <= word.length) continue;
        if (isPureThreeCycle(fullAction(word), orbit)) best = word;
      }
    }
    return best;
  };

  let frontierStart = 0;
  for (let depth = 0; depth <= 3; depth += 1) {
    const found = tryPairs(frontierStart);
    if (found) return found;
    const frontierEnd = variants.length;
    for (let index = frontierStart; index < frontierEnd && variants.length < 6000; index += 1) {
      const from = variants[index]!;
      for (const setup of alphabet) {
        const inverse = inverseAtom(setup);
        // word (setup, from, setup^-1): x -> setup(x) -> from(setup(x)) -> setup^-1(...)
        const perm = new Map<number, number>();
        for (const [site, to] of from.perm) perm.set(inverse.map.get(site) ?? site, inverse.map.get(to) ?? to);
        push([setup, ...from.word, inverse], perm);
      }
    }
    frontierStart = frontierEnd;
  }
  throw new Error(`orbit ${orbit}: no 3-cycle from conjugate pairs of the wide tool`);
};

// ---------- two-cell twisters for the C3 orbits ----------

/**
 * For a pure 3-cycle T on (a, b, c) and a word g that maps the triple onto
 * itself cyclically, g T^-1 g^-1 undoes T's position action but may leave the
 * cells twisted: T · g T^-1 g^-1 is then a position-identity twist. The search
 * runs over the finite set of (images of a, b, c with rotations) states.
 */
const deriveC3Twister = (orbit: number, tool: Atom[]): { word: Atom[]; sites: [number, number] } => {
  const frame = frameOf(orbit);
  const action = fullAction(tool);
  const triple = movedSites(action);
  const gens = atoms.filter((atom) => orbits[orbit]!.some((site) => atom.map.has(site)));
  const keyOf = (state: number[]): string => state.join(',');
  const start = triple.flatMap((site) => [site, ROT_ID]);
  const parentOf = new Map<string, { parent: string; atom: Atom | null }>([[keyOf(start), { parent: '', atom: null }]]);
  let frontier = [start];
  while (frontier.length > 0) {
    const next: number[][] = [];
    for (const state of frontier) {
      const images = [state[0]!, state[2]!, state[4]!];
      if (images.every((site) => triple.includes(site))) {
        const setup: Atom[] = [];
        for (let key = keyOf(state); ;) {
          const node = parentOf.get(key)!;
          if (!node.atom) break;
          setup.push(node.atom);
          key = node.parent;
        }
        setup.reverse();
        const word = [...tool, ...setup, ...inverseWord(tool), ...inverseWord(setup)];
        const result = fullAction(word);
        const twisted = [...result.keys()];
        const positionIdentity = [...result].every(([site, [to]]) => site === to);
        if (positionIdentity && twisted.length === 2 && twisted.every((site) => orbitOf[site] === orbit)) {
          const [x, y] = twisted as [number, number];
          const sum = frame.exponent(frame.twist(x, x, result.get(x)![1])) + frame.exponent(frame.twist(y, y, result.get(y)![1]));
          if (sum % 3 !== 0) throw new Error(`orbit ${orbit}: a two-cell twist with non-zero sum`);
          return { word, sites: [x, y] };
        }
      }
      for (const atom of gens) {
        const moved = [0, 2, 4].flatMap((offset) => {
          const to = atom.map.get(state[offset]!);
          return to === undefined ? [state[offset]!, state[offset + 1]!] : [to, rotMul[atom.rot]![state[offset + 1]!]!];
        });
        const key = keyOf(moved);
        if (parentOf.has(key)) continue;
        parentOf.set(key, { parent: keyOf(state), atom });
        next.push(moved);
      }
    }
    frontier = next;
  }
  throw new Error(`orbit ${orbit}: no two-cell twister`);
};

// ---------- run ----------

const started = performance.now();
const toolOf = new Map(level3PureToolWords.map((record) => [record.orbit, resolveWord(record.word)]));

const threeCycles: Array<{ orbit: number; word: string[] }> = [];
for (const [orbit, tool] of [...toolOf].sort((a, b) => a[0] - b[0])) {
  if (movedSites(fullAction(tool)).length === 3) continue;
  const word = deriveThreeCycle(orbit, tool);
  threeCycles.push({ orbit, word: word.map((atom) => atom.id) });
  console.log(`3-cycle  orbit ${String(orbit).padStart(3)} (size ${orbits[orbit]!.length}): ${word.length} atoms`);
}

const c3Twisters: Array<{ orbit: number; word: string[] }> = [];
for (let orbit = 0; orbit < orbits.length; orbit += 1) {
  if (orbits[orbit]!.length !== 8 || frameOf(orbit).kind !== 'C3') continue;
  const tool = threeCycles.find((record) => record.orbit === orbit)?.word;
  const { word, sites } = deriveC3Twister(orbit, tool ? resolveWord(tool) : toolOf.get(orbit)!);
  c3Twisters.push({ orbit, word: word.map((atom) => atom.id) });
  console.log(`twister  orbit ${String(orbit).padStart(3)}: ${word.length} atoms on cells ${sites.join(', ')}`);
}

const d4Frame = frameOf(level3D4Orbit);
const d4FlipPair = level3D4TwisterWords.findIndex((ids) => {
  const action = fullAction(resolveWord(ids));
  let flips = 0;
  for (const [site, [to, rot]] of action) {
    if (site !== to || orbitOf[site] !== level3D4Orbit) return false;
    if (!d4Frame.cyclic.has(d4Frame.twist(site, to, rot))) flips += 1;
  }
  return flips === 2;
});
if (d4FlipPair < 0) throw new Error('no shipped D4 twister flips exactly two cells');
console.log(`flip pair: shipped D4 twister #${d4FlipPair}`);

const tools = { threeCycles, c3Twisters, d4Orbit: level3D4Orbit, d4FlipPairWord: [...level3D4TwisterWords[d4FlipPair]!] };
mkdirSync('research/level3-completeness/out', { recursive: true });
writeFileSync('research/level3-completeness/out/tools.json', `${JSON.stringify(tools)}\n`);

writeFileSync(
  'packages/solver-core/src/algorithms/level3SliceReductionCertifiedData.ts',
  `/* Generated by research/level3-completeness/find-tools.ts. */
/* Every word is re-checked on all 8000 cells by research/level3-completeness/certify.ts. */

/** A globally pure 3-cycle for each orbit whose shipped pure tool is wider than three cells. */
export const level3ThreeCycleWords: ReadonlyArray<{ orbit: number; word: readonly string[] }> = ${JSON.stringify(threeCycles, null, 2)};

/** A position-identity word twisting exactly two cells (c, -c), one per C3 orbit. */
export const level3C3TwisterWords: ReadonlyArray<{ orbit: number; word: readonly string[] }> = ${JSON.stringify(c3Twisters, null, 2)};

/** A position-identity word flipping exactly two cells of the D4 orbit. */
export const level3D4FlipPairWord: readonly string[] = ${JSON.stringify(tools.d4FlipPairWord, null, 2)};
`,
);
console.log(`\nwrote ${threeCycles.length} 3-cycles and ${c3Twisters.length} twisters in ${((performance.now() - started) / 1000).toFixed(1)}s`);

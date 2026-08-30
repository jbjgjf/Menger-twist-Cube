/**
 * Can two tools that are pure on one coupled orbit-pair be commutated once more
 * to isolate a globally pure tool on one half?
 *
 * Run: `npx tsx research/scratch/l3-pair-isolation.ts` from the repo root.
 */
import {
  ROT_ID, actionOver, atoms, commutatorCandidates, commutatorWord, inverseAtom, inverseWord, N, siteClasses,
  type Atom,
} from './l3sim';
import { findOrbitLocalTools } from './l3tools';

// ---------- orbits ----------
const parent = new Int32Array(N).map((_, i) => i);
const findRoot = (x: number): number => { let r = x; while (parent[r] !== r) r = parent[r]!; while (parent[x] !== r) { const n = parent[x]!; parent[x] = r; x = n; } return r; };
for (const atom of atoms) for (const [from, to] of atom.map) {
  if (from === to) continue;
  const a = findRoot(from); const b = findRoot(to);
  if (a !== b) parent[a] = b;
}
const orbitOfSite = new Int16Array(N).fill(-1);
const orbitSites: number[][] = [];
{
  const roots = new Map<number, number>();
  for (let site = 0; site < N; site += 1) {
    const root = findRoot(site);
    let orbit = roots.get(root);
    if (orbit === undefined) { orbit = orbitSites.length; roots.set(root, orbit); orbitSites.push([]); }
    orbitOfSite[site] = orbit; orbitSites[orbit]!.push(site);
  }
}

interface PairTool { word: Atom[]; own: number[]; other: number[] }

const target = orbitSites.findIndex((sites, orbit) =>
  siteClasses[sites[0]!] === 'EEE/B|b|o' && orbitSites[orbit + 1]?.length === sites.length,
);
const local = findOrbitLocalTools(orbitSites[target]!, 600);
const seeds = [...local].sort((a, b) => a.gsup.length - b.gsup.length).slice(0, 150);
const pairTools: PairTool[] = [];
const seen = new Set<string>();
for (let i = 0; i < seeds.length; i += 1) {
  for (let j = i + 1; j < seeds.length; j += 1) {
    const word = commutatorWord(seeds[i]!.word, seeds[j]!.word);
    const action = actionOver(word, commutatorCandidates(seeds[i]!.word, seeds[j]!.word));
    const moved = [...action.moves].filter(([site, [to]]) => site !== to);
    if (moved.length !== 6) continue;
    if ([...action.moves].some(([site, [to, rot]]) => site === to && rot !== ROT_ID)) continue;
    const byOrbit = new Map<number, number[]>();
    for (const [site] of moved) {
      const orbit = orbitOfSite[site]!;
      const list = byOrbit.get(orbit) ?? [];
      list.push(site); byOrbit.set(orbit, list);
    }
    if (byOrbit.size !== 2 || byOrbit.get(target)?.length !== 3) continue;
    const otherOrbit = [...byOrbit.keys()].find((orbit) => orbit !== target)!;
    if (byOrbit.get(otherOrbit)?.length !== 3) continue;
    const own = byOrbit.get(target)!;
    const other = byOrbit.get(otherOrbit)!;
    const key = [...moved].map(([site, [to, rot]]) => `${site}>${to}#${rot}`).sort().join(';');
    if (seen.has(key)) continue;
    seen.add(key);
    pairTools.push({ word, own, other });
  }
}

console.log(`target ${target}:${siteClasses[orbitSites[target]![0]!]}, pair-pure 3+3 tools: ${pairTools.length}`);

const byOwnSite = new Map<number, number[]>();
pairTools.forEach((tool, index) => {
  for (const site of tool.own) {
    const list = byOwnSite.get(site) ?? [];
    list.push(index); byOwnSite.set(site, list);
  }
});

let tested = 0;
let disjointOther = 0;
let commutingOther = 0;
let pure = 0;
let exampleLength = 0;
const testedPairs = new Set<string>();
outer:
for (let i = 0; i < pairTools.length; i += 1) {
  const candidates = new Set<number>();
  for (const site of pairTools[i]!.own) for (const j of byOwnSite.get(site) ?? []) if (j > i) candidates.add(j);
  for (const j of candidates) {
    const pairKey = `${i},${j}`;
    if (testedPairs.has(pairKey)) continue;
    testedPairs.add(pairKey);
    tested += 1;
    if (!pairTools[i]!.other.some((site) => pairTools[j]!.other.includes(site))) disjointOther += 1;
    const word = commutatorWord(pairTools[i]!.word, pairTools[j]!.word);
    const action = actionOver(word, commutatorCandidates(pairTools[i]!.word, pairTools[j]!.word));
    const moved: number[] = [];
    let clean = true;
    for (const [site, [to, rot]] of action.moves) {
      if (to === site) { if (rot !== ROT_ID) clean = false; continue; }
      moved.push(site);
    }
    if (clean && moved.every((site) => orbitOfSite[site] !== (target + 1))) commutingOther += 1;
    if (!clean || moved.length < 3 || moved.some((site) => orbitOfSite[site] !== target)) continue;
    pure += 1;
    exampleLength = word.length;
    console.log(`first globally pure result: support=${moved.length}, atoms=${word.length}, sites=${moved.join(',')}`);
    break outer;
  }
}

console.log(`tested overlapping-own pairs: ${tested}`);
console.log(`with disjoint partner support: ${disjointOther}`);
console.log(`with commuting partner actions: ${commutingOther}`);
console.log(`globally pure found: ${pure}${pure ? ` (length ${exampleLength})` : ''}`);

// The tight family can itself be diagonal even when the full atom action is
// not.  Conjugating one pair tool by a raw atom moves its two 3-cycle supports
// differently; commuting the original with that conjugate should then cancel
// one half while retaining a commutator on the other.
let conjugatesChecked = 0;
let promisingConjugates = 0;
let conjugatePure = 0;
outerConjugate:
for (const tool of pairTools) {
  for (const setup of atoms) {
    const inv = inverseAtom(setup);
    const preimage = (site: number) => inv.map.get(site) ?? site;
    const own = tool.own.map(preimage);
    const other = tool.other.map(preimage);
    const ownOverlap = tool.own.filter((site) => own.includes(site)).length;
    const otherOverlap = tool.other.filter((site) => other.includes(site)).length;
    conjugatesChecked += 1;
    const otherCommutes = otherOverlap === 0 || otherOverlap === 3;
    const ownDoesNotCommute = ownOverlap === 1 || ownOverlap === 2;
    if (!otherCommutes || !ownDoesNotCommute) continue;
    promisingConjugates += 1;
    const conjugate = [setup, ...tool.word, ...inverseWord([setup])];
    const word = commutatorWord(tool.word, conjugate);
    const action = actionOver(word, commutatorCandidates(tool.word, conjugate));
    const moved: number[] = [];
    let clean = true;
    for (const [site, [to, rot]] of action.moves) {
      if (to === site) { if (rot !== ROT_ID) clean = false; continue; }
      moved.push(site);
    }
    if (!clean || moved.length < 3 || moved.some((site) => orbitOfSite[site] !== target)) continue;
    conjugatePure += 1;
    console.log(`conjugation isolated a global tool: support=${moved.length}, atoms=${word.length}, setup=${setup.notation}`);
    break outerConjugate;
  }
}
console.log(`raw-atom conjugates checked: ${conjugatesChecked.toLocaleString()}`);
console.log(`support pattern promised isolation: ${promisingConjugates}`);
console.log(`globally pure after conjugation: ${conjugatePure}`);

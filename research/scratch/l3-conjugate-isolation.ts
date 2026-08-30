/**
 * Search for globally pure tools by commuting an orbit-local tool with a
 * raw-atom conjugate of itself: [T, g T g^-1].
 *
 * This is the corrected follow-up to the coupled-pair observation.  A tight
 * tool may act diagonally on two or more orbits, but the full generator action
 * is not diagonal (`l3-orbit-coupling.ts`).  Conjugation can therefore move the
 * target support differently from the side-effect support; their commutator
 * cancels the latter and isolates the former.
 *
 * Run: `npx tsx research/scratch/l3-conjugate-isolation.ts`.
 */
import { readFileSync } from 'node:fs';
import {
  ROT_ID, actionOver, atoms, commutatorWord, inverseAtom, inverseWord, N,
  siteClasses, supportCandidates, type Atom,
} from './l3sim';
import { findConjugateIsolatedTools, findOrbitLocalTools } from './l3tools';

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
interface Cache { hasPure: number[] }
const cache = JSON.parse(readFileSync(new URL('./l3-phase-order.cache.json', import.meta.url), 'utf8')) as Cache;
const blocking = orbitSites.map((_, orbit) => orbit).filter((orbit) => !cache.hasPure[orbit]);
const representatives: number[] = [];
const seenClass = new Set<string>();
for (const orbit of blocking) {
  const cls = siteClasses[orbitSites[orbit]![0]!]!;
  if (seenClass.has(cls)) continue;
  seenClass.add(cls); representatives.push(orbit);
}

const movedSites = (action: ReturnType<typeof actionOver>): number[] =>
  [...action.moves].filter(([site, [to, rot]]) => site !== to || rot !== ROT_ID).map(([site]) => site);

console.log('class          local min  checked  improvements  best  globally pure');
for (const orbit of representatives) {
  const started = performance.now();
  const local = findOrbitLocalTools(orbitSites[orbit]!, 600);
  const seeds = [...local].sort((a, b) => a.gsup.length - b.gsup.length).slice(0, 80);
  let checked = 0;
  let improvements = 0;
  let best = seeds[0]?.gsup.length ?? Infinity;
  let pureWord: Atom[] | null = null;

  outer:
  for (const seed of seeds) {
    const baseAction = actionOver(seed.word, seed.gsup);
    const baseSupport = movedSites(baseAction);
    const inverseDestination = new Map<number, number>();
    for (const [from, [to]] of baseAction.moves) inverseDestination.set(to, from);
    const targetSupport = baseSupport.filter((site) => orbitOfSite[site] === orbit);

    for (const setup of atoms) {
      const setupInv = inverseAtom(setup);
      const preimage = (site: number) => setupInv.map.get(site) ?? site;
      const conjugateSupport = baseSupport.map(preimage);
      const conjugateTarget = targetSupport.map(preimage);
      const targetOverlap = targetSupport.filter((site) => conjugateTarget.includes(site)).length;
      if (targetOverlap === 0 || targetOverlap === targetSupport.length) continue;

      const candidates = new Set<number>(conjugateSupport);
      for (const site of conjugateSupport) candidates.add(inverseDestination.get(site) ?? site);
      const conjugate = [setup, ...seed.word, ...inverseWord([setup])];
      const word = commutatorWord(seed.word, conjugate);
      const action = actionOver(word, candidates);
      checked += 1;
      const support = movedSites(action);
      if (support.length === 0 || support.length >= baseSupport.length) continue;
      improvements += 1;
      best = Math.min(best, support.length);
      let clean = true;
      for (const [site, [to, rot]] of action.moves) {
        if (to === site && rot !== ROT_ID) { clean = false; break; }
      }
      if (clean && support.every((site) => orbitOfSite[site] === orbit)) {
        pureWord = word;
        break outer;
      }
    }
  }

  console.log(
    `${siteClasses[orbitSites[orbit]![0]!]!.padEnd(12)} ${String(seeds[0]?.gsup.length ?? '-').padStart(9)} ` +
    `${String(checked).padStart(8)} ${String(improvements).padStart(13)} ${String(best).padStart(5)} ` +
    `${pureWord ? `yes (${pureWord.length} atoms)` : 'no'}  (${((performance.now() - started) / 1000).toFixed(1)}s)`,
  );
}

console.log('\nrecursive beam (up to three tightening rungs)');
console.log('class          globally pure  atoms  time');
for (const orbit of representatives) {
  const started = performance.now();
  const local = findOrbitLocalTools(orbitSites[orbit]!, 600);
  const pure = findConjugateIsolatedTools(orbitSites[orbit]!, local, 1);
  console.log(
    `${siteClasses[orbitSites[orbit]![0]!]!.padEnd(12)} ${(pure.length ? 'yes' : 'no').padStart(13)} ` +
    `${String(pure[0]?.word.length ?? '-').padStart(6)}  ${((performance.now() - started) / 1000).toFixed(1)}s`,
  );
}

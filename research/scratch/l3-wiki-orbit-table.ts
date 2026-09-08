/**
 * Emit the Level 3 orbit catalogue used by the Japanese GitHub Wiki.
 *
 * Run: `npx tsx research/scratch/l3-wiki-orbit-table.ts`
 */
import type { Vector3Tuple } from 'three';
import {
  ROT_ID,
  actionOver,
  atomById,
  atoms,
  digitsOf,
  N,
  rotMul,
  siteClasses,
  sitePositions,
  supportCandidates,
} from './l3sim';
import { level3PureToolWords } from '../../packages/solver-core/src/algorithms/level3SliceReductionToolData';
import { validateTurnTargetRotation } from '../../packages/engine/src/rotationLegality';
import { createMengerPuzzleState } from '../../packages/engine/src/puzzleState';

const parent = new Int32Array(N).map((_, i) => i);
const find = (x: number): number => {
  let root = x;
  while (parent[root] !== root) root = parent[root]!;
  while (parent[x] !== root) {
    const next = parent[x]!;
    parent[x] = root;
    x = next;
  }
  return root;
};
for (const atom of atoms) {
  for (const [from, to] of atom.map) {
    if (from === to) continue;
    const a = find(from);
    const b = find(to);
    if (a !== b) parent[a] = b;
  }
}

const orbitSites: number[][] = [];
const orbitForRoot = new Map<number, number>();
for (let site = 0; site < N; site += 1) {
  const root = find(site);
  let orbit = orbitForRoot.get(root);
  if (orbit === undefined) {
    orbit = orbitSites.length;
    orbitForRoot.set(root, orbit);
    orbitSites.push([]);
  }
  orbitSites[orbit]!.push(site);
}

const canonical = createMengerPuzzleState(3);
const siteByPosition = new Map(canonical.cubies.map((c, i) => [(c.homePosition as Vector3Tuple).join(','), i]));
const rollable = new Uint8Array(N);
for (const target of canonical.turnTargets) {
  if (target.kind !== 'extension' || target.depth !== 3 || target.scale !== 1) continue;
  if (!validateTurnTargetRotation(canonical.cubies, target, 90).legal) continue;
  const site = siteByPosition.get((target.pivot as Vector3Tuple).join(','));
  if (site !== undefined) rollable[site] = 1;
}

const freedoms: number[] = [];
for (const sites of orbitSites) {
  const local = new Map(sites.map((site, i) => [site, i]));
  const generators = atoms.filter((atom) => sites.some((site) => atom.map.has(site)));
  const seen = new Uint8Array(sites.length * 24);
  seen[ROT_ID] = 1;
  const queue = [ROT_ID];
  for (let head = 0; head < queue.length; head += 1) {
    const state = queue[head]!;
    const site = Math.floor(state / 24);
    const rotation = state % 24;
    const globalSite = sites[site]!;
    for (const atom of generators) {
      const destination = atom.map.get(globalSite);
      if (destination === undefined) continue;
      const next = local.get(destination)! * 24 + rotMul[atom.rot]![rotation]!;
      if (!seen[next]) {
        seen[next] = 1;
        queue.push(next);
      }
    }
  }
  let freedom = 0;
  for (let rotation = 0; rotation < 24; rotation += 1) freedom += seen[rotation]!;
  freedoms.push(freedom);
}

const toolStats = new Map<number, { width: number; length: number }>();
for (const record of level3PureToolWords) {
  const word = record.word.map((id) => atomById.get(id)!);
  const action = actionOver(word, supportCandidates(word));
  let width = 0;
  for (const [from, [to]] of action.moves) if (from !== to) width += 1;
  toolStats.set(record.orbit, { width, length: word.length });
}

const tuple = (values: readonly number[]): string => `(${values.join(',')})`;
console.log('| ID | class | representative p | digits (B;b;o) | size | orientation freedom | legal roll | tool support | tool length |');
console.log('| --- | --- | --- | --- | ---: | ---: | --- | ---: | ---: |');
for (let orbit = 0; orbit < orbitSites.length; orbit += 1) {
  const sites = orbitSites[orbit]!;
  const representative = sitePositions[sites[0]!]!;
  const digits = digitsOf(representative);
  const tool = toolStats.get(orbit)!;
  console.log(
    `| O${String(orbit).padStart(3, '0')} | ${siteClasses[sites[0]!]!} | ${tuple(representative)} | ` +
      `${digits.map(tuple).join(';')} | ${sites.length} | ${freedoms[orbit]} | ` +
      `${sites.some((site) => rollable[site] === 1) ? 'yes' : 'no'} | ${tool.width} | ${tool.length} |`,
  );
}

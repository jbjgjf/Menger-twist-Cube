import { mkdirSync, writeFileSync } from 'node:fs';
import { actionOver, createSparseGroup, fullAction, inverseAtom, inverseWord } from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import { actionKey, commutatorAction, isThreeCycle, simplifyWord, type Tool } from './tools';

const level = Number(process.argv.find((a) => a.startsWith('--level='))?.split('=')[1] ?? 4);
const group = createSparseGroup(level, console.log);
const wanted = new Set(group.orbits.flatMap((s, i) => s.length >= 96 ? [i] : []));
const found = new Map<number, { orbit: number; word: string[] }>();
const seeds: Tool[] = []; const seen = new Set<string>();
for (const local of group.atoms.filter((a) => a.family === `ext-d${level - 1}` || a.family === `ext-d${level - 0.5}`)) {
  const frames = new Set([...local.map.keys()].flatMap((s) => group.atomsAt[s]!.filter((i) => group.atoms[i]!.kind === 'frame')));
  for (const ai of frames) {
    const frame = group.atoms[ai]!;
    const inv = inverseAtom(group, frame);
    const candidates = new Set(local.map.keys());
    for (const s of local.map.keys()) candidates.add(inv.map.get(s) ?? s);
    const word = [frame, local, inv, inverseAtom(group, local)];
    const action = actionOver(word, candidates);
    if (!action.size || action.size > 9 || ![...action.keys()].some((s) => wanted.has(group.orbitOf[s]!))) continue;
    const key = actionKey(action);
    if (seen.has(key)) continue;
    seen.add(key); seeds.push({ word, action });
  }
}
console.log(`Built ${seeds.length} tight seeds`);
const bySite = new Map<number, number[]>();
seeds.forEach((t, i) => { for (const s of t.action.keys()) { const l = bySite.get(s) ?? []; l.push(i); bySite.set(s, l); } });
for (let i = 0; i < seeds.length; i++) {
  const a = seeds[i]!;
  if (![...a.action.keys()].some((s) => wanted.has(group.orbitOf[s]!) && !found.has(group.orbitOf[s]!))) continue;
  const partners = new Set<number>();
  for (const s of a.action.keys()) for (const j of bySite.get(s) ?? []) if (j > i) partners.add(j);
  for (const j of partners) {
    const b = seeds[j]!;
    const action = commutatorAction(a.action, b.action);
    if (action.size !== 3) continue;
    const orbit = group.orbitOf[action.keys().next().value!]!;
    if (!wanted.has(orbit) || found.has(orbit) || !isThreeCycle(group, orbit, action)) continue;
    const word = simplifyWord(group, [...a.word, ...b.word, ...inverseWord(group, a.word), ...inverseWord(group, b.word)]);
    if (!isThreeCycle(group, orbit, fullAction(word))) throw new Error('Action/word mismatch');
    found.set(orbit, { orbit, word: word.map((a) => a.id) });
    console.log(`Found ${found.size}/${wanted.size}: orbit=${orbit}, size=${group.orbits[orbit]!.length}, length=${word.length}`);
  }
}
mkdirSync('research/level4/out', { recursive: true });
writeFileSync(`research/level4/out/seed-tools-L${level}.json`, JSON.stringify({ level, tools: [...found.values()] }) + '\n');
console.log(`Finished seed tools: ${found.size}/${wanted.size}`);

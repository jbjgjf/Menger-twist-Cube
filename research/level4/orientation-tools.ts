import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createSparseGroup, fullAction, inverseAtom, inverseWord, orientationFrames, ROT_ID, rotInv, rotMul } from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import { actionKey, alphabetFor, composeActions, conjugateAction, inverseAction, permutationKey, simplifyWord, type Tool } from './tools';

const level = Number(process.argv.find((a) => a.startsWith('--level='))?.split('=')[1] ?? 4);
const group = createSparseGroup(level, console.log);
const frames = orientationFrames(group);
const records = new Map<number, string[]>();
for (const file of [`research/level4/out/tools-L${level}.json`, `research/level4/out/seed-tools-L${level}.json`]) {
  if (existsSync(file)) for (const r of JSON.parse(readFileSync(file, 'utf8')).tools) records.set(r.orbit, r.word);
}
const out: Array<{ orbit: number; kind: 'C3' | 'D4'; word: string[] }> = [];
for (const [orbit, frame] of frames.entries()) {
  const order = frame.freedom.length;
  if (order !== 3 && order !== 8) continue;
  const kind = order === 3 ? 'C3' : 'D4';
  console.log(`${kind} orbit=${orbit} size=${group.orbits[orbit]!.length} base=${group.sites[group.orbits[orbit]![0]!]}`);
  const ids = records.get(orbit);
  if (!ids) { console.log('No position tool yet'); continue; }
  const baseWord = ids.map((id) => group.atomById.get(id)!);
  const base = { word: baseWord, action: fullAction(baseWord) };
  const alphabet = alphabetFor(group, orbit, true);
  const rotOrder = (r: number): number => { let x = r; let k = 1; while (x !== ROT_ID) { x = rotMul[r]![x]!; k++; } return k; };
  const quarter = frame.freedom.find((r) => rotOrder(r) === 4);
  const cyclic = quarter === undefined ? new Set(frame.freedom) : new Set([ROT_ID, quarter, rotMul[quarter]![quarter]!, rotInv[quarter]!]);
  const isFlip = (site: number, r: number): boolean => !cyclic.has(rotMul[rotInv[frame.ref[site]!]!]![rotMul[r]![frame.ref[site]!]!]!);
  const byPosition = new Map<string, Tool[]>();
  const seen = new Set<string>(); const queue: Tool[] = [];
  let answer: Tool | null = null;
  const record = (candidate: Tool): void => {
    const key = actionKey(candidate.action);
    if (seen.has(key)) return;
    seen.add(key);
    const pkey = permutationKey(candidate.action);
    const prior = byPosition.get(pkey) ?? [];
    for (const other of prior) {
      let action = composeActions(candidate.action, inverseAction(other.action));
      if (![...action].every(([s, [t]]) => s === t && group.orbitOf[s] === orbit)) continue;
      let word = [...candidate.word, ...inverseWord(group, other.word)];
      if (kind === 'D4') {
        if ([...action].filter(([s, [, r]]) => isFlip(s, r)).length !== 2) continue;
        // Remove any third-cell quarter rotation so the word is supported on exactly two cells.
        for (const [s, [, r]] of action) {
          if (isFlip(s, r)) continue;
          const roll = group.atomsAt[s]!.map((i) => group.atoms[i]!).find((a) => a.map.size === 1 && rotMul[a.rot]![r] === ROT_ID);
          if (!roll) throw new Error(`No roll clears stationary rotation at ${s}`);
          word.push(roll);
        }
        action = fullAction(word);
      }
      if (action.size !== 2) continue;
      answer = { word: simplifyWord(group, word), action };
      return;
    }
    prior.push(candidate); byPosition.set(pkey, prior); queue.push(candidate);
  };
  record(base);
  for (let head = 0; head < queue.length && !answer && head < 200000; head++) {
    const from = queue[head]!;
    for (const a of alphabet) {
      record({ word: [a, ...from.word, inverseAtom(group, a)], action: conjugateAction(group, from.action, a) });
      if (answer) break;
    }
    if (head > 0 && head % 10000 === 0) console.log(`  ${head} variants explored, ${queue.length} queued`);
  }
  if (!answer) { console.log(`OPEN ${kind} orbit=${orbit}, ${queue.length} variants`); continue; }
  const tool = answer as Tool;
  const checked = fullAction(tool.word);
  if (actionKey(checked) !== actionKey(tool.action)) throw new Error('Word/action mismatch');
  out.push({ orbit, kind, word: tool.word.map((a) => a.id) });
  console.log(`FOUND ${kind} orbit=${orbit}: ${tool.word.length} atoms, ${actionKey(checked)}`);
}
mkdirSync('research/level4/out', { recursive: true });
writeFileSync(`research/level4/out/orientation-tools-L${level}.json`, JSON.stringify({ level, tools: out }) + '\n');

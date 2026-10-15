import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createSparseGroup, fullAction } from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import { findLocalTools, isolate, isThreeCycle, narrowToThreeCycle } from './tools';

const group = createSparseGroup(4, console.log);
const known = new Map<number, string[]>();
for (const name of ['tools', 'seed-tools', 'extra-tools']) {
  const path = `research/level4/out/${name}-L4.json`;
  if (existsSync(path)) for (const r of JSON.parse(readFileSync(path, 'utf8')).tools) known.set(r.orbit, r.word);
}
const extras: Array<{ orbit: number; word: string[] }> = [];
for (let orbit = 0; orbit < group.orbits.length; orbit++) {
  if (known.has(orbit)) continue;
  console.log(`OPEN orbit=${orbit}, size=${group.orbits[orbit]!.length}, base=${group.sites[group.orbits[orbit]![0]!]}`);
  let result = null;
  for (const conjugates of [false, true]) {
    const local = findLocalTools(group, orbit, 600, conjugates, 12);
    console.log(`  ${local.length} local tools, min support=${Math.min(...local.map((t) => t.action.size))}`);
    const pure = isolate(group, orbit, local, 7, 128);
    console.log(`  pure=${pure?.action.size ?? 'none'}`);
    if (pure) result = narrowToThreeCycle(group, orbit, pure);
    if (result) break;
  }
  if (result) {
    if (!isThreeCycle(group, orbit, fullAction(result.word))) throw new Error('Invalid word');
    extras.push({ orbit, word: result.word.map((a) => a.id) });
    console.log(`FOUND extra orbit=${orbit}, length=${result.word.length}`);
    writeFileSync('research/level4/out/extra-tools-L4.json', JSON.stringify({ level: 4, tools: extras }) + '\n');
  }
}

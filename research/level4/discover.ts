import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createSparseGroup, fullAction } from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import { findLocalTools, isolate, isThreeCycle, narrowToThreeCycle } from './tools';

const level = Number(process.argv.find((a) => a.startsWith('--level='))?.split('=')[1] ?? 4);
const only = process.argv.find((a) => a.startsWith('--orbits='))?.split('=')[1]?.split(',').map(Number);
const group = createSparseGroup(level, console.log);
const path = `research/level4/out/tools-L${level}.json`;
interface Record { orbit: number; word: string[] }
const records: Record[] = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).tools : [];
const byOrbit = new Map(records.map((r) => [r.orbit, r]));
const failures: number[] = [];
mkdirSync('research/level4/out', { recursive: true });
const started = performance.now();
const save = () => writeFileSync(path, JSON.stringify({ level, tools: [...byOrbit.values()].sort((a, b) => a.orbit - b.orbit), failures }) + '\n');
for (let orbit = 0; orbit < group.orbits.length; orbit++) {
  if (only && !only.includes(orbit)) continue;
  const cached = byOrbit.get(orbit);
  if (cached) {
    const word = cached.word.map((id) => group.atomById.get(id)!);
    if (!word.every(Boolean) || !isThreeCycle(group, orbit, fullAction(word))) throw new Error(`Invalid cached word ${orbit}`);
    continue;
  }
  const t = performance.now();
  let tool = null;
  for (const conjugates of [false, true]) {
    const local = findLocalTools(group, orbit, conjugates ? 600 : 96, conjugates);
    const pure = isolate(group, orbit, local);
    if (pure) tool = narrowToThreeCycle(group, orbit, pure);
    if (tool) break;
  }
  if (!tool) { failures.push(orbit); console.log(`OPEN orbit=${orbit} size=${group.orbits[orbit]!.length} seconds=${((performance.now() - t) / 1000).toFixed(1)}`); }
  else {
    if (!isThreeCycle(group, orbit, fullAction(tool.word))) throw new Error(`Word and composed action disagree for ${orbit}`);
    byOrbit.set(orbit, { orbit, word: tool.word.map((a) => a.id) });
    console.log(`FOUND ${byOrbit.size}/${group.orbits.length} orbit=${orbit} size=${group.orbits[orbit]!.length} length=${tool.word.length} seconds=${((performance.now() - t) / 1000).toFixed(1)}`);
  }
  save();
}
save();
console.log(`Finished: ${byOrbit.size}/${group.orbits.length}, open=${failures.length}, seconds=${((performance.now() - started) / 1000).toFixed(1)}`);

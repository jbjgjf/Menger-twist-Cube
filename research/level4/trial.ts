import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mengerPuzzleModel } from '../../packages/solver-core/src/model/mengerPuzzleModel';
import { reduceMengerState } from '../../packages/solver-core/src/algorithms/mengerCertifiedReduction';
import { createSparseGroup } from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import { level4CertifiedData } from '../../packages/solver-core/src/algorithms/level4CertifiedData';
import { level4ScrambleWeight } from '../../packages/solver-core/src/algorithms/level4SliceReductionSolver';
import { createSeededRng } from '../../packages/solver-core/src/benchmark/scramble';

const arg = (name: string, fallback: string): string => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const seed = Number(arg('seed', '1')); const length = Number(arg('length', '1'));
const family = arg('family', 'frame-s1');
const group = createSparseGroup(4, console.log);
let state = group.canonical;
let rng = seed >>> 0;
const random = (n: number): number => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng % n; };
const pool = family === 'weighted' ? group.atoms.flatMap((a) => Array.from({ length: level4ScrambleWeight(a) }, () => a)) : group.atoms.filter((a) => family === 'all' || a.family === family);
const weightedRng = createSeededRng(seed);
if (!pool.length) throw new Error(`Unknown family ${family}`);
const scramble: string[] = [];
for (let i = 0; i < length; i++) {
  const atom = pool[family === 'weighted' ? Math.floor(weightedRng() * pool.length) : random(pool.length)]!;
  scramble.push(atom.id); state = mengerPuzzleModel.applyMove(state, atom.move);
}
const displaced = state.cubies.filter((c) => c.currentPosition.some((x, i) => x !== c.homePosition[i])).length;
console.log(`Scramble seed=${seed} length=${length} family=${family}, displaced=${displaced}`);
const start = performance.now();
const result = reduceMengerState(group, level4CertifiedData, state.cubies, console.log);
const hash = createHash('sha256');
for (let i = 0; i < result.atoms.length; i += 16384) hash.update((i ? '\n' : '') + result.atoms.slice(i, i + 16384).map((a) => a.id).join('\n'));
const outputFamilies: Record<string, number> = {};
for (const atom of result.atoms) outputFamilies[atom.family] = (outputFamilies[atom.family] ?? 0) + 1;
const report = { schema: 1, level: 4, seed, length, family, scramble, displaced,
  cells: group.N, success: true, runtimeMs: performance.now() - start,
  moveCount: result.atoms.length, placements: result.placements,
  setupSearchNodes: result.setupSearchNodes, replaySelectedEntries: result.replaySelectedEntries,
  wordSha256: hash.digest('hex'), outputFamilies,
  phases: result.phases, memory: process.memoryUsage() };
mkdirSync('research/level4/out', { recursive: true });
writeFileSync(`research/level4/out/trial-${family}-seed${seed}-length${length}.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));

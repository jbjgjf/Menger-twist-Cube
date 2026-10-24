import { createMengerPuzzleState } from '../../packages/engine/src/index';
import { enumerateSubsetCandidates } from '../square-rotation/model';
const level = Number(process.argv[2] ?? 3); const layer = Number(process.argv[3] ?? 0);
const state = createMengerPuzzleState(level, { materializeCubies: true });
const start = performance.now();
const result = enumerateSubsetCandidates(state.cubies, level, { planeFilter: (axis, l) => axis === 0 && l === layer });
console.log(JSON.stringify({level, layer, ms: performance.now()-start, candidates: result.candidates.length, stats: result.stats}));

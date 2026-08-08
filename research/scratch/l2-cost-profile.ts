/**
 * Where do the Level 2 slice-reduction solver's ~4000 moves go?
 *
 * Run: `npx tsx research/scratch/l2-cost-profile.ts` from the repo root.
 *
 * Reports per-phase atom counts, and separately measures how much of the state
 * is already recoverable by a cheap macro (block-level) alignment — the input
 * to deciding whether a pre-alignment pass would pay for itself.
 */
import type { Vector3Tuple } from 'three';
import type { MengerPuzzleState } from '@menger/engine';
import {
  createSeededRng,
  level2SliceReductionAlgorithm,
  mengerPuzzleModel,
  onSolverDebug,
  scrambleState,
  warmLevel2SliceReductionSolver,
} from '@menger/solver-core';

const model = mengerPuzzleModel;
const pool = (state: MengerPuzzleState) => level2SliceReductionAlgorithm.scrambleMovePool!(model, state);

const blockOf = (p: Vector3Tuple): Vector3Tuple => [
  Math.floor((p[0] + 4) / 3) - 1,
  Math.floor((p[1] + 4) / 3) - 1,
  Math.floor((p[2] + 4) / 3) - 1,
];
const key = (p: readonly number[]) => p.join(',');

warmLevel2SliceReductionSolver();

const phaseTotals = new Map<string, number[]>();
let capture: string[] = [];
onSolverDebug((event) => {
  if (event.source === 'level2-slice-reduction' && event.message.startsWith('phase "')) capture.push(event.message);
});

for (const length of [20, 50, 100]) {
  console.log(`\n=== scramble length ${length} ===`);
  const cellsHome: number[] = [];
  const blocksHome: number[] = [];
  const macroPure: number[] = [];
  const totals: number[] = [];

  for (const seed of [1, 2, 3]) {
    const solved = model.createState(2);
    const { state } = scrambleState(model, solved, createSeededRng(seed), length, pool);

    // How much structure survives the scramble?
    cellsHome.push(state.cubies.filter((c) => key(c.currentPosition) === key(c.homePosition)).length);

    // Majority-vote block assignment: for each region, which home block owns most of its cells?
    const regions = new Map<string, string[]>();
    for (const c of state.cubies) {
      const region = key(blockOf(c.currentPosition as Vector3Tuple));
      const list = regions.get(region) ?? [];
      list.push(key(blockOf(c.homePosition as Vector3Tuple)));
      regions.set(region, list);
    }
    let majoritySum = 0;
    let pureRegions = 0;
    for (const [, homes] of regions) {
      const counts = new Map<string, number>();
      for (const h of homes) counts.set(h, (counts.get(h) ?? 0) + 1);
      const best = Math.max(...counts.values());
      majoritySum += best;
      if (counts.size === 1) pureRegions += 1;
    }
    blocksHome.push(majoritySum);
    macroPure.push(pureRegions);

    capture = [];
    const result = await level2SliceReductionAlgorithm.solve(model, state);
    totals.push(result.move_count);
    for (const line of capture) {
      const match = /^phase "(.+)": (\d+) atoms/.exec(line);
      if (!match) continue;
      const list = phaseTotals.get(match[1]!) ?? [];
      list.push(Number(match[2]));
      phaseTotals.set(match[1]!, list);
    }
  }

  const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
  console.log(`  cells already at home site:        ${avg(cellsHome)} / 400`);
  console.log(`  cells in their home block region:  ${avg(blocksHome)} / 400 (majority-vote assignment)`);
  console.log(`  block regions holding one block:   ${avg(macroPure)} / 20`);
  console.log(`  final solution length:             ${avg(totals)} moves`);
}

console.log('\n=== per-phase atom cost (mean over all 9 runs, before peephole) ===');
let grand = 0;
for (const [phase, counts] of phaseTotals) {
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  grand += mean;
  console.log(`  ${phase.padEnd(30)} ${mean.toFixed(0).padStart(6)} atoms`);
}
console.log(`  ${'TOTAL'.padEnd(30)} ${grand.toFixed(0).padStart(6)} atoms`);

/**
 * Sizing a *full* Level 3 solver (arbitrary legal moves, not just the
 * block-rigid generator set): how many piece classes, how big, and what the
 * cost model measured on Level 2 projects to.
 *
 * Run: `npx tsx research/scratch/l3-full-estimate.ts` from the repo root.
 */
import { classSites, N } from './l3sim';

console.log(`piece classes at Level 3: ${classSites.size} (Level 2 has 5), over ${N} cells`);
for (const [cls, sites] of [...classSites].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${cls.padEnd(12)} ${sites.length}`);
}

// --- cost model, calibrated on the measured Level 2 solver ---
//
//   moves = (cells / cells-per-tool) x (template length + 2 x setup depth)
//
// Level 2 v0.3.0 measures 400 cells -> ~2,610 moves at ~2.5 cells per tool with
// 16-atom templates, which pins the setup term.
console.log('\ncost model (calibrated on Level 2 v0.3.0: 400 cells -> ~2,610 moves)');
const l2 = { cells: 400, moves: 2610, cellsPerTool: 2.5, template: 16 };
const l2Tools = l2.cells / l2.cellsPerTool;
const l2SetupPerSide = (l2.moves / l2Tools - l2.template) / 2;
console.log(
  `  Level 2 implied: ${l2Tools.toFixed(0)} tools, ${(l2.moves / l2Tools).toFixed(1)} atoms/tool ` +
    `= ${l2.template} template + 2 x ${l2SetupPerSide.toFixed(2)} setup`,
);

for (const setupPerSide of [1.25, 3, 4, 5]) {
  const tools = N / 2.5;
  const perTool = l2.template + 2 * setupPerSide;
  console.log(
    `  Level 3 @ setup ${setupPerSide}/side: ${tools.toFixed(0)} tools x ${perTool.toFixed(0)} atoms ` +
      `= ${Math.round((tools * perTool) / 1000)}k moves`,
  );
}

// Setup depth is driven by how much of a class a tool library can reach
// directly: the same number of tools covers a far smaller fraction of a bigger
// class, so the pair-BFS has to conjugate further to bridge the gap.
console.log('\nwhy setups get deeper — ordered pairs to cover, per class:');
console.log('  Level 2 largest class:  96 sites ->       9,120 ordered pairs (83% covered directly)');
const biggest = Math.max(...[...classSites.values()].map((s) => s.length));
console.log(
  `  Level 3 largest class: ${biggest} sites -> ${(biggest * (biggest - 1)).toLocaleString()} ordered pairs ` +
    `(2.4-5% covered directly, measured in l3-tools-probe.ts / l3-tools-frames2.ts)`,
);
console.log(`  ratio: ${((biggest * (biggest - 1)) / (96 * 95)).toFixed(0)}x more pairs to cover`);
console.log('\n=> the 4-5/side rows are the realistic ones: ~77-83k moves');

# Slice-reduction research scripts

Verification scripts behind the empirical claims in
[`docs/algorithms/level2-slice-reduction-solver.md`](../../docs/algorithms/level2-slice-reduction-solver.md).
Run with `npx tsx research/scratch/<file>` from the repo root.

- `sim.ts` — shared harness: integer simulator of the Level 2 puzzle (400 sites,
  24 exact rotation matrices, every legal move as a permutation + rotation),
  validated move-for-move against `@menger/engine`.
- `exp1-structure.ts` — verifies the class-invariance lemma, the digit
  (self-similarity) action, the per-class quarter-turn parity table, and the
  corner-safety lemma for all 15,552 `[frame, E1/slab]` commutators.
- `exp9-orient-freedom.ts` — per-class orientation freedom via the exact
  (site × rotation) single-piece automaton; proves the EC
  orientation-determined-by-position theorem.
- `exp15-solve3.ts` — final standalone prototype of the full pipeline with a
  self-contained benchmark (10 seeds × scramble lengths 5–300, full generator
  set). The production port is
  `packages/solver-core/src/algorithms/level2SliceReductionSolver.ts`.

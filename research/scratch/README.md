# Solver research scripts

Verification scripts behind the empirical claims in the algorithm docs.
Run with `npx tsx research/scratch/<file>` from the repo root.

## Level 3 block quotient

Behind [`docs/algorithms/level3-block-quotient-solver.md`](../../docs/algorithms/level3-block-quotient-solver.md).

- `l3-structure.ts` — the four structural facts the solver rests on: the
  400×20 mid-block partition, exactness of the Level 3 → Level 2 quotient
  (every macro selector agrees with its lifted selector on all 8000 cells),
  the legality lift (macro-legal implies Level 3 legal), and the roll-orbit
  theorem (roll-legality is constant on each of the 164 site orbits of the
  full move group).
- `l3-validate.ts` — end-to-end solve validation: scramble lengths 10–200 on
  the declared generator set, roll-heavy scrambles that drive hundreds of
  residual twists through the last phase, and honest rejection of out-of-scope
  (scale-1 slice, depth-2.5 slab) scrambles. Every move is re-checked for
  legality and every solution replayed independently of the solver's own
  reporting.

## Level 2 slice reduction

Behind [`docs/algorithms/level2-slice-reduction-solver.md`](../../docs/algorithms/level2-slice-reduction-solver.md).

Solution-length work (v0.2.0):

- `l2-cost-profile.ts` — where a solve's moves actually go: per-phase atom
  counts, plus how much block structure survives a scramble (the input to
  judging whether a macro pre-alignment pass would pay for itself).
- `l2-short-tools.ts`, `l2-short-tools2.ts` — the search for shorter edge-class
  3-cycles. Together they rule out pure 3-cycles at word lengths 4 and 6 over
  ~1M commutator candidates, and find 8-atom ones only on `EEa`. This is why
  the edge phases still use the 16-atom interchange.

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

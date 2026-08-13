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

## Level 3 full solver (in progress)

Groundwork for a Level 3 solver that handles *every* legal move, not just the
block-rigid set. Status: infrastructure done, tool discovery partly solved.

- `l3sim.ts` — integer simulator of the Level 3 puzzle (8000 sites, 3,591 legal
  atoms). Atoms are **sparse**: dense per-atom permutations would need 284 MB.
  Also carries the hierarchical digit decomposition `p = 9B + 3b + o` and the
  resulting 15 piece classes, and `commutatorCandidates`, which bounds the
  support of `[A,B]` by `supp(B) ∪ A⁻¹(supp(B))` — the trick that makes seed
  discovery take 0.1 s instead of hours.
- `l3-full-estimate.ts` — the 15-class decomposition and the projected solution
  length, calibrated on the measured Level 2 solver.
- `l3-tools-probe.ts` — builds the `[frame, depth-2/2.5]` tool family and
  measures per-class coverage.
- `l3-tools-families.ts` — which seed family reaches which class. Shows
  depth-2/2.5 reaches only `b = E` classes (as class invariance predicts) and
  that depth-1/1.5 moves (400 and 160 cells) are far too big to yield any
  small-support commutator.
- `l3-tools-frames.ts`, `l3-tools-frames2.ts` — tools for the `b = C` classes,
  which no extension move can reach. The first probe looks for commutators with
  *small* support and finds none; the second uses Level 2's actual criterion —
  two words whose class-restricted supports meet in **exactly one cell** — and
  finds 112,872 tools covering 4 of the 5 classes.
- `l3-ccc-check.ts` — why the fifth class (`CCC`) still gets none: candidate
  words move `CCC` cells only in groups of 0, 64, 128 or 256, so two supports
  can never meet in exactly one cell. A structural obstacle, not a search budget.

### Where this stands

Tools now exist for 5,568 of the 8,000 cells. Still uncovered: `CCC` (512
cells) and the four "oblique" `b = E` classes where `B` and `b` have different
zero axes (`EEC/B|b`, `EEE/Bo|b`, `EEE/B|bo`, `EEE/B|b|o`, 1,920 cells).

Next step is to break the overlap granularity that blocks them, by widening the
candidate pool beyond `[slice, g h g⁻¹]` — deeper conjugations `g₁ g₂ h g₂⁻¹ g₁⁻¹`,
or products of two conjugates. Everything after that follows the Level 2
template: orbit-parity normalization (Level 3 has 164 orbits against Level 2's
11), per-class orientation freedom and twist tools, then a placement pipeline
ordered `b = C` first (scope-restricted tools, may disturb `b = E`) and `b = E`
last (fully pure — class invariance guarantees they never touch `b = C`).

Projected solution length is ~77–83k moves; see `l3-full-estimate.ts`.

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
- `l2-longer-cycles.ts` — the other direction: keep the word length and widen
  the tool. Classifies every pure shape the interchange construction throws off
  (5-cycles, double 3-cycles, 7-cycles, 4+4) and their atoms-per-cell, and
  asserts the parity facts — no odd permutation and no lone 4-cycle can appear,
  because every commutator is even. This is the evidence behind v0.3.0.

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

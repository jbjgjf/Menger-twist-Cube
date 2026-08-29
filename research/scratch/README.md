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
block-rigid set. Status: the group structure is settled; tool discovery and the
pipeline remain.

- `l3sim.ts` — integer simulator of the Level 3 puzzle (8000 sites, 3,591 legal
  atoms). Atoms are **sparse**: dense per-atom permutations would need 284 MB.
  Also carries the hierarchical digit decomposition `p = 9B + 3b + o` and its 15
  piece classes, and `commutatorCandidates`, which bounds the support of `[A,B]`
  by `supp(B) ∪ A⁻¹(supp(B))` — the trick that makes seed discovery take 0.1 s
  instead of hours.
- `l3-orbit-decomposition.ts` — the 8000 cells fall into **164 orbits** (sizes
  8, 24, 96, 192, 384) and a cell never leaves its own. The orbit, not the class,
  is the unit a solver has to handle: a 3-cycle can only live inside one.
- `l3-orbit-groups.ts` — **the group on every orbit.** All 164 are primitive, and
  each is shown to contain `Alt(orbit)` — the four size-8 orbits by enumerating
  the group outright (they are `Sym(8)`), the rest by exhibiting a p-cycle and
  applying Jordan's theorem. The p-cycle comes from a random element via the
  power trick, so each verdict is a constructive certificate rather than a
  statistical claim. Also derives a state-space and God's-number lower bound.
- `l3-tools-probe.ts` — the `[frame, depth-2/2.5]` tool family and its per-class
  coverage.
- `l3-tools-families.ts` — which seed family reaches which class. Shows
  depth-2/2.5 reaches only `b = E` classes (as class invariance predicts) and
  that depth-1/1.5 moves (400 and 160 cells) are far too big to yield any
  small-support commutator.
- `l3-tools-corner.ts` — tools for the `b = C` classes, which no extension move
  can reach, using Level 2's criterion: two words whose class-restricted supports
  meet in **exactly one cell**. 112,872 tools over 4 of the 5 classes.
- `l3-orbit-tools.ts` — **step 2:** tools found per orbit rather than per class.
  Restricted to an orbit the same words have tiny supports, so the interchange
  criterion `|supp_O(A) ∩ supp_O(B)| = 1` fires between *bare atoms* — giving
  **4-atom tools** where Level 2 needs 16, and 90-95% direct ordered-pair
  coverage on the 24-cell orbits (no setup conjugation needed at all).
- `l3-tool-inventory.ts` — the merged inventory across all three constructions
  (orbit-local, their interchange, and the class-level `[frame, depth-2/2.5]`
  family), which cover different orbits.
- `l3-full-estimate.ts` — projected solution length, calibrated on Level 2.

### Where this stands

**Step 1 is complete: there is no structural obstruction anywhere.** Every one of
the 164 orbits is primitive and carries at least `Alt(orbit)`, so a pure 3-cycle
exists on every orbit and the reduction method applies to all 8000 cells. Two
earlier readings of the data said otherwise and were wrong: `CCC` looked blocked
because its supports were measured at class level (512 cells) rather than orbit
level (8 or 24), and coverage was computed against 64M class-level ordered pairs
when only 803,264 within-orbit pairs can ever be needed.

**Step 2 is partly done** (`l3-tool-inventory.ts`):

| | orbits | cells |
| --- | ---: | ---: |
| at least one tool | 135/164 | 6,936/8,000 |
| of those, a *globally pure* tool | 60/164 | 2,688/8,000 |
| no tool yet | 29/164 | 1,064/8,000 |

Two things still needed. First, the 29 uncovered orbits — mostly `CCC` and the
96-cell `ECC`/`ECE` orbits. Second, global purity for the 96-cell orbits: a
4-atom orbit-local tool disturbs 50-80 cells elsewhere, so it can only run while
those orbits are still unsolved, and the last phases need tools that disturb
nothing. Level 2 gets those by interchanging two small-support seeds; here the
orbit-local tools are too globally wide (minimum 21-79 cells) for that to fire
above size 24.

These are search-budget limits, not impossibility results — step 1 proved the
tools exist. Both searches are capped (400 tools per orbit, 200 interchange
seeds, first hit wins), so the table is a floor.

The 4-atom tool length is a large and unexpected win: it is a quarter of Level
2's edge tools, which would put the finished solver well below the 60-70k moves
projected from Level 2's cost model.

Remaining after step 2: orbit-parity normalization (an F₂ system over 164 orbits
against Level 2's 11); per-class orientation freedom and twist tools; the
placement pipeline with a phase order consistent with each tool's disturbance
set; then the port to `packages/solver-core` with exact-replay verification.

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

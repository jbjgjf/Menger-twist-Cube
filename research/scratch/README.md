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

## Level 3 full solver

The research behind
[`docs/algorithms/level3-slice-reduction-solver.md`](../../docs/algorithms/level3-slice-reduction-solver.md),
which handles *every* legal move, not just the block-rigid set. Complete: the
group structure is settled, all 164 orbits have a globally pure tool, orientation
and parity are solved, and the production solver ships.

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
- `l3-tool-inventory.ts` — **step 2:** tools found per orbit rather than per
  class. Restricted to an orbit the same words have tiny supports, so the
  interchange criterion `|supp_O(A) ∩ supp_O(B)| = 1` fires between *bare
  atoms* — giving **4-atom tools** where Level 2 needs 16. Settles every orbit
  of size 8 and 24 with globally pure tools.
- `l3-tools-classlevel.ts` — the complementary half: the class-level
  `[frame, depth-2/2.5]` family, 16 atoms and globally pure by construction,
  which reaches the large orbits the orbit-local interchange cannot.
- `l3-orbit-tools.ts` — the earlier orbit-local pass, kept for its per-orbit
  ordered-pair coverage figures (90-95% direct on the 24-cell orbits, i.e. no
  setup conjugation needed there at all).
- `l3tools.ts` — the shared tool search both the inventory and the twist search
  call. It exists because reproducing the search twice already produced one
  silently wrong result: a quick reimplementation dropped the conjugate pool and
  reported zero tools where the inventory had found hundreds.
- `l3-orient-freedom.ts` — **step 3a:** the exact (site x rotation) single-piece
  automaton per orbit, giving each orbit's orientation freedom as a subgroup of
  the 24 rotations.
- `l3-twist-tools.ts` — **step 3b:** twist tools for the orbits whose orientation
  is not determined, built Level 2 style from two globally pure 3-cycles on the
  same ordered cycle with different rotation profiles.
- `l3-twist-d4.ts` — the last twistable orbit, the 192-cell `EEE/Bbo` whose
  freedom is D₄. Builds twisters both ways and checks the criterion that actually
  matters: not whether a tool *applies* a missing rotation, but whether every
  hard residue has a twist that drops it to roll-fixable.
- `l3-parity.ts` — **step 4:** the orbit-parity space. Tools are commutators and
  orbits are invariant, so every tool is even on every orbit and parity has to be
  fixed once, up front, by raw turns.
- `l3-phase-order.ts` — **step 5a:** is there a phase order in which every
  orbit's tool disturbs only orbits solved later? Caches the expensive tool and
  disturbance computation in `l3-phase-order.cache.json`.
- `l3-ladder.ts` — **step 5b diagnostic:** how far the tightening ladder
  descends. Level 2 goes atoms(44) → seeds(≤9) → tools(3) in two rungs; this
  measures the rung-2 support distribution at Level 3 instead of guessing at
  another seed family.
- `l3-wide-tools.ts` — pure tools of *any* cycle shape (not just 3-cycles) for
  the blocking orbits.
- `l3-why-impure.ts` — why the tight rung-2 words are not pure tools, split into
  the two possible causes. This is what found the orbit coupling.
- `l3-tight-seeds.ts` — the `[frame, depth-1/1.5]` family, ruled out: seeds
  sharing any cell always share more than four.
- `l3-global-tool-inventory.ts`, `l3-conjugate-isolation.ts` — the construction
  that finished the job: a globally pure tool for all 164 orbits, 47 of them via
  conjugate isolation.
- `l3-export-solver-data.ts` — emits the verified words as the static
  `packages/solver-core/src/algorithms/level3SliceReductionToolData.ts`, so the
  shipped solver reads no filesystem and runs in the browser.
- `l3-placement-prototype.ts` — the end-to-end research prototype the production
  solver was ported from.
- `l3-audit-tooldata.ts` — re-derives the orbits and audits every exported word
  independently of the generator that produced it.
- `l3-sim-vs-engine.ts` — applies random legal words in both the sparse simulator
  and `@menger/engine` and compares all 8000 cells. Without this, every result
  computed in the simulator would be unverified.
- `l3-coupled-pairs.ts`, `l3-orbit-coupling.ts`, `l3-pair-isolation.ts` — the
  coupling investigation that disproved the orbit-pair hypothesis.
- `l3-full-estimate.ts` — projected solution length, calibrated on Level 2.

### What this established

**No structural obstruction anywhere.** All 164 orbits are primitive and each
carries at least `Alt(orbit)`, so pure tools exist on every one and the reduction
method reaches all 8000 cells. State space ≥ 10^11395; God's number ≥ 3,206 moves
from positions alone.

**One globally pure tool per orbit, 164/164.** 117 from interchanging small-support
commutators, 47 from **conjugate isolation** — the commutator of a tool `T` with
its own setup conjugate `gTg⁻¹`, which cancels the part of `T` reaching outside
the orbit. Support widths 3 (×133), 4 (×17), 6 (×14); no spill, no stationary
twist. Because pure tools disturb nothing, orbits solve in any order and the
solver needs no phase ordering at all.

**Orientation is nearly free.** 7,224 of 8,000 cells have their orientation
determined by position. Only 16 orbits (776 cells) can twist: 11 with C₄ freedom
that one depth-3 roll clears, 4 `CCC` orbits with C₃ and no legal roll that need
twist commutators, and the 192-cell D₄ orbit where two of seven residues need a
descending twist rather than a direct fix.

**Parity is rank 15**, not 164 — the orbits' parities are strongly correlated —
and the GF(2) system is never inconsistent for a reachable state.

### Three wrong turns, recorded because they cost real time

1. **Measuring at class level instead of orbit level.** Supports and coverage
   computed over a 512–768 cell class produced a confident but false "`CCC` is
   structurally blocked" conclusion. The orbit (8–96 cells) is the meaningful
   unit.
2. **Requiring tools to be exactly 3-cycles.** Level 2 v0.1.0 made this mistake
   and v0.3.0 fixed it; it was then repeated at Level 3. Wider shapes are usable
   and land more cells per tool.
3. **Concluding the solving unit is a coupled orbit *pair*.** `l3-why-impure.ts`
   found that on the 96-cell `EEE/B|b|o` orbit every one of 4,392 tight words
   spans exactly two orbits, and that was generalized into a claim about the
   whole puzzle. It is false: exhaustive diagonal coupling over all legal atoms
   is zero, and conjugate isolation produces single-orbit tools for every one of
   the 40 orbits that looked blocked. `l3-coupled-pairs.ts`, `l3-orbit-coupling.ts`
   and `l3-pair-isolation.ts` are the scripts that disproved it.

`l3-phase-order.ts`, `l3-ladder.ts`, `l3-wide-tools.ts`, `l3-why-impure.ts` and
`l3-tight-seeds.ts` are kept as the record of that dead end — they document what
was measured, not a design the solver uses.

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

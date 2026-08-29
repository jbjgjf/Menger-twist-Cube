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
block-rigid set. Status: steps 1-3 are done — the group structure is settled,
every orbit has a tool, and orientation is characterised. Parity, the placement
pipeline and the port remain.

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
- `l3-full-estimate.ts` — projected solution length, calibrated on Level 2.

### Where this stands

**Step 1 complete: there is no structural obstruction anywhere.** Every one of
the 164 orbits is primitive and carries at least `Alt(orbit)`, so a pure 3-cycle
exists on every orbit and the reduction method applies to all 8000 cells. Two
earlier readings of the data said otherwise and were wrong: `CCC` looked blocked
because its supports were measured at class level (512 cells) rather than orbit
level (8 or 24), and coverage was computed against 64M class-level ordered pairs
when only 803,264 within-orbit pairs can ever be needed.

**Step 2 complete: every orbit has a tool.** The two constructions turn out to be
exactly complementary — orbit-local settles the small orbits, class-level the
large ones:

| | orbits | cells | tool length |
| --- | ---: | ---: | --- |
| globally pure, orbit-local | 116/164 | 2,720 | 4-8 atoms |
| globally pure, class-level | 8/164 | 1,440 | 16 atoms |
| **globally pure, either** | **124/164** | **4,160** | |
| orbit-local only | 40/164 | 3,840 | 4-8 atoms |
| **any tool at all** | **164/164** | **8,000** | |

The 40 orbits with no globally pure tool are all of size 96 (`ECC`, `ECE/*`,
`EEC/B|b`, `EEE/Bo|b`, `EEE/B|bo`, `EEE/B|b|o`). Their orbit-local tools disturb
~50 cells elsewhere, so those orbits have to be solved **first**, while the rest
is still scrambled — structurally the same arrangement Level 2 uses, where
corner classes get scope-pure tools and run first and edge classes get globally
pure tools and run last.

Why the interchange cannot make those 40 globally pure: it needs two words whose
supports meet in *exactly one* cell. Level 2's seeds have support ≤ 9, so that
happens readily. The orbit-local tools here are ~50 cells wide, and two 50-cell
supports in 8000 sites either miss each other entirely or meet in several cells —
almost never in exactly one. The class-level family has tight (≤ 9) seeds and so
does produce globally pure tools, but only for the `b = E` classes its seeds can
reach.

Note only *one* globally pure tool per orbit is needed: purity is preserved under
conjugation, and setup conjugation moves a tool anywhere within its orbit, which
is how Level 2's pair-BFS covers a class from a template library.

**The 4-atom tool length is the headline win.** It is a quarter of Level 2's edge
tools, so the finished solver should land well under the 60-70k moves projected
from Level 2's cost model.

**Step 3 essentially complete: orientation is nearly free at Level 3.** The
single-piece automaton (`l3-orient-freedom.ts`) shows **7,224 of 8,000 cells have
their orientation determined by position** — the Level 2 `EC` theorem, but
covering 90% of the puzzle instead of 24%. Only 16 orbits, 776 cells, can be
twisted at all:

| orbits | cells | freedom | legal in-place roll | how it is handled |
| ---: | ---: | --- | --- | --- |
| 11 | 552 | 4 (C₄) | yes | one depth-3 turn realizes the whole group — no commutator needed |
| 4 | 32 | 3 (C₃) | **no** | **674 twisters each**, twisting 2-3 cells (`l3-twist-tools.ts`) |
| 1 | 192 | 8 (D₄) | yes | rolls give the C₄ half; the flips still need tools |

The `CCC` orbits were the dangerous case — corner-style C₃ twists with no legal
roll to fall back on, so tools were the only route. They have them.

The one loose end is the 192-cell `EEE/Bbo` orbit, whose D₄ freedom is exactly
the shape of Level 2's `EEa`: rolls reach half of it and the diagonal flips need
a twist tool. Level 2 solves this with a joint `[E2, T]` pair application under
strict potential descent, and that orbit does have globally pure tools (from the
class-level family), so the same construction should transfer — it just has not
been run yet.

Remaining: (4) orbit-parity normalization, an F₂ system over 164 orbits against
Level 2's 11; (5) the placement pipeline, whose phase order must put the 40
orbit-local-only orbits before the 124 pure ones; (6) the port to
`packages/solver-core` with exact-replay verification.

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

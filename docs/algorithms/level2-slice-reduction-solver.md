# Level 2 slice-reduction solver (`level2-slice-reduction`)

Implementation: [`packages/solver-core/src/algorithms/level2SliceReductionSolver.ts`](../../packages/solver-core/src/algorithms/level2SliceReductionSolver.ts). Registered under algorithm id `level2-slice-reduction` (see [`register.ts`](../../packages/solver-core/src/algorithms/register.ts)).

This solver removes the restriction of the [Level 2 block-quotient solver](level2-block-quotient-solver.md): it solves **every reachable Level 2 state**, including scrambles that use single-layer (scale-1) slice turns and depth-1.5 slab twists — the moves that tear 3×3×3 blocks apart. The supported scramble generator set is the *full* Level 2 move set:

| Generator | Count | Effect |
| --- | --- | --- |
| Scale-1 slices (`X-4` … `Z+4`) | 27 | Rotate one 1-cell layer; moves cells **across block boundaries** |
| Scale-3 frame turns (`X[1/3]` …) | 9 | Permute whole blocks like a 3×3×3 |
| Depth-1 block extensions (`E1:*`) | 12 | Rotate one edge block in place |
| Depth-1.5 slab twists (`S1.*`) | 36 | Rotate one 3×3×1 slab of an edge block |
| Depth-2 cell rolls (`E2:*`) | 240 | Roll one unit cell in place |

Like every solver in this repo it reads only the current `Cubie[]` state (never `moveHistory`), outputs replayable legal moves, and fails honestly with a structured explanation when it cannot proceed.

## Why a new method is needed

A scale-1 slice cuts through the middle of blocks: after one slice turn, a 3×3×3 block region contains cells from several home blocks, so the state no longer projects onto a Level 1 macro puzzle and the block-quotient pipeline rejects it. Solving such states requires a **reduction**: put every cell back into its home block (in fact, back onto its exact home site), then only orientation errors remain. This is the Menger analogue of big-cube reduction (4×4×4 → 3×3×3), done here at the level of individual cells with commutator 3-cycles — and structured, like the Rubik's-cube LBL method, as an ordered sequence of goals, each with a dedicated small tool set that provably cannot destroy the goals already achieved.

## The piece system: 5 classes, 11 orbits

Write every cell position as `p = 3b + o`, where `b ∈ {-1,0,1}³` is the **block digit** (which 3×3×3 block) and `o ∈ {-1,0,1}³` the **offset digit** (position inside the block). Both digits have at most one zero component (the Menger rule). Cells fall into five classes:

| Class | Members | Description |
| --- | --- | --- |
| `CC` | 64 | corner block, corner cell (`b` and `o` have no zero) |
| `CE` | 96 | corner block, edge cell (`o` has one zero) |
| `EC` | 96 | edge block, corner cell (`b` has one zero) |
| `EEa` | 48 | edge block, edge cell, **aligned** (zero axes of `b` and `o` agree) |
| `EEo` | 96 | edge block, edge cell, **oblique** (zero axes differ) |

**Class invariance lemma.** Every legal move maps each class to itself. Frames rotate `b` and `o` by the *same* rotation (a slice at layer `3k+m` about axis `A` affects cells with `b_A = k ∧ o_A = m` and rotates both digits — the fractal self-similarity in coordinates); extensions rotate `o` only. Rotations preserve the zero-pattern of each digit and their relative alignment. *(Verified exhaustively over all 972 move atoms: 0 violations.)*

Under the full move group the classes split further into **11 position orbits** (computed by union-find over all move-atom permutations): `CC` and `CE` each split into 4 orbits by the multiset of coordinate magnitudes — e.g. the `(±4,±4,±4)` outer corners never mix with the `(±2,±2,±2)` inner corners — while `EC`, `EEa`, `EEo` are single orbits (block extensions and slabs merge what slices alone keep apart). A cell can only ever visit sites in its own orbit; every 3-cycle used below cycles three sites of one orbit.

**Orientation freedom per class** (computed exactly with a per-piece (site × 24 rotations) reachability automaton):

| Class | Orientations at home | Structure |
| --- | --- | --- |
| `CC` | 3 | twist about the cell's block diagonal — exactly like a 3×3×3 corner |
| `CE` | 4 | rolls about the cell's slot axis — every one removable by a single `E2` |
| `EC` | **1** | **orientation is completely determined by position** — never needs fixing |
| `EEa` | 8 | dihedral `D₄`: 4 rolls × 2 flips (flips include the hard diagonal-180 cases) |
| `EEo` | 4 | rolls about the slot axis — `E2`-removable |

The `EC` theorem is the pleasant surprise of the analysis: placing an edge-block corner cell automatically orients it.

## The tool families

Like LBL's named algorithms ("Sune", "T-perm"), the solver uses a small number of *tool schemas*; the concrete instances (~72k pure 3-cycles, ~30k twisters) are discovered automatically from the schemas when the solver first runs (~3 s, cached) and verified against the engine.

1. **Edge-region 3-cycles** — commutators `[slice, E1/slab]` have position support confined to edge-block cells (**corner-safety lemma**: `E1`/slab moves never touch corner blocks, and class invariance confines the commutator; verified over all 15,552 such commutators — 0 corner touches). Interchange-composing two of them that share exactly one site yields *pure 3-cycles* on `EC`/`EEa`/`EEo` (support exactly 3 cells, zero rotation side effects), 16 atoms long.
2. **Corner-region 3-cycles** — commutators `[slice, conjugated-slice]` (the big-cube pattern `r · (U r' U')`-style, 8 atoms) whose class-restricted supports share exactly one cell give 3-cycles on `CC` or `CE` that never move the other corner class; they may scramble edge regions, which is why corner phases run first.
3. **Twist commutators** — two 3-cycles on the *same* ordered cycle with different rotation profiles compose to a position-identity word that twists ≤ 3 cells (`T_i · T_j⁻¹`); and `[E2, T]` twists exactly 2 cells (a roll at the `E2` cell, its inverse conjugate at the cycle predecessor).
4. **Setup conjugation** — any tool `T` can be conjugated by an arbitrary setup word `U` (`U T U⁻¹`): the side effects of `U` cancel, and by class invariance the conjugated tool's support stays inside the same classes. Setups are found by breadth-first search over ordered site pairs (≤ 9120 states), so each placement is `setup + template + setup⁻¹` (~16–30 atoms).

## Parity: the one thing 3-cycles cannot fix

3-cycles are even permutations, so each orbit's permutation parity is invariant during solving. Quarter turns, however, flip orbit parities in fixed patterns *(computed per atom; the per-class table is verified exhaustively)*:

- slices and scale-3 turns: always **even** on every class, but **odd on sub-orbit pairs of `CC`/`CE`** (e.g. an outer slice quarter is odd on the `(4,4,4)` and `(4,2,2)` `CC` orbits simultaneously);
- an `E1` quarter turn: odd exactly on `EEa`;
- an outer slab quarter: odd on `EC` and `EEo` simultaneously;
- `E2` rolls: no permutation at all.

**Phase 1 therefore computes the 11-bit orbit-parity vector of the state and solves an F₂ linear system over the distinct atom parity vectors**, applying the few quarter turns (usually 0–3) that make every orbit even. Because every later tool is a commutator (even on every orbit), parity stays normalized for the rest of the solve. A state whose parity vector lies outside the span of the generators is provably unreachable and is rejected honestly.

## The solve, layer-by-layer style

Each phase has one goal and uses only tools that cannot undo previous phases:

| # | Phase | Tools | Why earlier phases survive |
| --- | --- | --- | --- |
| 0 | **Fast path** — if the state is block-rigid, delegate to the [block-quotient solver](level2-block-quotient-solver.md) (short, ~25-move solutions) | — | — |
| 1 | **Orbit parity normalization** | quarter turns from the F₂ solution | runs first; later tools are parity-neutral |
| 2 | **`CC` placement** — put all 64 corner-block corner cells home | corner 3-cycles + slice setups | nothing solved yet |
| 3 | **`CE` placement** | corner 3-cycles (`CE`-pure) | `CE` tools never move `CC` cells |
| 4 | **`CC` orientation** | `CC` twist commutators | position-identity on corner regions; edge side effects allowed because edge phases follow |
| 5 | **`EC` placement** (orientation comes free — the `EC` theorem) | edge 3-cycles + full setups | edge tools provably never touch corner regions |
| 6 | **`EEa` placement**, then **`EEo` placement** | edge 3-cycles | pure: support is exactly 3 cells of one class |
| 7 | **Orientation normalization** (`CE`, `EEa`, `EEo`) | `E2` rolls, twist commutators | all tools position-identity, twist support confined to edge/`CE` cells |
| 8 | **Exact verification** — replay all moves on the real 400-cell state; success requires `isExactlySolved` | — | — |

Details that make the phases robust:

- **Two cells per tool.** A 3-cycle moves three cells, so aiming only the first wastes two thirds of the tool. The third site is not free to choose outright, but it can be *asked for*: send the cell currently sitting on the target to its own home. The pair-BFS looks that specific third site up directly (`byPair` is indexed by ordered pair and then by third site), and falls back to any admissible third site when no such template exists. Measured yield: **2.00–2.14 cells per tool** across all five classes.

  This is close to the ceiling for any 3-cycle method. Solving a permutation of `n` unsolved cells in `c` cycles needs `(n − c)/2` 3-cycles, and a random permutation of ~96 cells has `c ≈ ln 96 ≈ 4.6` cycles, so the bound is ≈ 2.13 cells per tool. Phase-by-phase the solver lands 2.00 (EC), 2.00 (EEa), 1.98 (EEo), 2.07 (CE), 2.14 (CC) — within a few percent of it. Further gains have to come from shorter tools or a different paradigm, not from better cycle choice.

- **Orientation-first placement.** When placing a cell, the pair-BFS prefers a template variant that lands the cell *exactly oriented*, so phase 7 starts with only a handful of residues. Ranking is strictly orientation-first, then cell count, then the second cell's orientation, then word length — so the two-cell preference never trades away the orientation property that keeps phase 7 cheap. Because a tool costs ~20 atoms and one extra BFS level costs 2, the search spends up to two extra levels looking for a two-cell placement before settling for a one-cell one.
- **Aux-cell discipline.** A 3-cycle placing cell `x → s` also disturbs a third cell `z`; the search only accepts candidates whose `z` is not yet solved. If the last few cells form a configuration with no matching template triple, the solver deterministically *sacrifices* one solved cell of the class to reshape the configuration and retries (bounded).
- **Potential-descent twisting.** Phase 7 assigns each cell a potential (0 solved / 1 removable by one `E2` roll / 2 otherwise) and only applies twist tools that strictly decrease the total. This handles `EEa`'s hard case — two diagonal-flip residues, which no single tool can fix — by a joint pair application (`[E2-180, T]` carries face-180 twists at both cells: 2+2 → 1+1), then `E2` rolls finish. Strict descent guarantees termination.

## Invariants

- Cell identity: no cell is created or destroyed; every output move is a legal frame or extension target replayable by the Play reducer.
- Determinism: tool discovery and every search iterate in fixed orders; the same state always yields the same solution.
- Phase isolation is structural (class invariance + corner-safety + conjugation closure), not incidental — the properties above were verified exhaustively at analysis time and are re-checked at solve time by the final replay gate.
- Honest failure: unreachable parity vectors, non-grid orientations, or an exhausted search produce `success: false` with the failing phase and cell named.

## Complexity and measured results

- One-time library build: ~2.5–3 s (interchange search over ~2.8k seed commutators + 5.2k conjugate pairs; cached per process, pre-warmable via `warmLevel2SliceReductionSolver()`).
- Per solve: parity `O(400)` + F₂ solve over ≤ ~20 generator vectors; ~180 placements, each a pair-BFS over ≤ 9120 states; twist descent with single/pair BFS. Adjacent same-target turns are peephole-merged before output (worth ~2.6%).

Measured (M-series laptop, 10 seeded scrambles each, full generator set via the algorithm's `scrambleMovePool`), excluding the one-time library build:

| Scramble length | Success | Avg runtime | Avg solution length | v0.1.0 length |
| --- | --- | --- | --- | --- |
| 20 | 100% | ~0.45 s | ~2,698 moves | ~4,200 |
| 50 | 100% | ~0.49 s | ~3,031 moves | ~4,500 |
| 100 | 100% | ~0.51 s | ~3,057 moves | ~4,600 |
| 200 | 100% | ~0.57 s | ~3,067 moves | — |
| 300 | 100% | ~0.64 s | ~3,082 moves | — |

The last column is v0.1.0, which aimed one cell per 3-cycle; v0.2.0's two-cell placement cut solution length by ~33% and runtime by roughly half. Solution length saturates around 3,050 because past ~50 scramble moves essentially every cell needs placing, and the cost is then just (cells / 2) tools.

Block-rigid scrambles (the old generator set) take the fast path and return the block-quotient's ~25-move solutions unchanged.

Where the moves go, per phase, averaged over 9 runs at lengths 20/50/100 (`research/scratch/l2-cost-profile.ts`):

| Phase | Atoms | Cells | Atoms/cell |
| --- | ---: | ---: | ---: |
| orbit parity normalization | 2 | — | — |
| CC placement | 239 | 64 | 3.7 |
| CE placement | 374 | 96 | 3.9 |
| CC orientation | 54 | — | — |
| EC placement | 852 | 96 | 8.9 |
| EEa placement | 389 | 48 | 8.1 |
| EEo placement | 854 | 96 | 8.9 |
| orientation normalization | 195 | — | — |
| **total** | **2,959** | | |

The edge classes cost twice what the corner classes do for one structural reason: corner tools only have to be pure *on the corner classes* — they run first and may scramble edge regions freely — which the `[slice, conjugated-slice]` construction achieves in 8 atoms. Edge tools run last and must be pure on all 400 cells, which needs the 16-atom interchange. Reversing the phase order does not help: the 4-atom `[frame, E1/slab]` seeds are already corner-safe, so edge tools gain nothing from being allowed to disturb corners.

Reproduce from the CLI:

```
npm run bench -- --algorithm=level2-slice-reduction --level=2 --count=10 --length=50
```

## Limitations and future work

- **Solution length.** Now ~3,050 moves for deep scrambles, and the easy levers are spent. What was measured and ruled out:
  - *Better cycle choice* — at 2.00–2.14 cells per tool the solver is within a few percent of the `(n − c)/2` bound for 3-cycle methods (above). No room left.
  - *Shorter edge templates* — `research/scratch/l2-short-tools.ts` and `l2-short-tools2.ts` swept commutator shapes `[A,B]` with `|A|+|B| ≤ 3` (word lengths 4 and 6) over ~1M candidates and found **no** pure 3-cycles at all, and 8-atom seed products only on `EEa`. Wiring those `EEa` tools in cut that phase by 8% while tripling the library build, so they are deliberately left out.
  - *Macro pre-alignment* — a majority-vote block assignment recovers only ~99/400 cells at scramble length 50 and ~87/400 at 100 (`l2-cost-profile.ts`), so there is little coherent block structure left to exploit. It would help short scrambles only.
  - *Peephole* — adjacent same-target merging is worth 2.6%; a commutation-aware rewriter would add a few percent more at most.

  The remaining paradigm-level idea is to stop insisting on isolation early: 3-cycles exist to protect already-solved cells, but at the start of a phase almost nothing is solved, so far more powerful non-isolating tools (a single slice permutes ~44 cells) could do the bulk of the work before commutators finish the job — the twisty-puzzle analogue of block-building before last-layer algorithms.
- **`CC`/`CE` orbit-pair fixers** are chosen greedily from the F₂ solution; choosing fixers that also reduce placement distance would shave moves.
- **Level 3+**: the same class/orbit analysis applies one fractal step up; the corner-safety lemma generalizes (depth-1 extensions never touch corner-block regions at any level), suggesting a recursive reduction tower. The first rung exists: the [Level 3 block-quotient solver](level3-block-quotient-solver.md) quotients Level 3 by its mid-blocks onto a Level 2 puzzle and delegates the macro solve to *this* solver, so any improvement here carries to Level 3 one-for-one. What is still missing at Level 3 is the cell-level reduction that repairs scale-1 slices and depth-2.5 slabs — the direct analogue of this document.

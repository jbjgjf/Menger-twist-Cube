# Level 3 slice-reduction solver (`level3-slice-reduction`)

Implementation: [`packages/solver-core/src/algorithms/level3SliceReductionSolver.ts`](../../packages/solver-core/src/algorithms/level3SliceReductionSolver.ts). Registered under algorithm id `level3-slice-reduction` (see [`register.ts`](../../packages/solver-core/src/algorithms/register.ts)).

This solver removes the restriction of the [Level 3 block-quotient solver](level3-block-quotient-solver.md): it solves **every reachable Level 3 state**, including the scale-1 slices and depth-2.5 slab twists that tear 3×3×3 mid-blocks apart. Those two families are 801 of the puzzle's 5,925 turn targets, and they are exactly what the block quotient rejects.

Like every solver here it reads only the current `Cubie[]` state (never `moveHistory`), checks legality before every emitted move, and gates success on an exact replay of the whole solution on the real 8,000-cell state.

## The structure it rests on

Four facts, each machine-verified by a script under [`research/scratch/`](../../research/scratch/README.md).

**The orbit is the unit, not the class.** The 8,000 cells fall into **164 orbits** — sizes 8 (×4), 24 (×112), 96 (×45), 192 (×1), 384 (×2) — and a cell never leaves its own. Only 803,264 within-orbit ordered pairs can ever matter, against 64M if cells were freely permutable. The hierarchical digit decomposition `p = 9B + 3b + o` gives 15 piece classes, but a class splits into many orbits and a 3-cycle can only live inside one, so the class is the wrong granularity to reason at. (`l3-orbit-decomposition.ts`)

**Nothing is stuck.** Every orbit is *primitive*, and each is shown to contain `Alt(orbit)`: the four 8-cell orbits by enumerating their group outright — they are `Sym(8)` — and the rest by exhibiting a p-cycle and applying Jordan's theorem, the p-cycle extracted from a random element by the power trick. Each verdict is a constructive certificate, not a statistical claim. (`l3-orbit-groups.ts`)

**Every orbit has one globally pure tool.** A permutation of 3, 4 or 6 of its cells that leaves every other cell of the puzzle untouched in both position and orientation. 117 come from interchanging two small-support commutators; the other 47 from **conjugate isolation** — the commutator of a tool `T` with its own setup conjugate `gTg⁻¹`, which cancels the part of `T` that reaches outside the orbit. Support widths: 3 for 133 orbits, 4 for 17, 6 for 14. The words are shipped as static data in [`level3SliceReductionToolData.ts`](../../packages/solver-core/src/algorithms/level3SliceReductionToolData.ts) and re-verified at library-build time. (`l3-global-tool-inventory.ts`, `l3-conjugate-isolation.ts`, audited independently by `l3-audit-tooldata.ts`)

Because those tools disturb nothing, **orbits can be solved in any order** — the solver needs no phase ordering at all. This is the one place Level 3 is *simpler* than Level 2, whose corner tools are only pure on the corner classes and therefore have to run first.

**Orientation is nearly free.** The exact (site × rotation) single-piece automaton shows **7,224 of 8,000 cells have their orientation determined by position** — the Level 2 `EC` theorem, but covering 90% of the puzzle instead of 24%. Only 16 orbits (776 cells) can be twisted at all: 11 with freedom C₄, where one legal depth-3 turn realizes the whole group; 4 `CCC` orbits with freedom C₃ and *no* legal in-place roll, which need twist commutators; and one 192-cell orbit with freedom D₄, where rolls reach five of seven residues and the other two descend via a twist. (`l3-orient-freedom.ts`, `l3-twist-tools.ts`, `l3-twist-d4.ts`)

## Algorithm

Algorithm name: `level-3-slice-reduction-commutator`. A lazily built library plus four phases.

### Library (one-time, ~5 s, cached per process)

Sparse atoms for all 3,591 physically legal turns — a dense permutation per atom would need 284 MB, so only the cells each move selects are stored — plus the orbit decomposition, the 164 pure templates resolved from the static word data, the D₄ twisters, and the parity generators. Pre-warm with `warmLevel3SliceReductionSolver()`.

Legality matters and is not incidental: only **744 of the 4,800** depth-3 rolls can physically turn. Legality depends solely on the occupied lattice set, which every legal move preserves, so it is decided once on the canonical state.

### Phase 0: fast path

A block-rigid state is delegated to the [Level 3 block quotient](level3-block-quotient-solver.md), which returns a ~2,600-move solution instead of ~90,000. Its answer is still put through the same legality-checked replay before being returned.

### Phase 1: orbit parity normalization

Every tool below is a commutator, and the restriction of a commutator to an orbit is the commutator of the restrictions — so tools are **even on every orbit**. Orbit permutation parity is therefore invariant across the whole solve and has to be fixed once, up front, with raw turns.

The state's 164-bit parity vector is cleared against a GF(2) basis of the atom parity vectors. Only 20 distinct non-zero vectors exist among the 3,591 atoms and they span a space of **rank 15**, so at most 15 raw turns are ever needed. The system is never inconsistent for a legally scrambled cube: a reachable state's parity vector is by construction a sum of atom vectors and so lies in the span. (`l3-parity.ts`)

### Phase 2: orbit-by-orbit placement

Purity survives conjugation, so one tool per orbit suffices — setup conjugation carries it anywhere inside the orbit. Variants are expanded per orbit (192, or 768 for orbits of 192 cells and up, plus inverses) and indexed by ordered pair.

For each unsolved cell the search runs an ordered-pair BFS over setups, scoring candidates by exact orientation first, then by cells broken, then by cells landed, then by word length, and requiring a net gain (`landed > broken`). Already-solved cells of the orbit are protected, with a sacrifice budget of `width − 2`. The BFS exhausts the finite ordered-pair graph; it has no empirical depth cutoff.

A width-4 or width-6 tool is a double transposition or wider. That is enough to generate `Alt(orbit)`, but greedy placement can cycle on the last three cells, so when two variants sharing one transposition multiply to a clean 3-cycle, the derived 3-cycle replaces the wide tool.

Once 32 or fewer cells remain the orbit is finished exactly rather than greedily: parity was normalized in phase 1, so the residue is even and decomposes into 3-cycles — a cycle of length ≥ 3 is shortened by an exact 3-cycle on its first three points, and two transpositions `(a b)(c d)` are cleared by `(a c d)` then `(a c b)`. The exact 3-cycle on a named ordered triple comes from a bidirectional BFS: forward from the wanted triple, backward from the triples the template library already realizes. This search also exhausts its finite graph; the former depth-8/two-million-node tuning limits were removed in the completion audit.

### Phase 3: orientation

Positions are fixed, so only rotations can be wrong. A twister is a position-identity word; it moves twist between cells rather than removing it from one, so the phase drives a potential — the number of twist steps a cell is from solved, computed by a reverse BFS over the rotation group from the twist effects reachable at that site — strictly downward.

Three twister sources: two pure tools with the same position action but different rotation profiles compose to a pure twist; `[roll, tool]` is a pure twist because a depth-3 roll displaces nothing, so the commutator's support stays inside the tool's three cells and its position action cancels; and the shipped D₄ twisters. A single legal roll is tried first at every site.

Descending one cell at a time can stall when the twister's second cell keeps landing back on the first, so an ordered-**pair** search over `(a, ρₐ, b, ρ_b)` finds the joint application that clears both. Both the single-cell transported-state search and this pair search now exhaust their finite graphs; the former depth-20/400,000-node cutoffs were removed. Each accepted twister strictly lowers a non-negative integer potential, so no arbitrary iteration guard is needed. This is what makes the D₄ orbit terminate.

### Phase 4: verification on the real engine

The pipeline runs on a sparse integer simulator; nothing counts as solved until the engine agrees. The final move list is replayed on a clone of the input state, `model.isMoveLegal` is checked **before every single move**, and the run only succeeds if `isExactlySolved` holds over all 8,000 cells afterwards. Any illegal move or any mismatch is an honest failure.

The simulator's agreement with the engine is itself verified: `l3-sim-vs-engine.ts` applies random legal words in both and compares all 8,000 cells in position and orientation.

## Invariants

- Cell identity: no cell is created or destroyed; every output move is a legal, physically admissible turn replayable by the Play reducer.
- Determinism: tool expansion and every search iterate in fixed orders, so the same state always yields the same solution.
- Completeness for the fixed Level 3 group: the exported words construct a pure generator on all 164 orbits; `Alt(orbit)` supplies triple transitivity; parity is normalized first; and the ordered pair/triple/orientation searches run to exhaustion over finite graphs rather than stopping at empirical depth/node limits.
- Honest failure: unreachable parity vectors, non-grid orientations outside the verified subgroup, a structurally disconnected search graph, an illegal move, or a replay mismatch all produce `success: false` with the failing phase named.

## Limitations

**Solution length.** ~256k moves at scramble length 5 and ~365k at length 20 — several times the 60–70k projected from Level 2's cost model. A length-5 scramble from the declared pool already displaces 4,444 of the 8,000 cells, so these are genuinely scrambled states, not toy ones.

Two things drive it. Template variants are generated by conjugating *already conjugated* variants, so word length compounds: a base tool of 16–84 atoms grows as the expansion goes deeper, and the placement search will happily pick a late, long variant. And each placement pays a setup and its inverse on top. Level 2 pays ~16 atoms per tool for the same job.

The known reductions all carry over from Level 2 and none has been applied here: score tools by cells landed rather than aiming a single cell, admit the wider cycle shapes the same words already contain, cap or re-root the variant expansion so words stop compounding, and cancel setups between consecutive placements.

Note the research prototype's much smaller figures (~35k atoms at "length 5") are not comparable: it samples uniformly over the raw atom set, 62% of which are depth-3 rolls that displace nothing, so its scrambles barely disturb the puzzle. The pool declared here is weighted toward cell-transporting moves precisely so benchmarks are honest.

**Runtime.** ~140 s per solve after the ~1 s library build, dominated by the placement BFS. Correctness came first; this is the next thing to attack.

**Browser playback.** The Lab runs this solver and its benchmarks in an ES-module worker so the multi-minute search does not freeze React. A verified solution above 10,000 moves is deliberately not expanded into one `Cubie[8000]` snapshot and one DOM row per move; the exact solved endpoint and structured result are shown instead. Full move-by-move replay remains available programmatically and in the CLI verification gate.

**Verification breadth.** See the benchmark section — seven seeded runs now cover scramble lengths 5, 20, and 100. That is stronger than the original two runs, but still not the 10-seed grids the Level 1 and 2 solvers use because each solve takes minutes. The completeness argument comes from the finite group/search construction above, not from interpreting seven samples as a proof.

## Benchmarking

The declared `scrambleMovePool` is the **full** Level 3 generator set: every physically legal turn of every family, including the scale-1 slices and depth-2.5 slabs this solver exists to handle and the depth-3 rolls. Nothing the solver finds hard is excluded; repetition counts only weight the sampler toward cell-transporting moves.

```
npm run bench -- --algorithm=level3-slice-reduction --level=3 --seeds=1 --length=20
```

Measured (M-series laptop, full generator set), each run replayed on the real engine with a legality check before every move and gated on `isExactlySolved`:

| Seed | Scramble length | Success | Runtime | Solution length |
| ---: | ---: | --- | ---: | ---: |
| 1 | 5 | yes | 138.1 s | 256,171 |
| 2 | 5 | yes | 112.1 s | 111,830 |
| 1 | 20 | yes | 209.9 s | 364,550 |
| 3 | 20 | yes | 154.8 s | 282,245 |
| 4 | 20 | yes | 249.0 s | 358,331 |
| 5 | 20 | yes | 197.8 s | 350,246 |
| 6 | 100 | yes | 284.2 s | 424,519 |

Committed records are in [`research/results/`](../../research/results/). The completion audit and God's-number bounds are recorded in [`docs/research/level3-solver-completion-audit.md`](../research/level3-solver-completion-audit.md).

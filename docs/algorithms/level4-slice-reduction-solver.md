# Level 4 certified orbit reduction

Algorithm id: `level4-slice-reduction`, version `0.1.0`.
Implementation: [`level4SliceReductionSolver.ts`](../../packages/solver-core/src/algorithms/level4SliceReductionSolver.ts).
Proof: [`Level 4 completeness`](../proofs/level4-completeness.md).

The solver handles the **full standard move system** on all 160,000 cells. It
reads the current positions and quaternions, with no move history, and accepts
success only after independently replaying every output atom in the sparse
integer mechanics. The engine and that mechanics agree on all 6,631,848
selected-site transitions and 44,784 rotation deltas (`npm run verify:l4`).

## Structure

| Quantity | Level 4 |
| --- | ---: |
| Candidate targets | 116,568 |
| Physically legal targets | 14,928 |
| Legal atoms (three angles per target) | 44,784 |
| Position orbits | 3,050 |
| Orbit parity rank | 66 |
| Position-determined orientation | 148,680 cells |
| C3 freedom | 8 orbits / 64 cells |
| C4 freedom | 170 orbits / 10,488 cells |
| D4 freedom | 1 orbit / 768 cells |

Orbit sizes are `8×8, 24×2124, 96×855, 384×60, 768×1, 1536×2`.
Every orbit has a shipped globally pure 3-cycle. Their normal closures have
connected support hypergraphs, which establishes **independent** alternating
subgroups on all 3,050 orbits. Multiplying orders of orbit projections alone
would not establish this independence.

## Sparse mechanics and legality

`createMengerPuzzleState(level, { materializeCubies: true })` creates a full
headless mechanics state independently of rendering policy. The solver model
uses this option; a default research-only render state previously had no cells.

[`mengerSparseGroup.ts`](../../packages/solver-core/src/algorithms/mengerSparseGroup.ts)
uses 32-bit cell indices, a lattice lookup, sparse selected-site maps and the
24 exact integer cube rotations. A broad frame is built once; a local extension
does not scan all 160,000 cells.

For legality, an extension of transverse width `w` sweeps inside a cylinder of
radius `sqrt(2) w/2`. Only stationary unit cubes inside its bounding box expanded
by half a cell, and in its occupied axial planes, can collide. The original
engine checks that complete local set. This is a geometric exclusion argument,
not a reduced collision rule. The same optimization primes the actual state's
target objects before the generic scramble runner filters its move pool.

## Constructive solve

1. **Validate the state.** The cells must bijectively occupy canonical sites,
   remain in their home orbits, and have unit grid-rotation quaternions.
2. **Clear parity.** Reduce the orbit-sign vector against the rank-66 GF(2)
   basis. The stored basis words require at most 70 raw atoms in total.
3. **Place cells.** Decompose each even residual permutation into 3-cycles.
   At most `floor(m/2)` cycles are required for an orbit of size `m`.
4. **Clear orientation.** C4 residues use independent rolls. C3 residues pair
   off under zero twist sum; D4 flips pair off under even flip count, followed
   by rolls. A lone twist or lone flip is rejected.
5. **Replay.** Rebuild the input integer state and execute every emitted raw
   atom on every selected site. Require every piece at home with identity
   rotation. Check all distinct output atoms with the supplied model. Occupancy
   is invariant, so the legality decision applies throughout the word.

### Pair transport replaces the triple graph

The first prototype searched ordered triples and exceeded JavaScript's Map
limit on a 1,536-cell orbit. Its graph has over 3.6 billion vertices.

The shipped algorithm uses two ordered-pair transports. If pure 3-cycles `A`
and `B` meet only at `b`, with `A: a -> b` and `B: c -> b`, their left-to-right
commutator `A B A^-1 B^-1` is `(a b c)`. The other sites can be kept distinct:
each anchor supplies three cycles sharing its directed edge with distinct
third sites. Two forbidden sites cannot block all three alternatives.

The deterministic variant construction supplies at least **38 such anchors
per orbit**, checked exhaustively by `npm run prove:l4`. The complete pair
graph is stored in typed arrays. Its largest instance has exactly
`1536×1535 = 2,357,760` vertices. Incidence lists omit generators that fix both
points, preserving every nontrivial graph edge. There is no triple-search
fallback or empirical solve cutoff.

The small variant budget is a **certified library construction parameter**:
the proof checks its output for every fixed Level 4 orbit. It is not an
unproved assertion that a search with that budget always succeeds at other
levels.

## Reproduction

```bash
npm run prove:l4
npm run verify:l4
npm run test:l4
npm run bench -- --algorithm=level4-slice-reduction --level=4 --seeds=1 --length=5
node --import tsx research/level4/trial.ts --family=weighted --seed=3 --length=100
```

The declared weighted pool includes **every one of the 44,784 legal atoms**.
Frames are repeated 50 times, extensions through depth 2.5 twenty times,
depth-3/3.5 extensions four times, and cell rolls once. Thus fine slices and
slabs are included, and orientation-only rolls do not dominate sampling.

Benchmarks are in [`research/results`](../../research/results/). Detailed
trial records include displaced-cell count, placement count, the exact count
of selected-site replay updates and a streamed SHA-256 of the output word.
Small-sample runtime observations do not establish statistical superiority.

## Browser policy and limitations

The desktop Lab exposes Level 4 as a results view. Scramble, solve and
benchmark work run in workers. No 160,000-mesh Lab scene or per-move state
history is materialized. The Play app's existing rendering is separate.

Solves need substantial memory (roughly 1–2 GB in the recorded Node runs), and
can emit millions of moves. Programmatic solver callers receive the complete word; workers
return the count and explanations without transferring the enormous word.
The benchmark CLI persists run records, rather than serializing the full word.
The runtime verification is sparse integer replay, supported by exhaustive
engine atom comparison. Full 160,000-cell engine replay is additionally used
in the targeted regression tests, not repeated for every multi-million-move
benchmark word.

The solver is not optimal. Measured solution lengths are neither exact God's
numbers nor worst-case bounds. The separate constructive bound derived from
the finite pair tables is recorded in `transport-certificate.json`.

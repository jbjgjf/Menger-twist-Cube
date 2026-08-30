# Level 3 solver completion audit and God's-number bounds

Date: 2026-08-30. This is the independent completion audit of
[`level3-slice-reduction`](../algorithms/level3-slice-reduction-solver.md), made
after the first production port reported success on two seeded scrambles. It
records what “complete” means here, what was found by reading the implementation,
what was changed, and what is still a performance limitation rather than a
correctness limitation.

## Executive verdict

The solver is a full-generator, state-based Level 3 reduction. A successful run
is **sound**: it checks every output move against `model.isMoveLegal`, replays the
entire word through the real engine, and only reports success when all 8,000
cells are exactly solved. Seven independent seeded runs at lengths 5, 20, and
100 pass that gate.

The initial port nevertheless was not ready to call complete for three reasons:

1. ordered-pair, ordered-triple, and orientation searches stopped at empirical
   depth/node limits;
2. the Lab attempted to retain one 8,000-cubie snapshot and render one DOM row
   for every move of a 100k–425k-move solution;
3. the Level 3 information-theoretic lower bound used rounding instead of a
   ceiling and printed 3,205 rather than 3,206.

The finite-graph searches now run to exhaustion. The Lab runs Level 3 solve and
benchmark work in an ES-module worker and omits materialized move-by-move
playback above 10,000 moves. The audit scripts throw on disagreement and are
wired to `npm run verify:l3`. The lower-bound calculation uses `Math.ceil`.

## Why the reduction is complete for the fixed Level 3 group

The claim is structural, not “seven random tests passed.”

1. The 3,591 physically legal atoms partition 8,000 sites into 164 invariant
   position orbits.
2. Each orbit contains `Alt(orbit)`, certified by
   `research/scratch/l3-orbit-groups.ts`.
3. The exported static data supplies one globally pure even tool on every orbit:
   164/164, support width 3, 4, or 6, with no positional spill and no stationary
   twist. Runtime library construction and `l3-audit-tooldata.ts` both verify it.
4. Raw turns normalize the 164 orbit-parity bits through the rank-15 reachable
   GF(2) subspace. The remaining permutation on every orbit is even.
5. Wide pure tools are combined into a 3-cycle. Since `Alt(m)` is
   3-transitive for these orbit sizes, setup conjugation carries that cycle to
   every ordered triple of distinct sites.
6. The placement search exhausts the finite ordered-pair graph, and the exact
   finishing search exhausts the finite ordered-triple graph. The original
   depth-20, depth-8, and two-million-node cutoffs no longer exist.
7. Orientation freedom is exactly enumerated on the `(site, cube rotation)`
   automata. Direct rolls and position-identity twisters generate the verified
   C4, C3, and D4 freedoms. Single- and pair-site setup searches exhaust their
   finite graphs; each accepted application strictly lowers a non-negative
   orientation potential. The depth-20, 400,000-node, and 2,000-iteration
   empirical guards no longer exist.
8. The sparse result is not trusted at the boundary: the real engine performs
   the legality-checked exact replay.

This is a mathematical termination/reachability argument under unbounded
ordinary machine resources. As for any explicit graph search, a host can still
run out of memory; that is an operational failure, not an unreachable puzzle
state. Current benchmark paths meet quickly and stay far below full graph
enumeration.

## Verification matrix

All listed solution words were replayed by the solver on `@menger/engine`, with
legality checked before every move and `isExactlySolved` required at the end.

| Seed | Scramble length | Result | Runtime | Output moves |
| ---: | ---: | --- | ---: | ---: |
| 1 | 5 | pass | 138.1 s | 256,171 |
| 2 | 5 | pass | 112.1 s | 111,830 |
| 1 | 20 | pass | 209.9 s | 364,550 |
| 3 | 20 | pass | 154.8 s | 282,245 |
| 4 | 20 | pass | 249.0 s | 358,331 |
| 5 | 20 | pass | 197.8 s | 350,246 |
| 6 | 100 | pass | 284.2 s | 424,519 |

The supporting checks are:

- all-workspace TypeScript check;
- engine legality tests, 6/6;
- Lab production build, including the module-worker bundle;
- exported pure-tool audit, 164/164;
- sparse simulator versus engine, 6 trials × 40 legal atoms × 8,000 cells,
  comparing both position and orientation;
- `git diff --check`.

The committed JSON records live under `research/results/`. To repeat the fast
structural checks:

```sh
npm run verify:l3
```

To repeat a solve:

```sh
npm run bench -- --algorithm=level3-slice-reduction --level=3 --seeds=6 --length=100
```

## Browser execution and playback policy

The solver is CPU-heavy and synchronous internally. Calling it directly in a
React event handler blocks painting for several minutes, so Level 3 solve and
benchmark requests now run in `apps/lab/src/solverWorker.ts`. Debug phase events
are forwarded to the main thread.

The old playback path retained `moves + 1` arrays of 8,000 cubie references. At
364,550 moves that is about 2.9 billion references before accounting for array
and changed-cubie objects. It then attempted to create 364,550 React list items.
The Lab now applies this policy:

- at most 10,000 moves: retain and animate the ordinary move-by-move history;
- above 10,000 moves: trust the solver's already completed real-engine replay,
  show the exact solved endpoint and structured result, and omit the enormous
  browser playback/list.

The worker does not structured-clone a skipped giant `output_moves` array back to
React; `move_count`, explanations, timings, and the verified result are retained.
The complete `output_moves` remains available to direct programmatic/CLI solver
consumers. This is a UI memory policy, not a solver shortcut.

## God's number: definition and current bounds

Let `G_n` be the diameter of the Level `n` Menger-cube state graph under this
repository's **target-turn metric**: `+90`, `-90`, and `180` on any physically
legal target each cost one move. This resembles the half-turn metric, but its
generator set contains many slice and extension targets and is not the ordinary
Rubik's Cube metric. Therefore the ordinary 3×3×3 result `G = 20` does not answer
this question.

If a move alphabet has `M` atoms, the number of words of length at most `d` is at
most

```text
1 + M + ... + M^d = (M^(d+1) - 1) / (M - 1).
```

If that number is smaller than a certified set of reachable states, some state
requires more than `d` moves. Applying that counting argument gives:

| Level | Cells | Legal atoms | Certified information | Current bound |
| ---: | ---: | ---: | --- | --- |
| 1 | 20 | 63 | `8!·12!/2·3^7·4^12 = 354,320,410,824,620,900,352,000` states | `14 ≤ G₁ ≤ 32` |
| 2 | 400 | 468 | position subgroup ≥ product of `Alt(m)` over orbit sizes `8×2, 24×6, 48, 96×2`, i.e. ≥ `10^509.743` | `G₂ ≥ 191` |
| 3 | 8,000 | 3,591 | position subgroup ≥ product of `Alt(m)` over 164 orbits, i.e. ≥ `10^11394.834` | `G₃ ≥ 3,206` |

The Level 1 upper bound is constructive: solve its ordinary frame quotient in at
most 20 half-turn-metric face moves, then normalize at most 12 independent edge
extension rolls. It is deliberately conservative; the extra Menger generators
may reduce the true diameter.

For Levels 2 and 3, the measured 2,800- and 425,000-move solver outputs are **not
upper bounds on God's number**: they are non-optimal outputs, not worst-case
optimal distances. A formal useful worst-case move-count analysis of the
reduction words remains separate research work. The trivial finite-group upper
bound exists but is too large to communicate anything useful.

For general Level `n`, the puzzle has `20^n` cells, but the legal-target census,
orbit formula, independent alternating subgroups, orientation constraints, and
optimal diameter have only been established through Level 3. If the Level 2/3
alternating-orbit structure and a polynomial-size move alphabet persist, the
counting argument suggests an exponential-in-level lower bound on the order of
`Ω(20^n)`. That is a conjectural asymptotic statement, not a theorem or an exact
God's number.

## Remaining performance work

Correctness and completion no longer depend on empirical graph-search cutoffs,
but the implementation is not yet efficient:

- output words are 111k–425k moves in the audited runs;
- template expansion repeatedly conjugates already conjugated words, causing
  word lengths to compound;
- the worker keeps the UI responsive, but a solve still consumes a CPU core for
  roughly two to five minutes;
- breadth is seven full-generator seeds, not a large statistical benchmark grid.

The next optimization should re-root every conjugated template at its shortest
known setup and cancel adjacent setup/inverse-setup segments. Any optimization
must retain the same legality-checked engine replay gate.

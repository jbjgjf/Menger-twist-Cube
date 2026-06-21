# Level 1 state-based solver

This document defines the real Level 1 solver architecture used by the app. The solver must inspect the current cubie state and derive moves from that state. It must not replay `moveHistory`, reverse user actions, or use a fixed solution sequence.

## Existing game state

The current puzzle state is stored as `Cubie[]`.

Each cubie has:

- `id`: stable identity, derived from the home coordinate.
- `homePosition`: solved coordinate.
- `currentPosition`: current coordinate.
- `orientation`: current quaternion.
- `type`: `corner`, `edge`, `outer`, or `innerWall`.

Level 1 contains 20 cubies:

- 8 corner cubies.
- 12 edge cubies.

The app currently has no explicit win-condition function. The solver defines solved as:

1. Every cubie is at `currentPosition === homePosition`.
2. Every cubie orientation is the solved orientation, except that the frame phase may ignore edge roll around the edge extension axis.
3. After extension normalization, every cubie orientation must match the solved orientation exactly.

## Allowed operations

Level 1 has 21 turn targets:

- 9 frame targets: all `X/Y/Z` layers at `-1, 0, +1`.
- 12 extension targets: one for every Level 1 edge cubie.

Each target supports:

- `+90`
- `-90`
- `180`

Frame moves change both `currentPosition` and `orientation` for the affected cubies. Extension moves rotate exactly one edge cubie in place around its natural extension axis.

## Solver interface

Every solver returns a structured run result:

- `name`
- `version`
- `level_supported`
- `input_state`
- `output_moves`
- `runtime_ms`
- `move_count`
- `success`
- `explanation`

The framework is intentionally algorithm-neutral so later solvers can compete against this Level 1 baseline.

## Level 1 algorithm

Algorithm name: `level-1-state-normalizer`.

The algorithm has two phases.

### Phase 1: frame quotient solve through a 3x3x3 state projection

The frame phase places all cubies at home and solves corner orientations. Edge orientation is compared modulo extension roll, because Level 1 extension moves can correct edge roll independently without changing positions.

This is not a replay of history. The implementation reads the current `Cubie[]`, projects it into a Reid-order 3x3x3 `KPattern`, asks the browser-native `cubing` search engine for a solution while ignoring centers, then maps each returned 3x3 move back to the app's real frame targets.

The local-to-3x3 mapping is deterministic:

- Corners and edges are identified from `homePosition`.
- Slots are identified from `currentPosition`.
- Orientations are mapped by deterministic calibration against states produced by the real app move functions.
- Edge roll around the extension axis is normalized before projection.

The currently mapped frame moves are:

| 3x3 move | Local frame |
| --- | --- |
| `U` | `Y`, layer `+1`, `-90` |
| `D` | `Y`, layer `-1`, `+90` |
| `R` | `X`, layer `+1`, `-90` |
| `L` | `X`, layer `-1`, `+90` |
| `F` | `Z`, layer `+1`, `-90` |
| `B` | `Z`, layer `-1`, `+90` |
| `M` | `X`, layer `0`, `+90` |
| `E` | `Y`, layer `0`, `+90` |
| `S` | `Z`, layer `0`, `-90` |

The primary frame solve is deterministic for the same input state and dependency version:

- Fixed state projection.
- Fixed calibration data generation.
- Fixed move mapping.
- No use of `moveHistory`.

If the external frame projection solve cannot map a state, the solver falls back to an in-house bounded deterministic frame search. A fallback failure is reported as failure and benchmarked; the UI never resets the puzzle as a fake solve.

### Phase 2: extension normalization

Once all cubies are home in the frame quotient, each edge cubie is inspected independently.

For each edge cubie:

1. Determine its natural extension axis from its home position.
2. Try `0`, `+90`, `180`, `-90`.
3. Choose the first angle that makes the cubie orientation exactly solved.

This is direct state reasoning, not search.

## State representation

The solver uses two state representations.

The app-native representation remains the source of truth:

- `Cubie[]`
- `PuzzleState.frames`
- `PuzzleState.turnTargets`
- reducer actions that apply real frame and extension moves

For frame solving, the solver projects Level 1 cubies into a 3x3x3 quotient:

- Corner permutation/orientation.
- Edge permutation/orientation.
- Centers are ignored because Menger Level 1 has no center cubies.
- Edge extension roll is ignored during projection because it is handled in phase 2.

The solver also computes canonical string keys for input reporting, benchmark comparison, fallback search, and future algorithms:

- Position component: each cubie's current coordinate.
- Orientation component: rounded orthonormal basis derived from its quaternion.
- Frame quotient component: for edge cubies only, orientation is canonicalized over the four possible extension-roll rotations.

## Progress metrics

The solver tracks:

- `solvedCubies`: cubies exactly solved.
- `positionSolved`: cubies at home position.
- `cornerOrientationSolved`: corners with solved orientation.
- `edgeFrameSolved`: edges solved modulo extension roll.
- `extensionSolved`: edge orientations solved exactly.

The UI displays the summarized progress metric and the explanation log from the most recent run.

## Invariants

The algorithm preserves:

- Cubie identity: no cubie is created or destroyed.
- Valid Level 1 positions: all frame moves map Menger cells to Menger cells.
- Legal moves only: output moves are frame or extension targets from the current generated target set.
- Determinism: same input state and solver version produce the same output.

## Termination

The primary frame phase terminates because the `cubing` search returns a finite algorithm for valid Level 1 quotient states. The implementation then verifies the returned moves against the app's real move functions before reporting success.

The fallback frame phase terminates because it uses fixed depth, node, and time budgets. It returns failure with explanation if no frame-quotient solution is found within those bounds.

The extension phase terminates because it checks at most 4 angles for each of 12 edge cubies.

## Complexity

Let:

- `n = 20` cubies.
- `e = 12` Level 1 extension targets.
- `A = 4` extension roll states.

State projection is `O(n)`.

The primary frame search is delegated to the `cubing` 3x3x3 solver over the projected quotient state. For this app it is treated as a bounded Level 1 subroutine and verified by replaying the resulting moves on `Cubie[]`.

Extension normalization is `O(e * A)`, effectively constant for Level 1.

Fallback worst-case frame search is bounded by `O(min(27^d, node_budget) * n)`.

For the Level 1 interactive target, the implementation is tuned for one-click solve under 0.5 seconds for normal app states. A failed run is explicit and benchmarked.

## Demo UI

`Solver Lab` is rendered in the main control panel for Level 1.

It supports:

- `Instant`: solve once, store a benchmark record, and apply all returned legal moves immediately.
- `Animated`: solve once, store a benchmark record, and replay moves with the same preview channel as manual interaction.
- `Prepare`: solve once and load the returned move list for manual stepping.
- `Step`: apply the prepared move list one move at a time.

The panel displays:

- Algorithm name and version.
- Runtime.
- Move count.
- Current progress metric.
- Structured explanation phases.
- Benchmark summary and recent benchmark rows.

## Benchmarking infrastructure

Every solver run can be converted into a `SolverBenchmarkRecord` and stored in localStorage under `menger.solver.benchmarks.v1`.

Each record stores:

- `timestamp`
- `level`
- `algorithm`
- `runtime_ms`
- `move_count`
- `success`
- `complexity_estimate`
- `notes`
- `determinism`
- `explainability`
- `scalability`

The UI summarizes:

- Success rate.
- Average runtime.
- Average move count for successful runs.

## Adding future algorithms

Add a new solver by implementing the `SolverAlgorithm` shape in `src/solver/types.ts`.

Minimum requirements:

1. Read `PuzzleState` or a documented state projection derived from it.
2. Return a `SolverRunResult`.
3. Populate `input_state`, `output_moves`, `runtime_ms`, `move_count`, `success`, `explanation`, `final_strategy`, and `complexity_estimate`.
4. Apply only legal `SolverMove` objects that the reducer can replay through `APPLY_SOLVER_MOVE` or `APPLY_SOLVER_MOVES`.
5. Add a benchmark note that states determinism, explainability, and scalability expectations.

Future candidates can include cubie-cycle solvers, LBL-style staged solvers, pattern databases, or Level N research evaluators. They should share the same benchmark store so results are comparable.

## Assumptions

- Level 1 solver supports states generated by the current legal move system.
- The Level 1 quotient is equivalent to a 3x3x3 cubie model with centers ignored.
- Extension roll is independent after the frame quotient is solved.
- The `cubing` dependency remains browser-compatible and deterministic for the same version.
- Level 2+ solvers are out of scope for this implementation.

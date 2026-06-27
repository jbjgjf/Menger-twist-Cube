# Architecture overview

This repo is an npm-workspaces monorepo with two independent halves that share one package:

```
apps/play  ───┐
              ├──> @menger/solver-core ──> @menger/engine
apps/lab   ───┘
```

- **`@menger/engine`** — pure puzzle mechanics. Cubie/frame/turn-target types, Menger-cell generation, geometry, and the functions that apply a move to a `Cubie[]`. No React, no Three.js, no solver concepts, no `localStorage`. Anything that needs to know what a Menger cube *is* depends on this and nothing else.
- **`@menger/solver-core`** — the `PuzzleModel`/`SolverAlgorithm` interfaces, the algorithm registry, the benchmark runner, and the Level 1 algorithm itself. Depends on `@menger/engine` (one direction only — engine has zero awareness of solver-core). Runs in the browser or in plain Node.
- **`apps/play`** — the React Three Fiber game. Depends on both packages: `@menger/engine` for rendering/interaction, `@menger/solver-core` for the Solver Lab panel.
- **`apps/lab`** — a plain React dashboard with no Three.js. Depends on `@menger/solver-core` (and transitively `@menger/engine` for types) to run, visualize, and benchmark algorithms with zero game UI in the loop.

## Why this split

The project started as a single Vite app where the solver (`src/solver/level1Solver.ts`) imported the engine directly and `App.tsx` called a hardcoded `solveLevel1()` function inline, writing benchmark records to `localStorage` from inside the same component that also owned animation and keyboard handling. That worked for one algorithm and one UI, but made three things impossible without rewriting the solver:

1. Running the solver outside a browser (for CI, for a benchmark CLI).
2. Comparing a second algorithm without changing the Play app.
3. Building a second UI (a visualizer/benchmark dashboard) without dragging in Three.js.

Splitting into packages forces a real dependency direction (engine → nothing, solver-core → engine, apps → both) instead of an implicit one, and the `PuzzleModel`/`SolverAlgorithm` interfaces (see [ADR 0002](../adr/0002-puzzle-model-and-solver-algorithm-interfaces.md)) give the registry, benchmark runner, and CLI a single shape to program against regardless of how many algorithms or puzzle models exist later.

## No build step for packages

`packages/engine` and `packages/solver-core` are never compiled to `dist/`. Their `package.json` points `exports`/`types` straight at `./src/index.ts`:

```json
{ "exports": { ".": "./src/index.ts" }, "types": "./src/index.ts" }
```

Vite resolves workspace symlinks to their real path and transforms the `.ts` source on the fly (the same way it transforms the app's own source), and the CLI runs under `tsx`, which does the same for Node. This is sometimes called the "just-in-time package" pattern for monorepos: no `tsup`/`rollup` build pipeline, no stale `dist/` to forget to rebuild, no version-pinning between a package and its compiled output. It's the right tradeoff at this size — add a per-package build step only if a package needs to be published outside this repo or consumed by a non-Vite, non-tsx toolchain.

## Where state boundaries are drawn

`@menger/engine` exports `MengerPuzzleState` — level, frames, turn targets, and `Cubie[]`. That's deliberately *only* puzzle mechanics. It excludes selection, undo/redo history, animation flags, and drag-preview state, because the solver never needs any of that and including it would mean every solver-core function takes a type polluted with Play-app concerns.

`apps/play`'s own `PuzzleState` type (`apps/play/src/types/puzzle.ts`) extends `MengerPuzzleState` with exactly those Play-only fields. The reducer (`apps/play/src/state/puzzleState.ts`) owns them. Nothing in `solver-core` imports from `apps/play`, so this is enforced by the dependency graph, not just convention.

## Solving and benchmarking, end to end

1. `@menger/engine` provides `createMengerPuzzleState(level)` — the single function that builds a fresh, solved puzzle state. Used by the Play reducer, `mengerPuzzleModel.createState`, and the CLI.
2. `mengerPuzzleModel` (in `solver-core`) is the only module that adapts `@menger/engine` into the generic `PuzzleModel<TState, TMove>` shape (`legalMoves`, `applyMove`, `isSolved`, `cloneState`, `stateFingerprint`).
3. `registerAlgorithm()` adds an algorithm (keyed by a stable `id`) to an in-memory registry. `level1QuotientAlgorithm` self-registers as a side effect of importing `solver-core`'s entry point.
4. `runBenchmark(model, algorithm, spec)` is written entirely against the `PuzzleModel`/`SolverAlgorithm` interfaces: it seeds an RNG, scrambles by repeatedly calling `model.legalMoves`/`applyMove`, calls `algorithm.solve(model, scrambledState)`, and turns the result into a `SolverBenchmarkRecord`. It has no Menger-specific code at all — a second puzzle model registering its own algorithms would reuse this function unmodified.
5. Three callers share step 4 verbatim: `apps/play`'s `solverController.ts` (records to `localStorage`), `apps/lab`'s "Run benchmark" button (keeps records in React state), and `packages/solver-core/src/cli/bench.ts` (writes records to a JSON file under `research/results/`).

## Where the abstraction stops

Not everything in the Level 1 algorithm goes through `PuzzleModel`. The primary solve path projects cubies into a 3x3x3 `KPattern` and calls the `cubing` library's search — that's irreducibly specific to this puzzle's structure (centers ignored, edge-roll normalization) and gains nothing from a generic interface. Only the bounded fallback search (a generic best-first search over single moves, used when the primary path fails) is written against `model.legalMoves`/`applyMove`, because that part *is* generic graph search and would be reusable as-is for a different model. See the "State representation" section of [`docs/algorithms/level1-quotient-solver.md`](../algorithms/level1-quotient-solver.md) for the exact boundary.

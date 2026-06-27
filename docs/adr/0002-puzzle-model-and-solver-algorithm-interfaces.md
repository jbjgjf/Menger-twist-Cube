# ADR 0002: `PuzzleModel` and `SolverAlgorithm` interfaces

## Status

Accepted

## Context

The original solver (`solveLevel1(puzzle: PuzzleState)`) took the Play app's own `PuzzleState` type directly, was invoked by name from `App.tsx`, and had no registry — adding a second algorithm meant adding a second hardcoded function and a second set of call sites in the Play app. There was also a reverse dependency: the engine's reducer (`puzzleState.ts`) imported `SolverMove` from the solver module so it could type the `APPLY_SOLVER_MOVE` action, meaning the "pure" engine depended on the solver.

## Decision

Introduce two interfaces in `packages/solver-core`:

```ts
interface PuzzleModel<TState, TMove> {
  createState(level: number): TState;
  cloneState(state: TState): TState;
  legalMoves(state: TState): TMove[];
  applyMove(state: TState, move: TMove): TState;
  isSolved(state: TState): boolean;
  describeMove(move: TMove): string;
  stateFingerprint(state: TState): string;
}

interface SolverAlgorithm<TState, TMove> {
  readonly id: string;
  solve(model: PuzzleModel<TState, TMove>, state: TState): Promise<SolverRunResult>;
}
```

`mengerPuzzleModel` is the only module that adapts `@menger/engine` into this shape. Algorithms are registered by `id` in an in-memory registry (`registerAlgorithm`/`getAlgorithm`/`listAlgorithms`) instead of imported by name. `@menger/engine` was also changed to export a *pure* `MengerPuzzleState` (no selection/history/animation fields, no `SolverMove` import) — those Play-only fields now live in `apps/play`'s own `PuzzleState` type, which extends `MengerPuzzleState`. This removed the engine → solver reverse dependency entirely.

The bounded fallback search inside the Level 1 algorithm (used only when the primary cubing-backed solve fails) was rewritten to call `model.legalMoves`/`model.applyMove` instead of engine functions directly, since that part of the algorithm is generic best-first search and is the clearest place to prove the interface is load-bearing, not decorative.

## Consequences

- The benchmark runner, the CLI, and `apps/lab` are written once against `PuzzleModel`/`SolverAlgorithm` and need no Menger-specific code — `runBenchmark()` has zero knowledge of cubies, frames, or extension targets.
- A second algorithm registers under its own `id` and is immediately selectable from `apps/lab`'s dropdown and the CLI's `--algorithm=` flag — no changes to either.
- Not everything was forced through the interface. The Level 1 algorithm's primary solve path (projecting cubies into a 3x3x3 `KPattern` and calling the `cubing` library) stays Menger-specific, because that logic is inherently about this puzzle's structure and gains nothing from a generic interface — see "Where the abstraction stops" in [`docs/architecture/overview.md`](../architecture/overview.md). Forcing it through `PuzzleModel` would have produced an abstraction with one implementation and no real second caller, which is the kind of premature generalization this decision is trying to avoid elsewhere.
- `TState`/`TMove` are generic but only one model (`mengerPuzzleModel`) exists. The registry uses `SolverAlgorithm<any, any>` internally for storage — acceptable because the registry itself never inspects `TState`/`TMove`, only the typed call sites that fetch a specific algorithm do.

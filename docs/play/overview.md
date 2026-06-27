# Play app

`apps/play` is the game: a React Three Fiber scene over `@menger/engine`'s puzzle mechanics, plus a Level 1 "Solver Lab" panel backed by `@menger/solver-core`.

```bash
npm run dev   # http://localhost:5173
```

For controls (mouse/keyboard), interaction tiers per level, and the Solver Lab panel's controls, see the root [`README.md`](../../README.md#play-app) — it stays close to the UI so it's less likely to drift out of date than a duplicate copy here.

For *why* the puzzle generates the target/frame counts it does per level, and the keyboard grammar's design rationale, see [`docs/architecture/interaction-architecture.md`](../architecture/interaction-architecture.md).

## Source layout

```text
apps/play/src/
  components/   React + React Three Fiber components
  state/        the Play-only reducer (puzzleState.ts) — wraps @menger/engine mechanics with
                selection, undo/redo, animation, and drag-preview state
  solver/       solverController.ts — thin glue between this app and @menger/solver-core
  input/        keyboard command registry
  types/        Play-only types (PuzzleState, DragPreview, InteractionMode), re-exporting
                @menger/engine's MengerPuzzleState and friends
```

`solverController.ts` is intentionally small: it does not implement solving, algorithm selection logic, or benchmark persistence — it just knows which registered algorithm id this app uses for which level, and forwards to `@menger/solver-core`. See [`docs/architecture/overview.md`](../architecture/overview.md) for the full dependency picture.

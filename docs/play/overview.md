# Play app

`apps/play` is the game: a React Three Fiber scene over `@menger/engine`'s puzzle mechanics. It is manual play only — solver runs, replay, and benchmarking live in `apps/lab` (see [`docs/algorithms`](../algorithms/level1-quotient-solver.md#ui-surfaces)).

```bash
npm run dev   # http://localhost:5173
```

For controls (mouse/keyboard) and interaction tiers per level, see the root [`README.md`](../../README.md#play-app) — it stays close to the UI so it's less likely to drift out of date than a duplicate copy here.

For *why* the puzzle generates the target/frame counts it does per level, and the keyboard grammar's design rationale, see [`docs/architecture/interaction-architecture.md`](../architecture/interaction-architecture.md).

## Source layout

```text
apps/play/src/
  components/   React + React Three Fiber components
  state/        the Play-only reducer (puzzleState.ts) — wraps @menger/engine mechanics with
                selection, undo/redo, animation, and drag-preview state
  input/        keyboard command registry
  types/        Play-only types (PuzzleState, DragPreview, InteractionMode), re-exporting
                @menger/engine's MengerPuzzleState and friends
```

See [`docs/architecture/overview.md`](../architecture/overview.md) for the full dependency picture.

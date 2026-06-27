# Menger Cube

Menger Cube is a research platform for generalized higher-order Menger-sponge twisty puzzles, built around three independent pieces:

- **`apps/play`** — the React + Three.js game: orbitable 3D scene, frame/extension rotations, undo/redo, scramble, keyboard controls, and a "Solver Lab" panel for Level 1.
- **`packages/solver-core`** + **`packages/engine`** — a headless solver engine: puzzle mechanics, a `PuzzleModel`/`SolverAlgorithm` interface pair, an algorithm registry, and a reproducible benchmark runner. Runs in the browser or in plain Node with no UI dependency.
- **`apps/lab`** — a small dashboard that runs and visualizes algorithms from `solver-core` directly (no Three.js), and compares live runs against JSON results produced by the benchmark CLI.

See [`docs/architecture/overview.md`](docs/architecture/overview.md) for how these fit together and why they're split this way.

## Requirements

- Node.js 22.3 or newer (required by the `cubing` dependency)
- npm 10+ (for npm workspaces)

## Setup

```bash
npm install
```

This installs all workspaces (`packages/*`, `apps/*`) in one pass.

## Development

```bash
npm run dev       # apps/play, the game — http://localhost:5173
npm run dev:lab   # apps/lab, the solver dashboard — http://localhost:5175
```

## Build

```bash
npm run build       # builds every workspace that defines a build script
npm run typecheck    # type-checks every workspace
```

## Solver benchmarks

```bash
npm run bench -- --algorithm=level1-quotient --level=1 --count=20 --length=20
```

Runs the registered algorithm against `count` seeded scrambles and writes a JSON result to `research/results/` (override with `--out=<path>`). Same seed list always produces the same scrambles and the same move-count/success outcomes, so results are diffable across commits. Run `npm run bench -- --help` for all options.

Load any of those JSON files into `apps/lab` ("Compare against a committed CLI result") to see them alongside a live run.

## Repository layout

```text
apps/
  play/        the game (React + React Three Fiber)
  lab/         solver dashboard (algorithm runner, visualizer, benchmark comparison)
packages/
  engine/      pure puzzle mechanics — positions, frames, turn targets, move application
  solver-core/ PuzzleModel + SolverAlgorithm interfaces, registry, benchmark runner, CLI
research/
  results/     committed, reproducible benchmark JSON output
docs/
  architecture/  system overview, ADRs' supporting context
  adr/           architecture decision records
  algorithms/    one doc per solver algorithm
  research/      benchmark methodology and how to add new experiments
  play/          player-facing controls reference
```

`packages/engine` and `packages/solver-core` are consumed as TypeScript source directly (their `package.json` `exports` point at `./src/index.ts`) — there is no separate build step for them. Vite transforms them on the fly for the apps, and `tsx` runs the CLI directly under Node. This keeps the monorepo simple: add a file, export it from the package's `index.ts`, and every consumer sees it immediately.

## Play app

The control panel exposes Level 1 through Level 5:

- Levels 1–2: competitive-manual play.
- Level 3: assisted-manual play (target counts are large enough to need depth navigation).
- Levels 4–5: research/evaluation UI only — target counts and solver/benchmark surfaces, no full cubie rendering.

Puzzle generation, frame targets, and extension targets scale with level; see [`docs/architecture/interaction-architecture.md`](docs/architecture/interaction-architecture.md) for the generation rules and target-count formulas.

### Mouse

| Action | Control |
| --- | --- |
| Orbit camera | Left drag |
| Zoom | Scroll |
| Select frame | Tap/click a cubie face or guide |
| Select extension target | Switch to Extension mode, then tap an edge block |
| Drag rotation preview | Drag highlighted cubies or a guide |

### Keyboard

| Action | Key |
| --- | --- |
| Toggle Slice / Extension mode | `Tab` |
| Select first nine frames | `1` to `9` |
| Previous / next frame across all frames | `Q` / `E` |
| Previous / next extension at current depth | `Q` / `E` in Extension mode |
| Extension depth shallower / deeper | `-` / `=` in Extension mode |
| Rotate selected frame -90 | `A` or `J` |
| Rotate selected frame +90 | `D` or `L` |
| Rotate selected frame 180 | `S` or `K` |
| Rotate selected extension | Same `A/S/D` or `J/K/L` turn keys in Extension mode |
| Quick-turn frame +90 | `Shift` + `1` to `9` |
| Quick-turn frame -90 | `Alt` + `1` to `9` |
| Scramble | `G` |
| Undo / redo | `U` / `R` |
| Reset puzzle | `Backspace` |
| Toggle transparent view | `T` |
| Toggle frame guides | `F` |
| Camera reset / front / top / side | `C` / `V` / `B` / `N` |

Keyboard bindings are centralized in `apps/play/src/input/keyboardControls.ts` and generated from the active level's turn targets rather than hardcoded per target — see `findKeyboardCommand`.

## Solver Lab (in-game) vs. apps/lab

The Play app's "Solver Lab" panel (Level 1 only) is a thin UI over `@menger/solver-core` — see `apps/play/src/solver/solverController.ts`. It runs the registered algorithm, records a benchmark to `localStorage`, and replays the returned moves with the same animation channel as manual play.

`apps/lab` is the standalone counterpart: it runs the same `solver-core` package with no Play-app/Three.js dependency at all, for algorithm comparison, visualization, and reviewing CLI-generated benchmark files.

## Documentation

- [`docs/architecture/overview.md`](docs/architecture/overview.md) — how the packages/apps fit together and why.
- [`docs/architecture/interaction-architecture.md`](docs/architecture/interaction-architecture.md) — turn target generation, interaction tiers, keyboard grammar.
- [`docs/algorithms/level1-quotient-solver.md`](docs/algorithms/level1-quotient-solver.md) — the Level 1 solver algorithm.
- [`docs/research/benchmarking.md`](docs/research/benchmarking.md) — benchmark methodology and how to add new algorithms/experiments.
- [`docs/adr/`](docs/adr/) — architecture decision records.

## License

See `LICENSE`.

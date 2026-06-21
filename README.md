# Menger Twist Cube

Menger Twist Cube is a React + Three.js prototype for a 3D rotational puzzle inspired by Menger cubes.

The current build focuses on validating the core interaction model:

- orbitable 3D puzzle scene
- selectable rotation frames
- recursive extension rotation targets
- animated quarter-turn and half-turn moves
- move history, undo, redo, reset, and scramble
- Level 1 through Level 3 manual/assisted play
- Level 4 and Level 5 research/evaluation summaries
- keyboard-first controls generated from the active level's turn targets
- Level 1 Solver Lab with state-based solving, replay modes, explanations, and benchmarks

## Requirements

- Node.js 20 or newer
- npm

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Vite will print a local URL, usually `http://localhost:5173/`.

## Build

```bash
npm run build
```

## Solver Lab

Level 1 includes a real state-based solver in `src/solver/level1Solver.ts`.

The solver inspects the current `Cubie[]` state, projects the frame quotient into a 3x3x3 cubie model with centers ignored, maps the returned algorithm back to the app's legal frame moves, then normalizes edge extension rotations. It does not replay `moveHistory`.

The control panel exposes:

- `Instant`: solve and apply the returned move list immediately.
- `Animated`: solve and replay each legal move with preview animation.
- `Prepare`: compute a move list without applying it.
- `Step`: apply a prepared move list one move at a time.

Each run writes a benchmark record to localStorage key `menger.solver.benchmarks.v1`.

Solver design, assumptions, complexity, and extension instructions are documented in `docs/level-1-solver.md`.

## Controls

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

The left-hand `Q/E/A/S/D` layout is intended for game-like play. The right-hand `J/K/L` aliases are available for players who prefer to keep movement and rotation controls separated.

## Keyboard Extensibility

Keyboard input is centralized in `src/input/keyboardControls.ts`.

The file exposes:

- `keyboardFrameOrder`: the frame order used by number keys and frame cycling
- `keyboardBindings`: declarative key bindings mapped to commands
- `findKeyboardCommand`: a small resolver used by `App.tsx`

Keyboard bindings use a small grammar instead of one shortcut per target. Number keys target the first nine frames, while `Q/E` cycles through frames in Slice mode and extension targets at the current recursive depth in Extension mode.

## Level Scaling

Puzzle generation is centralized in `src/engine/generateMenger.ts`.

- `generateMenger(level)` creates the recursive Menger cell set. Levels 1-3 produce 20, 400, and 8,000 cubies for direct interaction.
- `generateRotationFrames(level)` in `src/engine/frameDefinitions.ts` creates frame targets for every available slice scale.
- `generateExtensionTurnTargets(level)` in `src/engine/turnTargets.ts` creates 12 extension targets for every recursive Menger parent block.
- Level 1 and Level 2 are treated as competitive-manual surfaces.
- Level 3 is treated as assisted-manual: still interactive, but the target count is large enough to need depth navigation.
- Level 4 and Level 5 switch to research/evaluation UI. They show target counts and avoid full cubie generation/rendering.
- The design context and target counts are documented in `docs/interaction-architecture.md`.

## Project Structure

```text
src/
  components/        React and React Three Fiber components
  engine/            puzzle generation, frame definitions, move logic, reducer
  input/             keyboard command registry
  types/             shared puzzle types
```

## License

See `LICENSE`.

# Menger Twist Cube

Menger Twist Cube is a React + Three.js prototype for a 3D rotational puzzle inspired by Menger cubes.

The current build focuses on validating the core interaction model:

- orbitable 3D puzzle scene
- selectable rotation frames
- animated quarter-turn and half-turn moves
- move history, undo, redo, reset, and scramble
- Level 1 and Level 2 puzzle generation
- keyboard-first controls generated from the active level's rotation frames

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

## Controls

### Mouse

| Action | Control |
| --- | --- |
| Orbit camera | Left drag |
| Zoom | Scroll |
| Select frame | Tap/click a cubie face or guide |
| Drag rotation preview | Drag highlighted cubies or a guide |

### Keyboard

| Action | Key |
| --- | --- |
| Select first nine frames | `1` to `9` |
| Previous / next frame across all frames | `Q` / `E` |
| Rotate selected frame -90 | `A` or `J` |
| Rotate selected frame +90 | `D` or `L` |
| Rotate selected frame 180 | `S` or `K` |
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

Keyboard bindings are generated from the active level's frame list. Number keys target the first nine frames, while `Q/E` cycles through every generated frame for the current level.

## Level Scaling

Puzzle generation is centralized in `src/engine/generateMenger.ts`.

- `generateMenger(level)` creates the recursive Menger cell set. Level 1 produces 20 cubies; Level 2 produces 400 cubies.
- `generateRotationFrames(level)` in `src/engine/frameDefinitions.ts` creates one slice frame per coordinate for each axis. Level 1 has 9 frames; Level 2 has 27 frames.
- Move application receives the active frame map, so reducer, UI, keyboard, scramble, undo, and redo work without hard-coded frame IDs.

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

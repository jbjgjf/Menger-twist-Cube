# Menger Twist Cube

Menger Twist Cube is a React + Three.js prototype for a 3D rotational puzzle inspired by a level-1 Menger cube.

The current build focuses on validating the core interaction model:

- orbitable 3D puzzle scene
- selectable rotation frames
- animated quarter-turn and half-turn moves
- move history, undo, redo, reset, and scramble
- keyboard-first controls that can be extended for future Level N puzzles

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
| Pan camera | Right drag or Shift + drag |
| Zoom | Scroll |
| Preview frame | Hover a guide |
| Select frame | Click a guide |
| Drag rotation preview | Drag a guide |

### Keyboard

| Action | Key |
| --- | --- |
| Select frame | `1` to `9` |
| Previous / next frame | `Q` / `E` |
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

For future Level N expansion, add or generate new frame IDs in the puzzle/frame layer, then update the frame order and bindings in one place. The app only consumes commands such as `select-frame`, `rotate-selected`, and `rotate-frame`, so the UI does not need to know how many frames a future level contains.

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

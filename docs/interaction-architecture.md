# Menger Twist Cube interaction architecture

This note captures the design context for future coding agents.

## Extension rotation definition

Extension rotation is not ordinary whole-frame cube rotation.

For a Menger block, each recursive parent block has 12 edge child blocks. An edge child block is the child whose local 3x3x3 address has exactly one middle digit and two non-middle digits, for example `001`, `012`, or `211`. The middle digit determines the rotation axis. The rotation axis connects the two contact faces of that edge block and is perpendicular to the two exposed directions.

At Level 1, these 12 extension targets are the 12 edge unit cubies. Rotating one changes its orientation in place. At Level N, the same rule applies recursively: the target may be a unit cubie or a larger Level K child block with the same Menger structure. Rotating a larger extension target rotates every cubie inside that block around the target block pivot.

## Target counts

Frame targets include every available slice scale: `1, 3, 9, ... 3^(N-1)`.

Extension targets are generated as `12` edge child blocks per recursive Menger parent block:

`extensionTargets(N) = 12 * (20^N - 1) / 19`

| Level | Frame targets | Extension targets | Total turn targets |
| ---: | ---: | ---: | ---: |
| 1 | 9 | 12 | 21 |
| 2 | 36 | 252 | 288 |
| 3 | 117 | 5,052 | 5,169 |
| 4 | 360 | 101,052 | 101,412 |
| 5 | 1,089 | 2,021,052 | 2,022,141 |

## Interaction tiers

The UI should not pretend that all levels are equally human-playable.

| Level | Tier | Intended UI |
| ---: | --- | --- |
| 1 | competitive-manual | Direct manual play, fast keyboard and mobile controls |
| 2 | competitive-manual | Upper bound for competitive manual play |
| 3 | assisted-manual | Human-guided exploration with target depth, recents, pins, and future solver hints |
| 4+ | research-evaluation | Solver, replay, scoped visualization, and performance evaluation |

Level 4 and Level 5 should not generate or render the full cubie set in the main manual scene. They should keep the generalized target model and show counts, solver controls, and evaluation metrics instead.

## Keyboard model

Do not assign one shortcut per target. Target counts become too large by Level 2 and impossible by Level 3.

Use a small grammar:

- `Tab`: Slice / Extension mode
- Slice mode:
  - `X/Y/Z`: axis
  - `[` / `]`: previous / next layer group
  - `-` / `=`: thinner / thicker frame scale
  - `Q/E`: previous / next frame
  - `A/S/D` and `J/K/L`: -90 / 180 / +90
- Extension mode:
  - `-` / `=`: shallower / deeper recursive depth
  - `Q/E`: previous / next extension target at current depth
  - `A/S/D` and `J/K/L`: -90 / 180 / +90

The important property is consistency: the same rotation keys act on the currently selected target regardless of target kind.

## Mobile model

Mobile should separate target selection from rotation direction to avoid accidental turns.

The intended flow is:

1. Choose Slice or Extension.
2. Choose axis/scale or extension depth.
3. Tap a visible block or use previous/next target controls.
4. Press a large explicit `-90`, `180`, or `+90` button.

Touch targets should be at least 44px high for actual turn buttons.

## Implementation notes

- Use generated `TurnTarget` objects for both frame and extension targets.
- Do not hardcode Level 1 target IDs.
- Extension targets are generated from recursive parent block path, child slot, block scale, pivot, axis, and selector.
- Frame rotations move cubie positions around the puzzle origin.
- Extension rotations move cubie positions around the selected target pivot.
- For Level 4+, do not enumerate extension targets for direct UI selection; use formula-based counts until the solver/evaluation UI needs scoped generation.

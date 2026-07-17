# Rotation legality design log

Date: 2026-07-17  
Status: implemented in `packages/engine/src/rotationLegality.ts`

## Problem

Recursive extension targets used to be treated as legal solely because their local Menger address was an edge-child address. That is enough to generate a **candidate axis**, but it is not enough to prove that the selected rigid units can rotate through the stationary structure.

The concrete counterexample is the Level 2 unit at `(1,3,4)`. Its recursive digits are `b=(0,1,1)`, `o=(1,0,1)`, so it is an `EEo` unit with local Y axis. The adjacent unit at `(2,3,4)` is `CE`. A Y-axis turn of the EE unit sweeps its XZ square through the CE unit; at 45 degrees the moving square extends `1/sqrt(2)` unit from its center, beyond the adjacent face at `1/2` unit.

The old target generator did not inspect this geometry, and `applyExtensionRotation` applied every generated target without a legality gate.

## Decision

Target generation and move legality are now separate concepts:

1. `frameDefinitions.ts` and `turnTargets.ts` generate structural rotation candidates.
2. `rotationLegality.ts` decides whether a candidate and angle are physically admissible.
3. Play, the reducer, the engine apply functions, and `mengerPuzzleModel.legalMoves` use the same decision.

Generated target counts remain **candidate counts**. They are not claims that every target is physically rotatable.

## Logical solid model

Each smallest cubie is a closed unit cube centered at its lattice position. The rendering gap is visual only and is deliberately excluded from mechanics. A multi-cubie target is the union of its selected unit cubes and moves as one rigid body.

For moving cubies `U`, stationary cubies `K`, axis `l`, and angle `theta`, let `B_U` and `B_K` be their occupied solids. Boundary contact is allowed; positive-volume penetration is not.

The implemented contract is:

```text
Rotatable(U, l, theta) iff
  AxisEnvelopeAdmissible(U, l, theta)
  and EndpointCloses(U, l, theta)
  and InteriorSweep(U, l, theta) does not intersect interior(B_K).
```

Equivalently, the collision condition is

```text
union over t in [0,1] of R(l, t*theta)(interior(B_U))
  intersect interior(B_K) = empty.
```

The three stages are intentionally distinct:

- **Outer envelope:** for a quarter-turn, the outer orthogonal projection must be a square centered on the axis. This is a cheap candidate rejection, not the complete proof.
- **Endpoint closure:** rotating the selected lattice positions by the requested angle must permute exactly the same selected position set. This captures the actual D/Menger support, including holes, rather than relying on a bounding square alone.
- **Swept collision:** every moving unit cube is checked against stationary cubes whose axial interiors overlap. Boundary-only contact along the rotation axis remains legal.

## Continuous-collision implementation

All supported axes are unit X/Y/Z axes, so a cube pair with overlapping axial interiors reduces to a 2D problem in the perpendicular plane:

- the moving unit square rotates about the projected pivot;
- the stationary unit square stays axis-aligned;
- strict oriented-box SAT detects interior overlap at an angle;
- exact vertex-arc bounds reject angle intervals that cannot reach the stationary square;
- remaining intervals are subdivided adaptively to a maximum angular interval of about `0.0014` degrees for a 90-degree turn.

The check is deterministic. It permits boundary contact through strict-interior comparisons and uses a `1e-9` geometry tolerance. Results are cached by generated target/frame and angle because every accepted move preserves the same occupied lattice support. If future mechanics introduce missing cells, non-cubic unit solids, or state-dependent geometry, this cache invariant must be revised.

## Integration boundaries

- `applyTwistToCubies`, `applyExtensionRotation`, and the legacy `applyCubieRotation` return the original state for a rejected rotation.
- Play validates before starting an animation and the reducer validates again before recording history.
- `mengerPuzzleModel.legalMoves` omits rejected frame/extension angles.
- Algorithm-specific benchmark pools are intersected with the model's current legal moves before scrambling, so a rejected candidate cannot become a recorded no-op scramble move.
- Structural candidates remain selectable in the current UI; attempting an illegal rotation shows the engine's blocking reason. Filtering or visually marking candidates is a separate UI decision.

## Focused engine evidence

The engine tests cover:

- a legal Level 1 edge extension with axial face contact;
- a legal ordinary Level 2 frame turn;
- rejection of the `(1,3,4)` EE unit by the adjacent `(2,3,4)` CE unit;
- rejection in both the extension apply path and the legacy one-cubie apply path;
- a legal Level 2 depth-1 block extension.

A one-angle Level 2 candidate audit on the solved occupancy produced:

| Candidate family | Legal / total |
| --- | ---: |
| Depth-1 block extensions | 12 / 12 |
| Depth-1.5 slabs | 36 / 36 |
| Depth-2 unit extensions | 72 / 240 |

## Solver impact deliberately deferred

The Level 2 slice-reduction solver was designed against the former generator set, including all depth-2 unit rolls. Restricting those moves can split orbits, reduce orientation freedom, change parity reachability, and invalidate E2-based cleanup tools.

No solver correctness run, solver benchmark, orbit recomputation, or completeness claim was performed as part of this change. The engine now prevents illegal moves, but solver research must be revalidated separately before the existing Level 2 coverage claim is reused.


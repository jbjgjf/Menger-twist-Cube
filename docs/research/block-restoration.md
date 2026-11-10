# Level 2 Block Restoration and Move-Sequence Shortening

**Note on move systems:** The earlier experiments in this document represent historical work without inner-square rotations. For the formal definitions, complete algorithms, and comparisons including inner-square rotations, see the [Inner-Square Rotation Study](inner-square-study.md).

Updated: 2026-10-24. Implemented experimental method. Restoration procedures and complexity theorems for general Levels remain future work.

## Relationship to Existing Methods

Level 1 searches and solves the quotient state corresponding to an ordinary Rubik's Cube, then resolves the remaining orientations.
For Level 2 and above, existing approaches include reduction to the block quotient and orbit-by-orbit restoration of positions and orientations.
The certified method normalizes parity, transports pure 3-cycles to restore positions, and completes orientations.
Because it pays the cost of a setup move sequence and its inverse for each individual correction, it guarantees correctness at the expense of potentially long solutions.

## Implementation

Registered ID: `level2-block-restoration`. Selectable from the existing registries in the Lab and CLI.
Uses only the current input state and does not reference move history.

- [Solver](../../packages/solver-core/src/algorithms/level2BlockRestorationSolver.ts)
- [Comparison experiment](../../research/block-restoration/compare.ts)
- [Saved results](../../research/results/level2-block-restoration.json)

For the 20 cubies belonging to each home block, we count how many cubies match each rigid placement across the 20 destination regions × 24 orientations.
We sum the maximum match count over all home blocks and subtract this sum from 400 to define the *defect*.
A defect of 0 means every block has been restored as a rigid body with respect to position; placement into its solved home block is not required.
Individual cubie orientations are excluded from this evaluation and handled in a subsequent stage. This defect value is not treated as a lower bound on the shortest move distance.

Taking all position-changing legal moves as candidates, we run a beam search with depth 4, beam width 12, and a maximum of 10,000 candidate expansions.
Because positional states are deduplicated, there is no guarantee of selecting the best solution among paths that differ only in orientation.
The search function allows configuring depth, width, and expansion limits. Nor is it guaranteed to find all solutions within depth 4.
If a defect of 0 is reached, the restoration sequence is applied and the resulting state is passed to the existing Level 2 block-quotient solver.
If restoring positions alone leaves orientations outside the scope of the quotient solver, the post-restoration state is completed by the certified solver.
If the search fails, the partial restoration sequence is discarded and the original state is passed directly to the certified solver.
In the `inner-square` move system, this standard-system search is bypassed and the state is passed directly to the corresponding certified method.
The final move sequence is replayed from the original input through the real engine to verify legality and exact completion before returning.

## Conditions for Sharing Corrections

Any move that maps each spatial block rigidly onto another block preserves any positionally block-rigid state.
`level2RigidityPreservingMoves()` checks this condition across all 400 positions.
Out of 468 moves in the standard system, 279 satisfy this condition. This is a positional condition; reachability of quotient orientations is checked separately.

As Option D, we exploit the fact that moves whose selected position sets are mutually disjoint commute, including their action on orientations.
Across intermediate moves that satisfy this disjointness condition, rotations of the same target are combined and inverse rotations cancel.
The lookback window is the preceding 64 moves. This procedure does not find all commutation relations or all possible reductions.

The number of search moves that displaced multiple regions simultaneously is recorded in `multiRegionMoves`.
This count alone is not evidence that multiple corrections were achieved simultaneously.
To claim useful batch processing at Levels 3 and 4, one must analyze multi-region improvements and side effects and generalize the group action.

## Comparison Experiments

Execution:

```sh
node --import tsx --test research/block-restoration/restoration.test.ts
node --import tsx research/block-restoration/compare.ts
npm run test:l2
npm run typecheck
```

Each series uses seeds 1–3. First, 3 coarse-layer moves are applied, followed by 0, 1, or 2 fine-layer moves, or by 6 or 30 moves drawn from all position-changing legal moves. On the exact same inputs, we compare the certified method, Option D shortening applied to the certified solution, and the new restoration method. Every output solution is verified on the real engine.
This benchmark reflects a designed distribution containing shallow perturbations, not a uniform sample over reachable states.

| Input series | Restoration success | Certified method moves | Option D only | New method |
| --- | ---: | ---: | ---: | ---: |
| Rigid blocks | 3/3 | 3291–4155 | 3241–4056 | 7–18 |
| 1 fine-layer move | 3/3 | 3213–3789 | 3166–3691 | 8–19 |
| 2 fine-layer moves | 3/3 | 3152–3592 | 3111–3495 | 9–21 |
| 6 mixed moves | 2/3 | 3114–4119 | 3061–4042 | 11–3061 |
| 30 mixed moves | 0/3 | 3801–4158 | 3746–4094 | 3746–4094 |

The new method succeeded in block restoration on 11/15 inputs. Option D reduced move counts on all 15 inputs.
On the 30-mixed-move inputs, the existing certified method took roughly 51–56 ms while the new method took roughly 399–501 ms, slowed down by the unsuccessful search.
For rigid-block inputs, the existing block-quotient solver is already applicable, so those short solutions are not counted as novel restoration achievements.
Initial runs include cache construction; the comparison script runs the search first, which warms up the libraries.
Timings for the new method include final replay on the real engine, whereas Option D timings measure only the shortening pass.
Because these observations use a small number of seeds and different verification costs, no statistical runtime advantage is claimed.

## Next Research Steps

1. Add the existing block-quotient solver as a baseline in block-restoration comparisons to isolate the cost of the restoration phase itself.
2. Measure the relationship between beam width, depth, expansion budget, and success rate on identical inputs, and investigate stopping criteria that predict search cost.
3. Search for macros that realize simultaneous cycles across multiple regions to share setup moves, comparing their effect against simple commutative cancellation.
4. Before scaling to Levels 3 and 4, investigate abstract coordinates and distance tables for block membership and internal relative configurations.
5. Prove a recursive construction that bounds restoration cost at general Levels, distinguishing empirical short solutions from worst-case upper bounds.

Other directions include abstract-state search, wide cycle templates, and joint optimization of setup sequences.
The ultimate research goal is to obtain a constructive algorithm for all reachable states together with an upper bound on its move count.
Solving short scrambles in few moves does not imply an improved upper bound on God's number.

References: [Kociemba's two-phase algorithm](https://www.kociemba.org/twophase.htm),
[Demaine et al. on batch solving large Rubik's Cubes](https://arxiv.org/abs/1106.5736).
We do not claim that the asymptotic complexity of the latter transfers directly to the Menger sponge geometry.

## Extension to Levels 3 and 4 (2026-10-24)

Added registered solver IDs `level3-block-restoration` and `level4-block-restoration`.
The [shared incremental search](../../packages/solver-core/src/algorithms/mengerBlockRestoration.ts) avoids an $N^2$ correspondence table and re-evaluates only the home blocks affected by a candidate move.
The [hierarchical solver](../../packages/solver-core/src/algorithms/higherBlockRestorationSolver.ts) recursively invokes the lower-level restoration solver and verifies the lifted action of each macro move across all cells.
Residuals that cannot be fixed by independent rolls, as well as failures in search or quotient reduction, fall back to the existing certified solver.
At Level 4, the sparse move library is shared with the certified solver to avoid duplicating large permutation tables in memory.

For both Levels 3 and 4, we prepared 3 designed test inputs consisting of coarse Y-layer rotations + fine X-layer rotations (with an additional Y-layer rotation in the 3rd case) + single-cell rotations. In all cases, the solver restored the blocks without reading move history and replayed the final solution on the real engine to exact completion.

| Level | Output moves (3 cases) | Position restoration moves | Candidate expansions (3 cases) |
| --- | --- | --- | --- |
| 3 | 3, 18, 4 | 1, 1, 2 | 2, 5, 2723 |
| 4 | 3, 18, 4 | 1, 1, 2 | 2, 5, 22037 |

In the 2-move restoration case at Level 4, the search performed 1,023,229 block evaluations, and sparse replay of the 4-move final solution updated 72,193 positions.
Because these inputs consist of coarse rotations with shallow perturbations rather than deeply mixed scrambles, they do not constitute a uniform sample or evidence of average-case performance.
Execution times were measured in a process with prebuilt libraries, though initial cache construction costs for lower Levels are included.
No statistical runtime comparison between old and new methods is made here.

```sh
node --import tsx research/block-restoration/higher-level.ts 3
node --import tsx research/block-restoration/higher-level.ts 4
node --import tsx --test research/block-restoration/generalization.test.ts
node --import tsx research/block-restoration/counting-bound.ts
```

In the [generalization proof](../proofs/block-restoration.md), we proved that the positional block-restoration target forms a subgroup, established the necessity and sufficiency of defect 0, verified the correctness of incremental defect evaluation, and proved conditional recursive reduction.
Furthermore, counting cosets from the established position-group orders shows that merely restoring an arbitrary state into *any* rigid-block configuration requires at least 2,807 moves in the worst case at Level 3, and at least 42,809 moves at Level 4.
This lower bound prevents extrapolating low-cost restoration of arbitrary states from empirical success on shallow perturbations.
An efficient general-$n$ restoration upper bound, the exact index of the rigid-block subgroup, and projectability of all rigid states onto the lower-level group remain open problems.

Summary verification commands: `npm run test:block-restoration`, `npm run prove:block-restoration`.
The orbit counts, legal move counts, and parity ranks used in the numerical lower bounds are cross-checked against actual reconstructions of the sparse move groups.

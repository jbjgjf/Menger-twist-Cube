# Level 4: Complete Solution and Results for General n

We implemented `level4-slice-reduction`, which solves the 160,000-cell puzzle directly from its current state across all legal moves of the standard move system. It is a state-based solver, not a scramble-history reversal.
Completeness rests not on a finite number of successful scramble trials, but on shipped tools and computer-verified proofs of the group structure.

| Metric | Level 4 |
| --- | ---: |
| Cells | 160,000 |
| Legal atomic moves | 44,784 |
| Position orbits | 3,050 |
| Dimension of parity space | 66 |
| Cells whose orientation is uniquely determined by position | 148,680 |
| Base-10 logarithm of total group order | 244,936.58485676695… |
| Lower bound on God's number | 52,662 |
| Constructive upper bound on God's number | 23,645,070 |

Move counts treat each $90^\circ$, $-90^\circ$, and $180^\circ$ rotation of a legal target as 1 atomic move.
The upper bound is derived from a worst-case analytical bound on tool applications and conjugating transports for an arbitrary reachable state, rather than from empirically observed solution lengths.
This solver is not shortest-path optimal.

Every orbit possesses a pure 3-cycle that leaves the positions and orientations of all other orbits unchanged.
From the connectivity of conjugated supports, each orbit independently realizes its full alternating group. The simultaneous orientation constraints are the zero twist sum ($\bmod\ 3$) on each $C_3$ orbit and the even flip parity on the $D_4$ orbit; two-cell orientation tools together with independent single-cell rolls eliminate all admissible orientation residuals.

Because unrestricted 3-point setup searches become prohibitively large on the largest orbits, we replaced them with three base tool candidates sharing a common directed edge combined with 2-point transport.
All 23,099,392 ordered-pair states across all 3,050 orbits were exhaustively verified, with a maximum transport distance of 8 moves to a candidate edge.
Every required 3-cycle is constructed from a finite 2-point transport table that fits completely in memory.

The full proof and general-$n$ derivations are documented in the repository at
[`docs/proofs/level4-completeness.md`](../docs/proofs/level4-completeness.md),
and the implementation is described in [`docs/algorithms/level4-slice-reduction-solver.md`](../docs/algorithms/level4-slice-reduction-solver.md).
Full details for all 3,050 orbits are provided in [`orbits-L4.csv`](../research/level4/out/orbits-L4.csv).

## General Level n

The number of legal independent single-cell rolls at Level $n$ is given in closed form by

$$
R_n=(100\,20^{n-1}+272\,8^{n-1}+648\,3^{n-1})/85.
$$

The total number of legal atomic moves is likewise expressed in closed form in terms of $R_n$. Comparing the order of the independent single-cell roll subgroup `C4^(R_n)` against the number of move sequences of a given length yields the asymptotic diameter lower bound `G_n = Ω(20^n/n)` for general $n$. Notably, this lower bound does not require any unproved extrapolation of the alternating-group orbit structure to general $n$.

## Reproducibility

```bash
npm run prove:l4
npm run verify:l4
npm run test:l4
npm run verify:l4:synthetic
npm run bench -- --algorithm=level4-slice-reduction --level=4 --seeds=1 --length=5
```

In the Lab application, Level 4 can be selected on desktop. Scramble, Solve, and benchmark operations run inside a Web Worker; rather than rendering 160,000 meshes or animating millions of sequential moves, the UI displays phase progress and verification results.

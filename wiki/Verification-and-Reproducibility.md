# Verification, Reproducibility, and Terminology Notes

## 1. What Is Delegated to the Computer and What Is Guaranteed by Mathematics

This solution is not based on the claim that "it succeeded several times on random scrambles, so it must be correct." Instead, the computer exhaustively enumerates finite—though large—objects, and mathematical theorems deduce universal completeness from those finite certificates.

| What the computer verifies | Mathematical conclusion deduced from it |
| --- | --- |
| All legal atomic moves and orbit decomposition | Pieces never leave their home position orbits |
| Permutation group certificates for each orbit | Every even permutation is realizable on every orbit |
| Full-cell action of the 164 pure tools | Orbits can be solved one by one independently |
| Finite automaton on $(\text{position}\times 24\text{ orientations})$ | All reachable orientation states are accounted for |
| Row reduction of orbit parity vectors | Every reachable orbit parity vector can be normalized |
| Full move-by-move replay in the actual engine | Every individual returned solution is legal and exact |

## 2. Empirical Benchmark Record for Level 3

All trials below were replayed move-by-move in the actual puzzle engine with per-move legality checks, requiring exact agreement across all 8,000 cells at the end of the sequence.

| seed | Scramble length | Result | Execution time | Solution move count |
| ---: | ---: | --- | ---: | ---: |
| 1 | 5 | Success | 138.1 s | 256,171 |
| 2 | 5 | Success | 112.1 s | 111,830 |
| 1 | 20 | Success | 209.9 s | 364,550 |
| 3 | 20 | Success | 154.8 s | 282,245 |
| 4 | 20 | Success | 249.0 s | 358,331 |
| 5 | 20 | Success | 197.8 s | 350,246 |
| 6 | 100 | Success | 284.2 s | 424,519 |

While these seven trials provide regression evidence against implementation bugs, completeness itself follows from the mathematical proof combining finite orbits, pure 3-cycles, uncutoff BFS, orientation invariants, and two-cell orientation tools. Note that the table above was measured using the solver implementation prior to the 2026-10-10 revision.

## 3. Reproducibility Commands

Run the fast Level 3 structural audit with:

```sh
npm run verify:l3
```

This audits the stored pure tools, performs differential testing between the sparse simulator and the actual engine, and verifies the permutation group certificates for all 164 orbits.

Run the completeness proof computer checks (C1–C9, taking a few seconds) and regression tests with:

```sh
npm run prove:l3
npm run test:l3
```

`test:l3` directly constructs synthetic states satisfying the group invariants without using atomic moves, verifies that the solver solves them, and confirms that states violating the twist-sum or flip-parity invariants are rejected.

To reproduce a single full Level 3 solve benchmark:

```sh
npm run bench -- --algorithm=level3-slice-reduction --level=3 --seeds=6 --length=100
```

Note that this takes several minutes and produces a long output move sequence.

To run an experimental benchmark for the heuristic Level 2 solver:

```sh
npm run bench -- --algorithm=level2-slice-reduction --level=2 --count=10 --length=50
```

Empirical benchmark success with `level2-slice-reduction` does not substitute for a formal completeness proof in the current physical model.

The exhaustive computer checks underlying the formal completeness proof for Level 2 (`level2-certified`) can be re-executed with:

```sh
npm run prove:l2   # Checks C1–C9 (exhaustive search)
npm run test:l2    # Includes solving states constructed directly from the invariants
```

## 4. Evidence in the Source Repository

- `docs/proofs/level2-completeness.tex`, `docs/proofs/level3-completeness.tex`: Formal paper-style completeness proofs
- `packages/solver-core/src/algorithms/level2CertifiedSolver.ts`: Certified complete solver for Level 2 (subject of the formal proof)
- `research/level2-completeness/certify.ts`: Exhaustive computer checks supporting the Level 2 proof
- `packages/solver-core/src/algorithms/level2SliceReductionSolver.ts`: Constructive heuristic solver for Level 2 (shorter solutions, completeness unproved)
- `packages/solver-core/src/algorithms/level3SliceReductionSolver.ts`: Certified complete solver for Level 3
- `packages/solver-core/src/algorithms/level3SliceReductionToolData.ts`: Pure tool data for all 164 orbits of Level 3
- `research/scratch/l3-orbit-groups.ts`: Permutation group certificates for each Level 3 orbit
- `research/scratch/l3-audit-tooldata.ts`: Pure tool audit script
- `research/scratch/l3-sim-vs-engine.ts`: Differential test comparing the sparse simulator against the actual engine
- `docs/architecture/rotation-legality-design-log.md`: Physical collision detection design log and legacy Level 2 verification notes
- `docs/research/level3-solver-completion-audit.md`: Level 3 solver completion audit
- `docs/research/square-region-rotation-model.md`, `docs/research/square-region-rotation-impact.md`: Definition of the expanded move model incorporating inner-square cross-section rotations, and differential/group comparisons for Level 2 (`npm run audit:square`, `npm run test:square`)

## 5. Remaining Research Directions

### Level 2

Completeness was proved in 2026-10 (`docs/proofs/level2-completeness.tex`). The remaining challenge is move efficiency: the certified complete solver `level2-certified` averages roughly 3,800 moves, whereas the uncertified solver `level2-slice-reduction` averages roughly 1,300 moves. Proving completeness for the shorter solver or compressing the certified solver is the natural next step.

### Level 3

Here too, the remaining challenge is move efficiency rather than completeness. Promising directions include synthesizing base tools from shortest setup words, canceling adjacent setup and inverse-setup words across consecutive steps, and utilizing wider-support tools to solve multiple cells simultaneously during the early stages.

### God's Number

For Level 3, the group order $|G_3|\approx10^{11918.138}$ yields an information-theoretic lower bound of 3,353 moves (or 3,207 moves from the position group alone). Tight upper bounds and the exact value of God's number remain open. For Level 2, the number of reachable states has been determined as $|G|\approx2.66\times10^{575}$, yielding an information-theoretic lower bound of 216 moves.

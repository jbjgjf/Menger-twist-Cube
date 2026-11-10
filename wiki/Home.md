# Constructive Solutions for the Menger Twist Cube

**2026-10-15:** Added [Complete Solution for Level 4 and Results for General n](Level-4-Complete-Answer).
This summarizes the independent tools for all 3,050 orbits, the exact group order, the lower and upper bounds `52,662 ≤ G4 ≤ 23,645,070`,
and the general-$n$ formula for the number of legal moves along with the `Ω(20^n/n)` lower bound.

## Mathematics, Algorithms, and Computer-Assisted Proofs for Level 2 and Level 3

Version: 2026-09-06

This document defines the Menger sponge twisty puzzle as a mathematical object and constructively describes solutions for Level 2 and Level 3. We assume the reader has a background roughly equivalent to high school mathematics. Concepts beyond the standard high school curriculum—such as permutation groups, finite fields, and group actions—are defined where needed and introduced through small concrete examples.

The purpose of this document is not merely to present procedural move sequences, but to separate and answer three distinct questions:

1. **Soundness:** Does a given output move sequence genuinely solve the puzzle?
2. **Completeness:** Does the procedure succeed for every reachable state?
3. **Efficiency and Optimality:** Is the resulting move sequence short, or shortest possible?

## Summary of Results

|  | Level 2 | Level 3 |
| --- | --- | --- |
| Number of cells | 400 | 8,000 |
| Legal atomic moves in the current physical model | 468 | 3,591 |
| Position orbits | 11 | 164 |
| General solver | Yes (`level2-certified`) | Yes |
| Completeness | **Proved** (2026-10) | **Proved** |
| Optimality (shortest paths) | No | No |

For Level 3, "complete" means that any state reachable solely via legal moves passing the current collision check can be returned to the solved state in a finite number of moves. Typical measured solutions require approximately 110,000 to 420,000 moves and are not shortest-path solutions.

**Addendum (2026-10).** Completeness for the current physical model of Level 2 has been proved. The set of reachable states is completely characterized by invariants (orbit parities, the twist sums of the two corner orbits, and the flip parity of one edge orbit), and the solver `level2-certified` solves the entire reachable set. The proof is in `docs/proofs/level2-completeness.tex`. The proof for Level 3 has also been migrated to the same format in `docs/proofs/level3-completeness.tex`. The paragraph below describes the status prior to this proof.

Level 2 previously had a constructive solver for the abstract rotation model prior to the introduction of collision detection. However, that proof and its tool library relied on single-cell rotations that are now prohibited. Although benchmarks succeed under the current physical model as well, a finite number of successful trials does not constitute a proof of completeness. This document makes that distinction explicit.

## Contents

1. [Mathematical Preliminaries](Mathematical-Preliminaries)
2. [Strict Definition of Rotation Moves and Comparison of Levels 2 and 3](Move-System)
3. [Proof Architecture for Completeness](Proof-Architecture)
4. [Level 2: Constructive Solver and Previously Open Parts](Level-2-Complete-Answer)
5. [Level 3: Completeness Theorem and Proof](Level-3-Complete-Answer)
6. [Catalogue of the 164 Orbits of Level 3](Level-3-Orbit-Catalogue)
7. [Verification, Reproducibility, and Proof Scope](Verification-and-Reproducibility)

## How to Read This Document

Reading sequentially from the beginning takes you from sets, maps, and permutations all the way to the main theorem for Level 3. Readers already familiar with group theory may check the notation in Chapter 2 and proceed directly to Chapters 3 and 5. Readers wishing to audit the implementation are encouraged to read Chapters 6 and 7 alongside the text.

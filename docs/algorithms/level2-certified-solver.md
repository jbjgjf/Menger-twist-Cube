# Level 2 certified solver (`level2-certified`)

Implementation: [`packages/solver-core/src/algorithms/level2CertifiedSolver.ts`](../../packages/solver-core/src/algorithms/level2CertifiedSolver.ts), tool words in [`level2CertifiedTools.ts`](../../packages/solver-core/src/algorithms/level2CertifiedTools.ts).

This is the Level 2 solver that is **proved complete**: for the standard move system (468 atoms) and for the inner-square system (522 atoms) it solves every reachable state, and rejects every unreachable one with the invariant that fails. The proof is [`docs/proofs/level2-completeness.tex`](../proofs/level2-completeness.tex).

It trades length for provability. Typical solutions are about 3,800 atoms, against about 1,300 for [`level2-slice-reduction`](level2-slice-reduction-solver.md), whose completeness is not proved.

## Phases

| Phase | What it does | Why it always works |
| --- | --- | --- |
| 0. admissibility | Checks that every cell is on its site orbit and in an orientation its (site, orientation) automaton can reach, and that the two corner twist sums and the flip parity are zero | These are invariants of every atom |
| 1. invariant | Applies one word of at most 6 atoms that makes all 11 orbit parities even | The state's parity vector lies in the span of the atoms' vectors, searched exhaustively |
| 2. positions | Orbit by orbit, applies conjugates of one 8-atom pure 3-cycle | Every orbit is 3-transitive (exhaustive search over ordered triples), and each 3-cycle homes at least one more cell |
| 3. orientations | Two-cell twist and flip tools along a chain of cells, then single-cell rolls | The class sums are zero, so the last cell of each chain is correct automatically |

There is no heuristic cut-off anywhere: every search is a breadth-first search of a finite graph run to exhaustion, and the library build throws if any tool word is not pure or any search does not reach every tuple.

## Tools

- One pure 3-cycle per orbit, all of the form `[a, b c b⁻¹]` with single-layer frame turns (the shape of the Rubik's cube corner commutator).
- Three position-fixing two-cell tools (20 atoms each): a twist pair for each 8-cell corner orbit and a flip pair for the 48-cell aligned edge orbit.
- The 72 legal single-cell rolls, which are atoms.

## Move systems

The solver reads `state.moveSystem`. The tools are standard-system words, so the only difference between the systems is the parity span used in phases 0 and 1; in the inner-square system the phase-1 word may contain one ring move.

## Verification

```bash
npm run prove:l2   # the machine checks the proof relies on (independent of the solver)
npm run test:l2    # also solves states sampled directly from the invariant set, and rejects broken ones
```

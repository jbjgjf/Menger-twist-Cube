# Research brief: exact solving on Menger twisty puzzles with inner rotations

## Research question

How does admitting every legal single-plane square-envelope subset rotation change the reachable state space of a Menger twisty puzzle, and can that larger group still be solved constructively?

The model includes the existing slice and recursive extension operations. Cubies are labelled and their full orientations matter. One legal quarter, inverse-quarter, or half turn costs one move. Arbitrary multilayer subsets and oblique axes are outside the declared model.

## Main results supported by certificates

| Expanded model | Level 3 | Level 4 |
| --- | ---: | ---: |
| Legal atomic moves | 5,565 | 91,602 |
| Position orbits, historical → expanded | 164 → 116 | 3,050 → 1,294 |
| Largest orbit | 768 | 25,248 |
| Joint abelian image | 2^43 | 2^240 |
| Digits in the exact group order | 14,105 | 403,271 |
| Counting lower bound on the worst optimal solution | 3,766 | 81,274 |
| Counting lower bound on leaf-block restoration | 3,241 | 71,785 |

These are model-specific results, not claims of an exact God's number or of novelty over all prior literature.

## Methods and evidence

1. **Define the full move alphabet.** Balanced ternary coordinates reduce all planes to 2^n occupancy profiles. Enumerate all rotation-closed subsets satisfying collision implications and the square-envelope condition. Enumeration caps invalidate completion. Positive collision decisions receive rational separating-axis witnesses; accepted extra moves also require exact integer swept-annulus separation.
2. **Compute the larger group.** Recompute position orbits and point holonomy rather than assuming inner moves preserve old orbits. Track permutation signs and abelianized orientation sums jointly over Z4/Z3. Validate legal-word basis witnesses and independently check the image size with a bit-plane method.
3. **Construct a complete solution.** Normalize the joint signature, place even permutations with pure three-cycles, then complete C3/C4/D4 orientation residues. Use a final commutator for a residual D4 commutator-subgroup element. Independently replay every emitted atom in integer coordinates.
4. **Use structure to control transport size.** The 25,248-site orbit would have 637,461,504 ordered pairs including diagonals. Its 407 old orbit colors give 165,649 quotient pairs. Every quotient edge has checked site witnesses; old independent alternating factors supply the internal setup. A naive large-orbit Map search failed during development and is recorded as an ablation, not discarded evidence.
5. **Separate optimization effects.** Compare the complete solver, the same output with commuting cancellation (D), and hierarchical restoration plus D on identical held-out inputs. Store input and implementation hashes. The [regenerated table](inner-square-results.md) reports missing/failed trials as well as completed trials.

## General statements and their limits

- The 2^n plane reduction and the shared-commutator support lemma are general.
- The block defect satisfies a restoration lower bound ceil(D/8^n) in the declared alphabet. This certifies when a shallow restoration search cannot succeed.
- Four independent local orientation corrections share one setup in both Levels 3 and 4: 16 atoms become 10, with full action equality and disjoint leaf-block support.
- The kernel-and-image completeness theorem is conditional on certified cycle, orientation and transport tools. Those conditions have been checked at Levels 3 and 4; their existence for every n is still open.
- Automatic placement of shared commutators throughout a deep solve is not implemented. The local 37.5% saving must not be presented as a full-solver improvement.
- The historical standard-alphabet asymptotic diameter bound must not be transferred to the enlarged alphabet without bounding its generator count.

## Experimental interpretation

Long balanced-family walks contain slice, extension and inner moves, including half-turn-only targets. They are not asserted to be uniform group samples. A separate sampler constructs kernel states and a signature section; it is uniform under ideal independent draws, while experiments use an explicitly recorded seeded PRNG.

The held-out Level 2/3 cohorts each contain ten seeds at lengths 100 and 1,000. The Level 4 cohort contains three length-1,000 seeds, plus a separate directly constructed full-group state. Timings share one machine and are descriptive. Bootstrap intervals summarize seed variation; they do not establish uniform-group or runtime superiority.

The current deep Level 2/3 results show no extra move reduction from hierarchical restoration beyond D. This negative result motivates stronger restoration or automatic sharing, and belongs in the presentation.

## Work still needed for an ISEF submission

- Independent mathematical review of the completeness proof, geometric scope, normal closure argument and group-order formula.
- Recover and read the KTH Menger generalization source and complete a novelty comparison; relevant primary sources are linked in the [study record](inner-square-study.md).
- Extend or delimit the general-n tool construction and improve the large output lengths.
- Explain all algorithms and reproduce selected certificates independently as the student researcher. Record AI-assisted code and proof drafting, corrections, and the student's own analysis.
- Develop an English paper/poster from the research question, methods, results, failures and limits. Use the [official judging criteria](https://www.societyforscience.org/isef/grand-award/criteria/) as a presentation checklist.

The code and numerical results provide a substantial research base. They do not by themselves establish competition readiness or award-level novelty.

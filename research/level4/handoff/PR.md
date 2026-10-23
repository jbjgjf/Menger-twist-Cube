# feat: certify the full Level 4 solver and general-level move counts

Level 4 previously had no solver, and the headless model generated no cubies
at research-only rendering tiers. This change materializes the mechanics state
independently of rendering and adds `level4-slice-reduction` for all 160,000
cells and the complete 44,784-atom standard move set.

The solver normalizes the 66-dimensional orbit-parity vector, places cells on
all 3,050 independent orbits using certified pure 3-cycles and complete
ordered-pair BFS, and finishes C3 twists, D4 flips and independent rolls.
Every output atom is replayed on the sparse integer state before success.
Exhaustive atom comparison connects this simulator to the original engine.
The desktop Lab runs scramble, solve and benchmark work in workers and shows
Level 4 numerical results without materializing a 3D scene or playback history.

The accompanying computation establishes the exact group order
`log10 |G4| = 244936.58485676695…` and the certified interval
**52,662 ≤ G4 ≤ 23,645,070** in the target-turn metric. A separate geometric
count derives exact legal-target formulas for arbitrary level n and the
unconditional bound `G_n = Omega(20^n/n)`. Proofs, complete word data, the
3,050-row orbit catalogue and reproducible experiment records are included.

Validation:

- All workspace typechecks and the Lab production build pass.
- Level 4: six regression tests pass, including full engine endpoints and
  rejection of lone twists/flips and malformed states.
- Existing Level 3: all five completeness regression tests pass.
- All 6,631,848 legal selected-site transitions and 44,784 rotation deltas
  agree with the original engine functions.
- Every orbit's independent alternating subgroup and pair transport is
  certified; the complete pair tables cover 23,099,392 states.
- Full-generator seeded solves at lengths 5, 20 and 100 pass raw replay.
- A direct invariant-state construction disrupting every orbit also solves.
- General-level formula checks match engine censuses through Level 4 and
  independent boundary enumeration through Level 5.

Reproduce with `npm run prove:l4`, `npm run verify:l4`, `npm run test:l4`,
`npm run verify:l4:synthetic`, and the commands in `research/level4/README.md`.

Solutions are not optimal and can contain millions of moves. Large-word
verification uses sparse integer replay supported by exhaustive engine atom
comparison; targeted tests additionally perform full 160,000-cell engine
replay. Recorded Node runs use roughly 1–2 GB. The small timing sample is not
a controlled performance comparison or a literature novelty claim.

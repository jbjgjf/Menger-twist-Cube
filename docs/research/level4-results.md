# Level 4 results and limits

Date: 2026-10-15. Model: standard moves; all three supported angles cost one
target turn. States distinguish all cell identities and exact cube rotations.

## Certified numerical results

| Result | Value |
| --- | ---: |
| Cells | 160,000 |
| Candidate / physically legal targets | 116,568 / 14,928 |
| Legal atoms | 44,784 |
| Independent alternating orbit factors | 3,050 / 3,050 |
| Orbit parity rank | 66 |
| Position-determined orientation | 148,680 / 160,000 |
| Independent C4 cell rolls | 11,256 |
| Required / certified pair twisters | 9 / 9 |
| Exact group order, decimal digits | 244,937 |
| `log10 |G4|` | 244,936.58485676695… |
| Ordered-pair states exhaustively checked | 23,099,392 |
| Maximum distance to a position-tool anchor | 8 |
| God's number interval | **52,662 ≤ G4 ≤ 23,645,070** |

The group-order and transport certificates share word-data SHA-256
`c1a9710097b21cd57c78fa5a74729fe657b610263b994265d22833d774102664`.
The exact integer group order has SHA-256
`a89b92dadae96af75ac8c01ab8375efe9d8b5b6c4cf73ba619292b3448c3cf91`.

The upper bound decomposes as 70 parity atoms, 23,609,664 position atoms and
35,336 orientation atoms. It is an analysis of every permitted input, using
the complete pair BFS tables. It is independent of observed benchmark lengths.
The lower bound compares the exact integer group order with the geometric
series of possible move words.

## Full-generator solves

| Input | Result | Output moves | Measured wall time |
| --- | --- | ---: | ---: |
| Weighted full pool, seed 1, length 5 | solved | 16,137,321 | 212.2 s |
| Weighted full pool, seed 2, length 20 | solved | 3,597,367 | 92.9 s |
| Weighted full pool, seed 3, length 100 | solved | 13,772,903 | 186.7 s |
| Direct invariant construction, every orbit disrupted | solved | 522,559 | 59.0 s |

The length-100 state displaces 101,465 cells. Its solution uses 52,296 pure
placements and independently replays **54,053,735,350 selected-site updates**.
The output-word SHA-256 is
`9e0b931eaddb0315f6a873ccff7b1c1e1dc53e61dce5d725298737b16fd1914d`.

The direct construction uses no scramble at all: one even 3-cycle on every
orbit, balanced twists on all eight C3 orbits, C4 residues throughout, and
flips on all 768 D4 cells (an even number). It disrupts 9,150 positions across
all 3,050 orbits. Its solution replays 1,889,622,902 selected-site updates and
has word SHA-256
`6f4fad10a146623554c69298f914deb49a54d13aab5550dbe565b4c874d4b9d1`.

Records are in `research/results/level4-certified-*.json` and
`research/level4/out/{trial-weighted-seed3-length100,synthetic-all-orbits}.json`.
Runtimes include different caller overheads: the trial streams a word hash
and family census, while the registered solver checks distinct output atoms
through the supplied model. Several experiments ran concurrently on separate
CPU cores. These observations are correctness and scaling data, not a
controlled timing comparison or a statistically significant speed claim.
Scramble length alone does not measure input difficulty.

## Verification evidence

- Original engine position formula: **all 6,631,848 selected entries** agree.
- Original engine orientation delta: **all 44,784 legal atoms** agree.
- Analytic transverse-neighbour legality: **all 348,624 candidate extension
  angle decisions** agree with the engine's complete local geometry checks.
- Full-state geometry spot checks: 279 independent decisions agree.
- Sparse simulator versus full engine: all 160,000 cells agree after each of
  44 moves covering every family.
- Legacy Level 3 simulator: all 3,591 atoms and 255,672 selected entries agree.
- Regression tests: high cell indices, full engine solution endpoints, C3/D4
  completion, long-word composition, malformed states, lone twist/flip rejection.

The large words are verified by raw integer replay, rather than constructing
millions of `Cubie[160000]` snapshots. The exhaustive atom comparison supplies
the link to engine mechanics. Small regression solutions are additionally
replayed with the full engine. These are distinct verification methods and
should remain distinguished in a paper.

## Results for arbitrary n

The [proof](../proofs/level4-completeness.md) derives the exact legal-cell-roll
and legal-atom formulas, without extrapolating an orbit pattern from four data
points:

```text
R_n = (100*20^(n-1) + 272*8^(n-1) + 648*3^(n-1))/85
M_n = 3*(9*(3^n-1)/2 + R_n + 4*sum_(d=1)^(n-1) R_d).
```

The limiting fractions are `R_n/20^n -> 1/17` and `M_n/20^n -> 69/323`.
The independently generated subgroup `C4^(R_n)` gives the unconditional
family lower bound `G_n = Omega(20^n/n)`, with
`liminf n*G_n/20^n >= log(4)/(17*log(20))`.
The formula agrees with complete engine censuses through Level 4 and an
independent boundary enumeration through Level 5.

## What remains

The fixed Level 4 completeness and exact group-order certificates are complete.
Word length is the main practical weakness: 3-cycle placement via commutators
can cost much more than a short scramble. Shorter static tools, cancellation
across placements, and heuristic fast paths can improve it while preserving
the certified completion.

The exact general-n orbit catalogue, parity rank, independent alternating
factors and orientation kernel are not established here. Neither an exact
God's number nor a novelty claim relative to the literature follows from these
results. A paper should include a related-work review before making the latter.

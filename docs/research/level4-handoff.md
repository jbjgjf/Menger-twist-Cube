# Level 4 review and continuation notes

Branch: `feat/level4-research-solver`. The fixed standard Level 4 goal is
implemented and verified. The remaining work below is optional optimization
and publication preparation, rather than a missing completeness step.

## Start here

1. [`level4-results.md`](level4-results.md): measured results and their limits.
2. [`../proofs/level4-completeness.md`](../proofs/level4-completeness.md): the
   exact group order, constructive solve, God's-number bounds, general-n proof.
3. [`../algorithms/level4-slice-reduction-solver.md`](../algorithms/level4-slice-reduction-solver.md): production algorithm and verification policy.
4. [`../../research/level4/README.md`](../../research/level4/README.md): exact reproduction and candidate-discovery commands.

## Code map

- `mengerSparseGroup.ts`: canonical geometry, complete local collision inputs,
  sparse legal atoms, orientation holonomy, parity and 32-bit cell indexing.
- `mengerPairTransport.ts`: complete typed-array BFS on ordered pairs. Three
  alternative third sites make forbidden-site avoidance guaranteed. The largest
  table has 2,357,760 vertices; there is no triple-graph fallback.
- `mengerCertifiedReduction.ts`: state validation, parity, even-permutation
  decomposition, certified orientation completion, independent raw replay.
- `level4CertifiedData.ts`: compact encoded words for 3,050 pure cycles and
  nine pair twisters. Never trust candidate search output without the verifier.
- `level4SliceReductionSolver.ts`: registered API, full-generator weighted
  scrambles and priming of the input state's legality caches.
- `apps/lab`: Level 4 desktop results view; scramble, solve and benchmark
  workers; no 160,000-mesh scene or materialized playback history.

## Checks

```bash
npm run typecheck
npm run build --workspace=@menger/lab
npm run test:l4
npm run prove:l4
npm run verify:l4
npm run verify:l4:synthetic
npm run test:l3
```

Runtime and memory observations use Node 24.11.0. A long solve can need about
1–2 GB and produce millions of output moves. The benchmark CLI writes metrics;
the solver API returns the full word. Browser workers omit the word transfer
for Level 4 and show the verified endpoint/count.

## Mathematical status

- Exact fixed-Level4 group order: `log10 |G4| = 244936.58485676695…`.
- Certified interval: `52,662 <= G4 <= 23,645,070` in the target-turn metric.
- General-n exact legal-roll and legal-atom formulas, and unconditional
  `G_n = Omega(20^n/n)`. The engine UI remains configured for n <= 5.
- General-n independent alternating factors, orbit formula, parity rank and
  full orientation kernel are not proved. Do not extrapolate them from n <= 4.
- Full-engine replay is used for targeted tests. Large benchmark words use
  sparse raw-atom replay supported by exhaustive engine atom comparison; keep
  that verification distinction in any paper or presentation.

## Useful next work for Astra

The expensive part is word length and raw replay. Replace long pure templates
with shorter certified ones; score multi-cell placements; cancel setup words
between placements; add state-based shallow fast paths; investigate tighter
diameter bounds using the exact move alphabet and commuting relations. Retain
the complete pair transport and certified orientation completion as a fallback.
Any measured speed comparison needs controlled workloads and more than the
current small set of seeds.

Before a novelty claim, compare the defined fractal family and the structural
results against primary literature. The current results are computational and
constructive proofs about this repository's exact model, not a literature survey.

## PR publication

The implementation is prepared for review locally. PR publication was
unavailable in the working environment. A local commit and portable bundle/patch
can be reviewed or imported without that access; their paths are reported in
the task response. The accompanying PR description contains the review summary
and validation commands.

## Level2 restoration prototype (2026-10-24)

See [block restoration](block-restoration.md) for the implemented Level2 fast path,
word-shortening baseline, reproducible comparisons and limits. This is a bounded
heuristic with certified completion, not yet a general-level block-restoration theorem.

Level3/4の登録済み階層復元方式と一般命題・中間目標への手数下界を追加した。
[研究記録](block-restoration.md)と
[証明](../proofs/block-restoration.md)を参照。全状態に効率的な一般n再帰解法は未証明。

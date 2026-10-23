# Level 4 research and certificates

The production solver is `level4-slice-reduction`. It handles the full standard
generator set on all 160,000 cells. Mathematical statements and their proofs
are in [`docs/proofs/level4-completeness.md`](../../docs/proofs/level4-completeness.md).

```bash
npm run prove:l4              # shipped words, independent Alt factors, exact order, complete pair tables and diameter upper bound
npm run verify:l4             # old/new simulator, full engine atom formulas, analytic legality, general-n formula
npm run test:l4               # full engine endpoints, high cell indices, C3/D4 completion and unreachable-state rejection
npm run verify:l4:synthetic   # directly construct a legal invariant state disrupting every orbit, then solve
```

The final `out/certificate-L4.json` gives the exact group order when
`completeGroupOrderCertificate` is true. `out/transport-certificate.json`
exhausts all 23,099,392 ordered-pair states across the orbits, checks at least
38 three-alternative anchors per orbit, and derives the constructive bound
`G4 <= 23,645,070`. The counting lower bound is `G4 >= 52,662`.
Both certificates include a hash of the shipped word data.

The generic simulator uses 32-bit **cell** indices. Orbit-local pair indices
fit in the smaller typed tables. Orientation freedom is computed by exact
graph holonomy, without a 24-fold search over every site's entire move list.

## Experiments

```bash
npm run bench -- --algorithm=level4-slice-reduction --level=4 --seeds=1 --length=5
node --import tsx research/level4/trial.ts --family=weighted --seed=3 --length=100
node --import tsx research/level4/census.ts --level=4
```

`trial.ts --family=weighted` uses the same generator weights and seeded RNG as
the registered algorithm. A named family instead samples only that family,
using the documented integer LCG in the script. Trial JSONs include the exact
scramble, displaced cells, placements, all selected-site replay updates, output
family counts and a SHA-256 of the entire output word. The hash is streamed so
multi-million-move solutions do not exceed JavaScript's string-size limit.

## Rebuilding the word library

These deterministic discovery programs checkpoint resumable candidate words.
The checkpoints are ignored by Git; **verification never needs them**.

```bash
node --import tsx research/level4/discover.ts
node --import tsx research/level4/discover-seeds.ts
node --import tsx research/level4/discover-extra.ts
node --import tsx research/level4/orientation-tools.ts
node --import tsx research/level4/certify.ts --candidate-data
node --import tsx research/level4/export.ts
npm run prove:l4
```

Candidate discovery uses bounded beams, conjugate pools and variant limits.
Those are discovery heuristics, not completeness arguments. The exported
finite words and the actual runtime anchor construction are independently
checked after discovery. The production solve never runs the discovery beam.

## General n

`level-n-formula.ts` derives and checks

```text
R_n = (100*20^(n-1) + 272*8^(n-1) + 648*3^(n-1))/85
M_n = 3*(9*(3^n-1)/2 + R_n + 4*sum_(d=1)^(n-1) R_d).
```

There are `R_n` independent C4 cell rolls, giving `G_n = Omega(20^n/n)`
without assuming independent alternating factors at unverified levels.
The exact formulas extend the mathematical family beyond the engine UI's
current level limit; the engine itself is still configured for levels 1–5.

## Verification scope

The exhaustive atom audit compares every selected position transition and each
left-multiplication rotation delta against the original engine functions.
The geometric cylinder exclusion makes the local legality input complete;
all 348,624 candidate extension-angle decisions also agree with the independent
face-neighbour criterion. The sample of full-state collision checks is separate
from that exhaustive analytic comparison.

Large benchmark solutions use raw sparse integer replay. Targeted tests also
replay their whole solutions with the 160,000-cell engine. Runtime and memory
values describe the recorded machine and workload; they are not statistical
or hardware-independent performance claims.

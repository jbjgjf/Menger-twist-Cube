# Handoff Prompt for Claude Science

Develop the Menger twisty puzzle research into a rigorous mathematical and computational study that can be clearly explained, reproduced, and verified at ISEF.
The repository is `jbjgjf/Menger-twist-Cube`, located locally at `/Users/shou/hobby/menger-cube`.
Draft PR: https://github.com/jbjgjf/Menger-twist-Cube/pull/13
Branch: `codex/inner-square-complete-l3-l4`.
Preserve all existing changes and raw data from this work, and begin by checking the current git status and any running background processes.

First check `research/inner-square-expanded/STATUS.md` for the confirmed completion status at handoff.

## Required Initial Reading

1. `docs/research/isef-research-brief.md`: Research questions, main results, and limitations.
2. `docs/proofs/inner-square-completeness.md`: Geometry, joint signature, kernel structure, color-tuple transport, general-$n$ propositions, and the shared correction lemma.
3. `docs/research/inner-square-results.md` and `research/inner-square-expanded/out/primary-summary.json`: Primary held-out seed comparisons. If any runs are incomplete, complete them rather than omitting them.
4. `docs/research/inner-square-study.md`: Experimental contract and prior work.
5. `research/inner-square-expanded/out/source-manifest.json`: Implementation hashes and execution environment.

## Essential Premises

The subject of this study is the `inner-square` move system, which augments the legacy `standard` slice and recursive extension moves with all physically legal subset rotations of defined single-layer square bounding boxes.
Do not use results from the legacy `standard` system (which lacks inner-square rotations) or weak scrambles alone as evidence for the completeness of the new system.
Level 1 coincides across both systems, Level 2 is handled by its existing complete solver, and Levels 3 and 4 are handled by the new joint-signature complete solver.
We do not claim to have solved arbitrary multi-layer subsets or oblique rotation axes.

A key structural phenomenon is that the new inner-square moves merge position orbits: from 164 to 116 at Level 3, and from 3,050 to 1,294 at Level 4.
The orders of the new groups have 14,105 decimal digits (Level 3) and 403,271 decimal digits (Level 4), respectively. The information-theoretic counting lower bounds on God's number are 3,766 and 81,274.
These solvers do not compute exact God's numbers or shortest-path optimal solutions. Do not carry over the general-$n$ diameter lower bound from the legacy `standard` system to the `inner-square` system without re-derivation.

## Implementation and Reproducibility

- `npm run audit:inner-square`: Enumerates all closed sets across $2^n$ plane types with exact collision certificates and outputs the move catalogue. (Note: cap-reach analysis is not yet complete.)
- `npm run prove:inner-square`: Verifies agreement between shipped tools and audit tools, full cell actions, normal closure, straight-line programs (SLPs) for the joint $\mathbf Z_4$ image, independent bit-plane checks, and exact integer group orders and lower bounds.
- `npm run test:inner-square`: Runs unit and integration tests for the new move system, cross-checks against the main engine, negative (unreachable state) tests, and Web Worker move-system propagation.
- `node --import tsx research/inner-square-expanded/functional.ts 3` (and `4`): Audits all orientation tools, isolated $D_4$ residuals, unreachable $C_3$ states, and non-identity inputs.
- `transport-audit.ts 3/4` and `factored-audit.ts 4`: Verifies all ordered pairs on small orbits and all color-tuple edges on large orbits.
- `restoration-check.ts 3/4`, `bound-check.ts 3/4`, `shared-check.ts 3/4`: Verifies inner-square macro lifting, restoration lower bounds, and shared correction words.
- `npm run bench:inner-square -- 4 1000 101 all`: Compares the certified solver, Plan D (`plan-d`), and hierarchical restoration on the exact same input state.
- `npm run bench:inner-square -- 4 0 104 certified direct`: Directly constructs invariant-consistent states across the full group without random-walk scrambles.
- `python3 research/inner-square-expanded/report.py`: Regenerates the primary CSV, JSON, and Markdown summary reports.

Large solutions are independently replayed across all atomic moves using the sparse integer representation, while representative smaller examples are also replayed sequentially in the main puzzle engine. Do not conflate the two verification modes.
Level 4 solves involve tens of millions of moves and tens of billions of selected cell updates, requiring several minutes or more per run. Intermediate progress is checkpointed to JSON.
Do not write concurrently to the same output file as an already running process. Record and preserve any failed or interrupted runs as well.

## Priority Research Tasks

1. Independently audit the proof that the kernel of the joint signature is generated precisely by the independent alternating permutations and the balanced orientation group.
   In particular, verify the final $r^2$ correction in $D_4$, orientation side effects of 3-point tools, conjugate support avoidance, elimination over the non-field ring $\mathbf Z_4$, and the exact group order formula.
2. Formulate color-tuple transport across legacy orbits for general $n$, and prove the regime in which the inductive existence of pure tools holds. Where unconditional induction does not hold, state explicit conditional theorems or counterexamples.
3. Automatically schedule the support-conditioned shared commutators from `mengerSharedCorrection.ts` into the long tool sequences arising on deep scrambles.
   Note that the local shared-commutator example reduces four corrections from 16 moves to 10 moves (a 37.5% local reduction); do not conflate this local reduction with the overall full-solve reduction rate.
4. On deep inputs, the current hierarchical restoration stage produces the exact same move count as Plan D alone. Preserve this negative result honestly, and compare deeper restoration depths, stronger distance lower bounds, and shared-tool search strategies.
5. Carefully compare our model, theorems, and computational results against prior literature. Re-acquire the original KTH thesis "On Rubik's Cube" (§5.6), as its previously recorded URL returned a 404.
6. Prepare an English paper and poster, reduced hand-checkable examples that the student can verify by hand, proof dependency diagrams, and fully reproducible figures and tables.

Unconditional completeness for general $n$, asymptotically efficient algorithms for all $n$, definitive novelty claims, and external expert peer review of the proofs remain open.
In the research records, clearly separate components generated or modified by AI from the student's own verification and discoveries, and avoid making unsubstantiated claims of ISEF-winning quality or absolute novelty.

## Open Issue Regarding Preview Deployment

Three Vercel preview deployments triggered when creating the PR failed, although the local build `npm run build --workspace=@menger/lab` succeeded cleanly.
Inspecting the Vercel logs for `team_jYWAv8vTZaVhpYoBb54n8vai` / `jbjgjfs-projects` returned HTTP 403, so the root cause of the preview deployment failure has not yet been confirmed.
Keep this deployment issue separate from the mathematical and computational verification of the research results; if needed, obtain appropriate Vercel team permissions to inspect the deployment logs, and do not modify deployment configurations or branch protection rules without authorization.

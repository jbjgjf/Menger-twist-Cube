# Confirmed Status at Handoff

PR: https://github.com/jbjgjf/Menger-twist-Cube/pull/13
Branch: `codex/inner-square-complete-l3-l4`. As of 2026-10-25 JST.

## Completed Items

1. Audited all plane types and all candidate moves for Levels 2, 3, and 4. Exhaustive enumeration is complete, with exact proofs for all accepted legal moves and exact rational collision certificates for all rejected candidates.
2. Verified the joint signature, kernel construction, complete solvers, exact group orders, and counting lower bounds for Levels 3 and 4.
3. Verified macro lifting for all 54 Level 2 inner-square atomic moves and all 1,974 Level 3 inner-square atomic moves. Proved the general-$n$ restoration lower bound and shared-correction conditions.
4. Cross-checked the baseline certified solver, Plan D, and hierarchical restoration across 43 mixed benchmark inputs. Also succeeded on 2 directly constructed invariant-consistent states through full atomic-move replay for both the certified solver and Plan D.

Across all 43 trials, the move count of hierarchical restoration equals that of Plan D; it is therefore not counted as an additional improvement over Plan D.
For the local shared-correction construction, four simultaneous corrections are reduced from 16 moves to 10 moves at both Levels 3 and 4, with full action verified across all 8-leaf blocks.

## Average Move Reduction Rate of Plan D on 1,000-Move Scrambles

- Level 2: 1.286% (10 inputs)
- Level 3: 4.679% (10 inputs)
- Level 4: 1.242% (3 inputs)

## Verification Record

Completed `npm run typecheck`, `npm run build`, 60 automated test suites, full-group proofs, independent image cross-checks, exhaustive transport tables, all orientation tools, all inner-square macro liftings, shared words, and artifact integrity checks.
The execution environment and source inventory are recorded in `out/source-manifest.json`. Input and implementation hashes are recorded in each trial JSON. Summary aggregation is reproducible via `report.py`.

## Remaining Research Directions

Existence of pure tools and efficient completeness for general $n$, automated scheduling of shared correction words within deep full-solve sequences, novelty comparison against prior literature, and external expert review of the proofs.
Three automated Vercel preview deployments failed; log inspection returned HTTP 403 due to team permission restrictions, leaving the deployment error cause unconfirmed. All local workspace builds succeed.

When resuming work, use the prompt for Claude Science in `HANDOFF.md`.

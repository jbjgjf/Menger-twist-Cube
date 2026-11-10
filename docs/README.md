# Documentation index

- [`architecture/overview.md`](architecture/overview.md) — how `packages/*` and `apps/*` fit together and why.
- [`architecture/interaction-architecture.md`](architecture/interaction-architecture.md) — turn-target generation, interaction tiers, keyboard grammar.
- [`adr/`](adr/) — architecture decision records, one file per significant decision.
- [`algorithms/`](algorithms/) — one doc per solver algorithm.
- [`proofs/`](proofs/) — completeness proofs as LaTeX papers (Level 2 and Level 3), with the commands that re-run their machine checks.
- [`proofs/level4-completeness.md`](proofs/level4-completeness.md) — Level 4 completeness, exact group order, diameter bounds and a general-level legal-move formula.
- [`algorithms/level4-slice-reduction-solver.md`](algorithms/level4-slice-reduction-solver.md) — the full Level 4 solver, pair transport, verification and browser policy.
- [`research/level4-results.md`](research/level4-results.md) — numerical certificates, full-generator runs, direct all-orbit construction and limits of the conclusions.
- [`research/level4-handoff.md`](research/level4-handoff.md) — code map, reproduction and continuation notes.
- [`research/benchmarking.md`](research/benchmarking.md) — benchmark methodology, the CLI, and how to add a new experiment.
- [`research/level3-solver-completion-audit.md`](research/level3-solver-completion-audit.md) — independent Level 3 completion audit, browser-safety changes, and current Level-n God's-number bounds.
- [`play/overview.md`](play/overview.md) — the Play app's source layout and where its docs live.

## Current Research Focus: The Inner-Square Move System

- [`research/inner-square-study.md`](research/inner-square-study.md) — research questions, comparison methodology across the full generator set, evidence toward ISEF, and limitations.
- [`proofs/inner-square-completeness.md`](proofs/inner-square-completeness.md) — new orbits, joint signature, constructive completeness, and exact group orders for Levels 3 and 4.
- [`research/isef-research-brief.md`](research/isef-research-brief.md) — English research brief, established results and open work.
- [`research/inner-square-results.md`](research/inner-square-results.md) — held-out seed comparisons regenerated from raw data.
- [`algorithms/inner-square-certified-solver.md`](algorithms/inner-square-certified-solver.md) — implementation, block restoration and Variant D, and CLI and Lab usage.

The earlier Level 3 and Level 4 documents above establish results for the `standard` move system. Both the Lab and the CLI now default to `inner-square`.

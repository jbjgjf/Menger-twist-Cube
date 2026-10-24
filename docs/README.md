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

## 現行の研究対象：内面回転を含む系

- [`research/inner-square-study.md`](research/inner-square-study.md) — 研究課題、全生成元の比較方法、ISEFに向けた証拠と限界。
- [`proofs/inner-square-completeness.md`](proofs/inner-square-completeness.md) — Level3/4の新しい軌道・共同署名・構成的完全性・正確な群位数。
- [`algorithms/inner-square-certified-solver.md`](algorithms/inner-square-certified-solver.md) — 実装、復元と案D、CLIとLabの利用方法。

上の従来Level3/4資料は `standard` 系に対する成果。現在のLabとCLIは `inner-square` を既定にする。

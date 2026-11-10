# Proof Documents

Formal completeness proofs in LaTeX and Markdown.

| Document | Contents | Status |
| --- | --- | --- |
| [`level2-completeness.tex`](level2-completeness.tex) | Characterization of reachable states at Level 2 and completeness of the `level2-certified` solver for both the standard system (468 atomic moves) and the expanded system (522 atomic moves) | Proven |
| [`level3-completeness.tex`](level3-completeness.tex) | Characterization of reachable states at Level 3 (group order, twist-sum and flip-parity invariants) and constructive solvability of `level3-slice-reduction` | Proven (standard system; orientation and position lemmas revised on 2026-10-10) |
| [`inner-square-completeness.md`](inner-square-completeness.md) | Exhaustive candidate audit, shared signature, complete solver, group orders, restoration lower bounds, and conditional general-$n$ theorem for Level 3/4 with inner-square rotations | Computational + constructive proof (expanded system) |
| [`preamble.tex`](preamble.tex) | Shared LaTeX preamble | — |
| [`level4-completeness.md`](level4-completeness.md) | Independent alternating groups, exact group order, complete solver, upper and lower bounds on God's number at Level 4, and legal move counts and diameter lower bounds for general $n$ | Computational + constructive proof (standard system) |
| [`block-restoration.md`](block-restoration.md) | General-$n$ block detection, subgroup structure, conditional reduction, and restoration distance lower bounds for Level 3/4 | Analytic proof + integer computation building on existing position-group proofs |

## Building the PDFs

Build with `latexmk`, `pdflatex`, or `lualatex`:

```bash
cd docs/proofs
latexmk -pdf level2-completeness.tex
latexmk -pdf level3-completeness.tex
```

## Re-running Computational Certificates

| Document | Command | Description |
| --- | --- | --- |
| Level 2 | `npm run prove:l2` | Checks C1–C9 (exhaustive search, no randomness). Output written to `research/level2-completeness/out/certificate.json` |
| Level 2 | `npm run test:l2` | Above checks plus solving states synthesized directly from the invariants and rejecting states that violate a single invariant |
| Level 3 | `npm run prove:l3` | Checks C1–C9 (no randomness, runs in a few seconds). Output written to `research/level3-completeness/out/certificate.json` |
| Level 3 | `npm run test:l3` | Above checks plus solving states synthesized directly from the invariants and rejecting states that violate invariants |
| Level 3 | `npm run verify:l3` | Pure-tool audit, sparse simulator vs. engine comparison, and orbit permutation group certificates |
| Level 4 | `npm run prove:l4` | Shipped tools, normal closure, orientation constraints, group order, all-ordered-pairs tables, and diameter upper bound |
| Level 4 | `npm run verify:l4` | Cross-validation against legacy simulator and engine, and legal move count formula for general $n$ |
| Level 4 | `npm run test:l4` | High cell indices, solution replay in the canonical engine, two-point orientation correction, and rejection of unreachable states |
| Level 4 | `npm run verify:l4:synthetic` | History-free synthesis and solving of invariant-compatible states perturbing all 3,050 orbits |

To re-verify the expanded system including inner-square rotations, run `npm run audit:inner-square`, `npm run prove:inner-square`, and `npm run test:inner-square`. The legacy scripts `prove:l3` / `prove:l4` verify the standard system.

## Adding New Proofs

Include `\input{preamble}` and use the standard theorem environments (`theorem`, `lemma`, `proposition`, `corollary`, `definition`, `check`).
Number computer-verified facts using the `check` environment, and document the verification script and reproduction command in the text.

# Research plan — theory + experiments (ISEF track)

Status: adopted 2026-07-28. This is the working plan for turning this repository from a
research *platform* into a research *project* strong enough for JSEC → ISEF. Progress is
tracked in GitHub issues labeled `research-plan`; this document records the strategy and
the reasoning, not day-to-day status.

## Thesis (one sentence)

> We define and implement a new family of self-similar fractal twisty puzzles
> (generalized Menger cubes), analyze their group structure rigorously (orbit
> decomposition, orientation freedom, state-space counting), and demonstrate with
> reproducible benchmarks that structure-aware solving methods (quotient / reduction)
> outperform generic search by orders of magnitude.

Two pillars, one story:

- **Pillar A — Mathematics.** The puzzle family itself is the object of study: group
  structure, orbit decomposition, state-space size as a function of level, and bounds on
  God's number.
- **Pillar B — Algorithms.** The solvers are the object of study: how quotient,
  reduction, and generic search (IDA* + pattern databases) scale on a puzzle family with
  self-similar hierarchy, measured with statistical rigor.

Directions considered and *not* chosen: NP-hardness of optimal solving (high risk of zero
result; kept as a stretch goal inside A-2), machine-learning solvers (deferred to the
post-JSEC phase, see "Stretch goals"), and human-subjects difficulty studies (requires
IRB/SRC pre-approval; incompatible with this year's timeline).

## Why the current repo is not yet an ISEF project

ISEF judging weighs research question, methodology, execution/data analysis, creativity,
and presentation. A well-engineered artifact scores nothing by itself. The three gaps:

1. **No explicit research question or hypothesis** — the repo demonstrates capability,
   not inquiry.
2. **No related-work positioning** — claims of novelty (orbit structure, EC theorem,
   reduction pipeline) are not yet checked against or contrasted with prior literature.
3. **No statistical treatment** — benchmark JSONs are raw records; there are no
   confidence intervals, distributions, or hypothesis tests.

Everything below exists to close those gaps.

## Pillar A — mathematics of the puzzle family

### A-1. Structure theorems (core)

Question: *What are the group structure and state-space size of the level-n Menger
puzzle, as a function of n?*

- Promote the empirically verified results in
  [`rotation-legality-design-log.md`](../architecture/rotation-legality-design-log.md)
  and the Level 2 analysis (class invariance lemma, 11-orbit decomposition, per-class
  orientation freedom, the EC theorem "position determines orientation") from
  exhaustively-checked facts to **stated theorems with proofs**. The exhaustive checks
  (e.g. all 972 move atoms) remain as machine verification of the proofs.
- Derive a closed-form (or generating-function) count of reachable Level 2 states,
  including parity/orientation constraints — the analogue of the 4.3×10^19 number for
  the 3×3×3.
- Generalize the class/orbit analysis to level 3 (conjecture from structure, verify
  computationally where feasible).

### A-2. Bounds on God's number (secondary)

Question: *What upper and lower bounds can we place on the diameter of the Level 2
puzzle group?*

- **Upper bound** from the slice-reduction solver: worst-case move-count analysis of each
  phase, summed. This is a byproduct of Pillar B instrumentation.
- **Lower bound** from state counting (A-1) via the standard information-theoretic
  argument.
- Stretch: conjecture the asymptotic order in n, in the spirit of the Θ(n²/log n) result
  for the n×n×n cube (Demaine et al. 2011). A proof is not required for the project to
  succeed; the designed deliverable is "upper bound from the solver + counting lower
  bound + conjecture with evidence".

## Pillar B — solver science

### B-1. Controlled algorithm comparison (core)

Question: *How much does knowledge of self-similar hierarchy reduce search effort?
Concretely: how do quotient, reduction, and generic search scale on this family?*

- Implement a **generic baseline**: IDA* with admissible pattern-database heuristics,
  written purely against the `PuzzleModel` interface (no Menger-specific knowledge). This
  is the control arm; the existing `level1-quotient`, `level2-block-quotient`, and
  `level2-slice-reduction` solvers are the treatment arms.
- Extend the benchmark grid: hundreds to ~1000 seeded scrambles per configuration,
  varying level (1–2), scramble length, and generator subset. All runs reproducible from
  committed seeds, as today.
- Build an **analysis pipeline** in `research/` that consumes the benchmark JSONs and
  produces: success rates with confidence intervals, move-count and wall-time
  distributions, algorithm-vs-algorithm significance tests and effect sizes, and
  publication-quality figures.
- The claim to substantiate is general, not puzzle-trivia: *structure-aware
  decomposition beats generic admissible search by orders of magnitude, and the gap
  widens with level* — with the measured curves as evidence.

### B-2. Verification hardening (supporting)

Every mathematical claim used by a solver ("verified over all 972 move atoms", orbit
tables, orientation automata) must be backed by a re-runnable verification script,
committed under `research/` and wired into CI, so the claims on the poster are one
command away from re-verification by anyone.

## Related-work survey (prerequisite for both pillars)

A survey document under `research/` covering at minimum:

- n×n×n cube complexity results (Demaine, Demaine, Eisenstat, Lubiw, Winslow 2011;
  Demaine, Eisenstat, Rudoy 2017).
- God's number for the 3×3×3 (Rokicki, Kociemba, Davidson, Dethridge 2010) and
  big-cube reduction methods.
- Learning-based solvers (DeepCubeA, Agostinelli et al. 2019) — context for the stretch
  phase.
- Prior generalized / fractal twisty puzzles (physical and virtual) — establishing what
  is genuinely new here.

Deliverable: for each claimed contribution, an explicit "known / partially known / new"
verdict with citations. This is the document that lets us answer "is this already
known?" instantly in judging.

## Timeline (JSEC 2026 → ISEF 2027)

| Window | Milestone |
| --- | --- |
| Early Aug 2026 | Related-work survey; research question & hypotheses frozen in writing |
| Aug 2026 | IDA*+PDB baseline; benchmark grid expansion; statistical analysis pipeline |
| Late Aug – Sep 2026 | A-1 proofs written up; state-count formula; A-2 upper bound from solver phases |
| Sep 2026 | Paper, abstract, figures; JSEC application (confirm exact deadline early Aug) |
| Oct 2026 → | Respond to national judging; deepen for ISEF (stretch goals below) |

## Stretch goals (post-JSEC, pre-ISEF)

- **Level 3 support** end-to-end (engine already generates it; solver + analysis are the
  work), turning the scaling claim from a 2-point line into a 3-point curve.
- **DeepCubeA-style learned solver** as a third paradigm in the B-1 comparison: does
  learning implicitly discover the orbit/class structure?
- **NP-hardness** of optimal solving for the family, by adapting the n×n×n reduction.

## Administrative checklist

- [ ] Confirm JSEC 2026 requirements and deadline (typically late Sep – early Oct).
- [ ] Review ISEF rules: continuation-project rules, required forms. No human subjects
      → paperwork stays light.
- [ ] Decide category (Mathematics vs. Systems Software) once results shape is clear.

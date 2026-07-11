# Benchmark methodology

## Reproducibility model

A benchmark run is fully determined by four things: the puzzle model id, the algorithm id, the puzzle level, and a list of integer seeds (plus scramble length). Given the same four inputs, `runBenchmark()` always produces the same scrambles and the same `move_count`/`success` outcome per seed — only `runtime_ms` is expected to vary run to run (it's a wall-clock measurement). This is what makes two result files comparable, and what makes a single result file diffable across commits when the algorithm changes.

Scrambling is generic, not Menger-specific: `scrambleState(model, state, rng, length)` repeatedly asks `model.legalMoves(state)` for the legal moves from the *current* state and picks one with a seeded RNG (`createSeededRng`, a small LCG), then applies it via `model.applyMove`. It has no knowledge of cubies, frames, or extension targets — it would scramble any future `PuzzleModel` the same way.

## Running benchmarks

```bash
npm run bench -- --algorithm=level1-quotient --level=1 --count=20 --length=20
npm run bench -- --algorithm=level1-quotient --seeds=1,2,3,4,5 --length=30 --out=research/results/manual-run.json
npm run bench -- --help
```

- `--count=N` generates seeds `1..N` (default 20); `--seeds=1,2,3` overrides with an explicit list.
- `--length=N` is scramble moves per seed (default 20).
- Output defaults to `research/results/<model>_<algorithm>_L<level>_<timestamp>.json`; `--out`/`--out-dir` override.

The same `runBenchmark()` call also backs `apps/lab`'s "Run benchmark" button (in-browser, no file output). The lab's single-solve flow runs the same algorithm/model pair against its seeded scramble and persists each run's record to `localStorage`, so interactive runs stay comparable with CLI output.

## Comparing results

`research/results/` is committed, not gitignored — treat it like a changelog of algorithm performance:

- Load any result file into `apps/lab` ("Compare against a committed CLI result") to see its summary/table next to a live run.
- Diff two committed files in a PR the same way you'd diff any other text file — `move_count`/`success` per seed should only change when the algorithm's behavior actually changed.

## Adding a new experiment

1. Implement and register a new `SolverAlgorithm` (see "Adding future algorithms" in [`docs/algorithms/level1-quotient-solver.md`](../algorithms/level1-quotient-solver.md)).
2. Run `npm run bench -- --algorithm=<new-id> --count=20` to get a baseline result file.
3. Commit the result file under `research/results/` alongside the algorithm so the baseline ships with the code that produced it.
4. If the experiment is novel enough to need write-up (a new heuristic, a different search strategy, a surprising failure mode), add a doc under `docs/algorithms/` describing it, following the structure of the Level 1 doc.

## Why no benchmark database or CI gate yet

A single committed JSON file per run, reviewed by eye or by diff, scales fine for the current one algorithm. A results database, an automated regression-detection report, or a CI gate that fails a PR on regression are all reasonable additions — once there are enough algorithms and enough history that comparing files by hand becomes the bottleneck. Building that now would be designing for a comparison problem that doesn't exist yet.

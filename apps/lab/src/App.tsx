import { useMemo, useRef, useState } from 'react';
import {
  createSeededRng,
  listAlgorithms,
  mengerPuzzleModel,
  runBenchmark,
  scrambleState,
  type BenchmarkRunResult,
  type SolverRunResult,
} from '@menger/solver-core';
import ResultsTable from './components/ResultsTable';
import ExplanationTimeline from './components/ExplanationTimeline';

const numberInputClass =
  'w-full rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-sm text-slate-100 outline-none focus:border-cyan-500';

export default function App() {
  const algorithms = useMemo(() => listAlgorithms(), []);
  const [algorithmId, setAlgorithmId] = useState(algorithms[0]?.id ?? '');
  const algorithm = algorithms.find((candidate) => candidate.id === algorithmId);

  const [level, setLevel] = useState(1);
  const [seedCount, setSeedCount] = useState(20);
  const [scrambleLength, setScrambleLength] = useState(20);
  const [singleSeed, setSingleSeed] = useState(1);

  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkRunResult | null>(null);
  const [importedResult, setImportedResult] = useState<BenchmarkRunResult | null>(null);
  const [singleResult, setSingleResult] = useState<SolverRunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSolvingSingle, setIsSolvingSingle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const runLiveBenchmark = async () => {
    if (!algorithm) return;
    setError(null);
    setIsRunning(true);
    try {
      const seeds = Array.from({ length: Math.max(1, seedCount) }, (_, index) => index + 1);
      const result = await runBenchmark(mengerPuzzleModel, algorithm, {
        level,
        scrambleSeeds: seeds,
        scrambleLength,
      });
      setBenchmarkResult(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Benchmark run failed.');
    } finally {
      setIsRunning(false);
    }
  };

  const runSingleSolve = async () => {
    if (!algorithm) return;
    setError(null);
    setIsSolvingSingle(true);
    try {
      const rng = createSeededRng(singleSeed);
      const solvedState = mengerPuzzleModel.createState(level);
      // Match the benchmark runner: scramble within the algorithm's declared
      // generator set when it has one.
      const movePool = algorithm.scrambleMovePool
        ? (state: typeof solvedState) => algorithm.scrambleMovePool!(mengerPuzzleModel, state)
        : undefined;
      const { state: scrambledState } = scrambleState(mengerPuzzleModel, solvedState, rng, scrambleLength, movePool);
      const result = await algorithm.solve(mengerPuzzleModel, scrambledState);
      setSingleResult(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Solve failed.');
    } finally {
      setIsSolvingSingle(false);
    }
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BenchmarkRunResult;
      if (!Array.isArray(parsed.records)) throw new Error('File does not look like a benchmark result.');
      setImportedResult(parsed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read that file.');
    }
  };

  return (
    <main className="min-h-full bg-slate-950 px-4 py-6 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Menger Cube</p>
          <h1 className="mt-1 text-2xl font-bold">Solver Lab</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Runs algorithms from <code className="text-slate-300">@menger/solver-core</code> directly — no Play-app UI,
            no Three.js. Used to benchmark algorithms against reproducible seeded scrambles and to compare against JSON
            results produced by the <code className="text-slate-300">research/results</code> CLI.
          </p>
        </header>

        <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <h2 className="mb-3 text-sm font-semibold text-slate-100">Run configuration</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-xs text-slate-400">
              Algorithm
              <select
                className={numberInputClass}
                value={algorithmId}
                onChange={(event) => setAlgorithmId(event.target.value)}
              >
                {algorithms.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400">
              Level
              <input
                className={numberInputClass}
                type="number"
                min={1}
                value={level}
                onChange={(event) => setLevel(Number(event.target.value))}
              />
            </label>
            <label className="text-xs text-slate-400">
              Scramble length
              <input
                className={numberInputClass}
                type="number"
                min={1}
                value={scrambleLength}
                onChange={(event) => setScrambleLength(Number(event.target.value))}
              />
            </label>
            <label className="text-xs text-slate-400">
              Seed count (benchmark)
              <input
                className={numberInputClass}
                type="number"
                min={1}
                value={seedCount}
                onChange={(event) => setSeedCount(Number(event.target.value))}
              />
            </label>
          </div>
          {algorithm && (
            <p className="mt-2 text-xs text-slate-500">
              {algorithm.name}@{algorithm.version} — supports level(s) {algorithm.levelsSupported.join(', ')}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded border border-cyan-700 bg-cyan-900/40 px-3 py-1.5 text-sm font-medium text-cyan-100 disabled:opacity-50"
              disabled={!algorithm || isRunning}
              onClick={runLiveBenchmark}
            >
              {isRunning ? 'Running benchmark…' : `Run benchmark (${seedCount} seeds)`}
            </button>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">
                Single seed
                <input
                  className={`${numberInputClass} w-20`}
                  type="number"
                  min={1}
                  value={singleSeed}
                  onChange={(event) => setSingleSeed(Number(event.target.value))}
                />
              </label>
              <button
                className="rounded border border-amber-700 bg-amber-900/30 px-3 py-1.5 text-sm font-medium text-amber-100 disabled:opacity-50"
                disabled={!algorithm || isSolvingSingle}
                onClick={runSingleSolve}
              >
                {isSolvingSingle ? 'Solving…' : 'Solve once (visualize)'}
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-md border border-rose-700 bg-rose-900/40 p-2 text-sm text-rose-100">{error}</div>
        )}

        {singleResult && <ExplanationTimeline result={singleResult} />}

        {benchmarkResult && (
          <ResultsTable
            title={`Live benchmark — ${benchmarkResult.algorithmId} on ${benchmarkResult.modelId}, level ${benchmarkResult.level}`}
            records={benchmarkResult.records}
            summary={benchmarkResult.summary}
          />
        )}

        <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <h2 className="mb-2 text-sm font-semibold text-slate-100">Compare against a committed CLI result</h2>
          <p className="mb-2 text-xs text-slate-400">
            Load a JSON file produced by <code className="text-slate-300">npm run bench</code> (committed under{' '}
            <code className="text-slate-300">research/results/</code>) to compare it against a live run above.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="text-xs text-slate-300"
            onChange={(event) => handleImportFile(event.target.files?.[0])}
          />
        </section>

        {importedResult && (
          <ResultsTable
            title={`Imported result — ${importedResult.algorithmId} on ${importedResult.modelId}, level ${importedResult.level}`}
            records={importedResult.records}
            summary={importedResult.summary}
          />
        )}
      </div>
    </main>
  );
}

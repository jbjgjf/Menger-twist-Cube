import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Cubie } from '@menger/engine';
import {
  createLocalStorageBenchmarkStore,
  createSeededRng,
  listAlgorithms,
  mengerPuzzleModel,
  onSolverDebug,
  runBenchmark,
  scrambleState,
  summarizeBenchmarkRecords,
  type BenchmarkRunResult,
  type SolverBenchmarkRecord,
  type SolverRunResult,
} from '@menger/solver-core';
import CubeView from './components/CubeView';
import ExplanationTimeline from './components/ExplanationTimeline';
import ResultsTable from './components/ResultsTable';
import { useSolvePlayback } from './playback/useSolvePlayback';

const numberInputClass =
  'w-full rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-sm text-slate-100 outline-none focus:border-cyan-500';
const buttonClass =
  'rounded border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40';

interface LogEntry {
  timestamp: number;
  message: string;
}

const formatClock = (timestamp: number): string => {
  const date = new Date(timestamp);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};

// Persisted under the same key the Play app's former Solver Lab panel used,
// so existing benchmark history carries over to /lab.
const benchmarkStore = createLocalStorageBenchmarkStore('menger.solver.benchmarks.v2');

export default function App() {
  const algorithms = useMemo(() => listAlgorithms(), []);
  const solverLevels = useMemo(
    () => [...new Set(algorithms.flatMap((algorithm) => [...algorithm.levelsSupported]))].sort((a, b) => a - b),
    [algorithms],
  );

  const [level, setLevel] = useState(solverLevels[0] ?? 1);
  const [algorithmId, setAlgorithmId] = useState(algorithms[0]?.id ?? '');
  const algorithm = algorithms.find((candidate) => candidate.id === algorithmId);

  const [singleSeed, setSingleSeed] = useState(1);
  const [scrambleLength, setScrambleLength] = useState(20);
  const [seedCount, setSeedCount] = useState(20);

  const [scrambledCubies, setScrambledCubies] = useState<Cubie[] | null>(null);
  const [solveResult, setSolveResult] = useState<SolverRunResult | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkRunResult | null>(null);
  const [importedResult, setImportedResult] = useState<BenchmarkRunResult | null>(null);
  const [solveRecords, setSolveRecords] = useState<SolverBenchmarkRecord[]>(benchmarkStore.load);
  const [isRunning, setIsRunning] = useState(false);
  const [isSolving, setIsSolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const log = useCallback((message: string) => {
    setLogEntries((previous) => [...previous.slice(-199), { timestamp: Date.now(), message }]);
  }, []);

  useEffect(
    () => onSolverDebug((event) => log(`[${event.source}] ${event.message}`)),
    [log],
  );

  const playback = useSolvePlayback(log);
  const { load: loadPlayback } = playback;

  const basePuzzle = useMemo(() => mengerPuzzleModel.createState(level), [level]);

  // Level change resets the bench: solved cube, no moves, level-appropriate
  // algorithm preselected (a level/algorithm mismatch previously produced an
  // instant "Failed" that read as a broken solver).
  useEffect(() => {
    setScrambledCubies(null);
    setSolveResult(null);
    loadPlayback([basePuzzle.cubies], []);
    setAlgorithmId((current) => {
      const selected = algorithms.find((candidate) => candidate.id === current);
      if (selected?.levelsSupported.includes(level)) return current;
      const fallback = algorithms.find((candidate) => candidate.levelsSupported.includes(level));
      return fallback?.id ?? current;
    });
  }, [level, basePuzzle, algorithms, loadPlayback]);

  const scramble = () => {
    if (!algorithm) return;
    setError(null);
    const rng = createSeededRng(singleSeed);
    const movePool = algorithm.scrambleMovePool
      ? (state: typeof basePuzzle) => algorithm.scrambleMovePool!(mengerPuzzleModel, state)
      : undefined;
    const { state: scrambled, moves } = scrambleState(mengerPuzzleModel, basePuzzle, rng, scrambleLength, movePool);
    setScrambledCubies(scrambled.cubies);
    setSolveResult(null);
    loadPlayback([scrambled.cubies], []);
    log(`scramble: level ${level}, seed ${singleSeed}, ${moves.length} moves${movePool ? ` (generator set of ${algorithm.id})` : ''}`);
  };

  const solve = async () => {
    if (!algorithm) return;
    setError(null);
    setIsSolving(true);
    const inputCubies = scrambledCubies ?? basePuzzle.cubies;
    log(`solve: running ${algorithm.id} on level ${level}`);
    try {
      const result = await algorithm.solve(mengerPuzzleModel, { ...basePuzzle, cubies: inputCubies });
      setSolveResult(result);
      setSolveRecords(
        benchmarkStore.record(result, {
          algorithmId: algorithm.id,
          modelId: mengerPuzzleModel.id,
          scrambleSeed: scrambledCubies ? String(singleSeed) : null,
        }),
      );
      if (result.success) {
        let current = { ...basePuzzle, cubies: inputCubies };
        const states: Cubie[][] = [inputCubies];
        for (const move of result.output_moves) {
          current = mengerPuzzleModel.applyMove(current, move);
          states.push(current.cubies);
        }
        loadPlayback(states, result.output_moves, { autoPlay: true });
        log(`solve: success — ${result.move_count} moves in ${result.runtime_ms.toFixed(1)}ms; replay started`);
      } else {
        loadPlayback([inputCubies], []);
        log(`solve: FAILED — ${result.notes}`);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Solve failed.';
      setError(message);
      log(`solve: threw — ${message}`);
    } finally {
      setIsSolving(false);
    }
  };

  const resetCube = () => {
    setScrambledCubies(null);
    setSolveResult(null);
    loadPlayback([basePuzzle.cubies], []);
    log('cube reset to solved state');
  };

  const runLiveBenchmark = async () => {
    if (!algorithm) return;
    setError(null);
    setIsRunning(true);
    log(`benchmark: ${algorithm.id}, level ${level}, ${seedCount} seeds, length ${scrambleLength}`);
    try {
      const seeds = Array.from({ length: Math.max(1, seedCount) }, (_, index) => index + 1);
      const result = await runBenchmark(mengerPuzzleModel, algorithm, {
        level,
        scrambleSeeds: seeds,
        scrambleLength,
      });
      setBenchmarkResult(result);
      log(`benchmark: done — ${(result.summary.successRate * 100).toFixed(1)}% success`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Benchmark run failed.';
      setError(message);
      log(`benchmark: threw — ${message}`);
    } finally {
      setIsRunning(false);
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

  // Keyboard transport: space = play/pause, arrows = step, Home = stop.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (playback.playing) playback.pause();
        else playback.play();
      } else if (event.code === 'ArrowRight') {
        event.preventDefault();
        playback.stepForward();
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault();
        playback.stepBack();
      } else if (event.code === 'Home') {
        event.preventDefault();
        playback.stop();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playback]);

  const displayedCubies = playback.states[Math.min(playback.index, playback.states.length - 1)] ?? [];
  const activeMove = playback.playing ? playback.moves[playback.index] ?? null : null;
  const nextMove = playback.moves[playback.index] ?? null;
  const solveSummary = useMemo(() => summarizeBenchmarkRecords(solveRecords), [solveRecords]);

  return (
    <main className="min-h-full bg-slate-950 px-4 py-6 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Menger Cube</p>
            <h1 className="mt-1 text-2xl font-bold">Algorithm Lab</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
              The dedicated space for watching <code className="text-slate-300">@menger/solver-core</code> algorithms
              work: scramble a cube, run a solver, and replay its solution move by move on the 3D model. Benchmarks
              stay reproducible via seeded scrambles and comparable against CLI results.
            </p>
          </div>
          {error && (
            <p className="rounded border border-rose-500/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">{error}</p>
          )}
        </header>

        <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <label className="text-xs text-slate-400">
              Level
              <select
                className={numberInputClass}
                value={level}
                onChange={(event) => setLevel(Number(event.target.value))}
              >
                {solverLevels.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    Level {candidate} ({3 ** candidate}×{3 ** candidate}×{3 ** candidate})
                  </option>
                ))}
              </select>
            </label>
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
                    {candidate.levelsSupported.includes(level) ? '' : ' (unsupported level)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400">
              Scramble seed
              <input
                className={numberInputClass}
                type="number"
                value={singleSeed}
                onChange={(event) => setSingleSeed(Number(event.target.value))}
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
            <div className="col-span-2 flex items-end gap-2">
              <button className={buttonClass} onClick={scramble} disabled={!algorithm || isSolving}>
                Scramble
              </button>
              <button
                className={`${buttonClass} border-cyan-500/60 bg-cyan-900/40 hover:bg-cyan-800/50`}
                onClick={() => void solve()}
                disabled={!algorithm || isSolving || !algorithm.levelsSupported.includes(level)}
              >
                {isSolving ? 'Solving…' : 'Solve'}
              </button>
              <button className={buttonClass} onClick={resetCube} disabled={isSolving}>
                Reset cube
              </button>
            </div>
          </div>
          {algorithm && (
            <p className="mt-2 text-xs text-slate-500">
              {algorithm.name}@{algorithm.version} — supports level(s) {algorithm.levelsSupported.join(', ')}
              {algorithm.scrambleMovePool ? ' · scrambles use its declared generator set' : ''}
            </p>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
            <div className="relative h-[520px] overflow-hidden rounded-lg border border-slate-800">
              <CubeView
                puzzle={basePuzzle}
                cubies={displayedCubies}
                activeMove={activeMove}
                progressRef={playback.progressRef}
                tick={playback.tick}
              />
              <div className="pointer-events-none absolute left-3 top-3 rounded bg-slate-950/80 px-3 py-2 font-mono text-xs text-slate-200">
                <p>
                  Move {playback.index}/{playback.moves.length}
                  {playback.playing ? ' · playing' : playback.moves.length > 0 ? ' · paused' : ''}
                </p>
                {nextMove && (
                  <p className="mt-1 text-amber-300">
                    {playback.playing ? 'animating' : 'next'}: {nextMove.notation}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className={buttonClass} title="Reset to scrambled state (Home)" onClick={playback.stop}>
                ⏮
              </button>
              <button
                className={buttonClass}
                title="Step back (←)"
                onClick={playback.stepBack}
                disabled={playback.playing || playback.index === 0}
              >
                ◀︎
              </button>
              {playback.playing ? (
                <button className={buttonClass} title="Pause (space)" onClick={playback.pause}>
                  ⏸ Pause
                </button>
              ) : (
                <button
                  className={buttonClass}
                  title="Play (space)"
                  onClick={playback.play}
                  disabled={playback.moves.length === 0}
                >
                  ▶ Play
                </button>
              )}
              <button
                className={buttonClass}
                title="Step forward (→)"
                onClick={playback.stepForward}
                disabled={playback.playing || playback.index >= playback.moves.length}
              >
                ▶︎
              </button>
              <button
                className={buttonClass}
                title="Jump to solved end state"
                onClick={() => playback.jumpTo(playback.moves.length)}
                disabled={playback.moves.length === 0}
              >
                ⏭
              </button>
              <label className="ml-2 flex items-center gap-2 text-xs text-slate-400">
                <span className="whitespace-nowrap font-mono">{(playback.durationMs / 1000).toFixed(1)}s/move</span>
                <input
                  type="range"
                  min={100}
                  max={1000}
                  step={50}
                  value={playback.durationMs}
                  onChange={(event) => playback.setDurationMs(Number(event.target.value))}
                  className="w-40 accent-cyan-400"
                  aria-label="Playback duration per move"
                />
              </label>
              <div className="ml-auto h-1.5 w-40 overflow-hidden rounded bg-slate-800">
                <div
                  className="h-full bg-cyan-500 transition-[width]"
                  style={{
                    width: `${playback.moves.length === 0 ? 0 : Math.round((playback.index / playback.moves.length) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </section>

          <section className="flex max-h-[620px] flex-col gap-3">
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900/60 p-3">
              <h2 className="mb-2 text-sm font-semibold text-slate-100">Solution moves</h2>
              {playback.moves.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No solution loaded. Scramble, then Solve — successful runs replay here move by move.
                </p>
              ) : (
                <ol className="space-y-1 text-xs">
                  {playback.moves.map((move, moveIndex) => (
                    <li key={`${move.notation}-${moveIndex}`}>
                      <button
                        onClick={() => playback.jumpTo(moveIndex)}
                        title={move.reason}
                        className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left font-mono transition ${
                          moveIndex === playback.index
                            ? 'bg-cyan-900/60 text-cyan-100'
                            : moveIndex < playback.index
                              ? 'bg-slate-800/60 text-slate-500'
                              : 'bg-slate-950/40 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span>
                          {moveIndex + 1}. {move.notation}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide">
                          {move.targetKind}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900/60 p-3">
              <h2 className="mb-2 text-sm font-semibold text-slate-100">Debug log</h2>
              {logEntries.length === 0 ? (
                <p className="text-xs text-slate-500">Solver phase events and playback state changes appear here.</p>
              ) : (
                <ol className="space-y-1 font-mono text-[11px] leading-4 text-slate-400">
                  {[...logEntries].reverse().map((entry, entryIndex) => (
                    <li key={`${entry.timestamp}-${entryIndex}`}>
                      <span className="text-slate-600">{formatClock(entry.timestamp)}</span> {entry.message}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>

        {solveResult && <ExplanationTimeline result={solveResult} />}

        <ResultsTable
          title="Recent solve records (persisted locally)"
          records={solveRecords.slice(0, 10)}
          summary={solveSummary}
        />
        <div className="-mt-2 text-right">
          <button
            className={buttonClass}
            onClick={() => {
              benchmarkStore.clear();
              setSolveRecords([]);
              log('cleared persisted solve records');
            }}
          >
            Clear records
          </button>
        </div>

        <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-100">Seeded benchmark</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">
                Seed count
                <input
                  className={`${numberInputClass} w-24`}
                  type="number"
                  min={1}
                  value={seedCount}
                  onChange={(event) => setSeedCount(Number(event.target.value))}
                />
              </label>
              <button className={buttonClass} onClick={() => void runLiveBenchmark()} disabled={!algorithm || isRunning}>
                {isRunning ? 'Running…' : `Run benchmark (${seedCount} seeds)`}
              </button>
              <button className={buttonClass} onClick={() => fileInputRef.current?.click()}>
                Import CLI result…
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(event) => void handleImportFile(event.target.files?.[0])}
              />
            </div>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {benchmarkResult && (
              <ResultsTable
                title={`Live benchmark — ${benchmarkResult.algorithmId}, level ${benchmarkResult.level}`}
                records={benchmarkResult.records}
                summary={benchmarkResult.summary}
              />
            )}
            {importedResult && (
              <ResultsTable
                title={`Imported result — ${importedResult.algorithmId}, level ${importedResult.level}`}
                records={importedResult.records}
                summary={importedResult.summary}
              />
            )}
          </div>
          {!benchmarkResult && !importedResult && (
            <p className="mt-2 text-xs text-slate-500">
              Run a live benchmark over seeds 1..N, or load a JSON file produced by <code>npm run bench</code> (committed
              under <code>research/results/</code>) to compare.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

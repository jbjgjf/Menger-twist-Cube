import { useEffect, useRef, useState } from 'react';
import { isMoveSystemAvailable, moveSystems, type MoveSystem } from '@menger/engine';
import { listAlgorithms } from '@menger/solver-core';
import TradeoffChart from './components/TradeoffChart';
import { compareInWorker, type RunningComparison } from './runSolverWorker';
import { buttonClass, isCompleteFor, moveSystemLabels, numberInputClass, referenceAlgorithmFor } from './solverCatalog';
import type { CompareRun, CompareSpec } from './solverWorkerProtocol';
import { useIsDesktop } from './useIsDesktop';

const algorithms = listAlgorithms();
const levelsFor = (system: MoveSystem): number[] =>
  [...new Set(algorithms.flatMap((algorithm) => algorithm.levelsSupported))]
    .filter((level) => isMoveSystemAvailable(system, level)
      && algorithms.some((algorithm) => isCompleteFor(algorithm, system, level)))
    .sort((a, b) => a - b);

export default function ComparePage() {
  const params = new URLSearchParams(window.location.search);
  const [moveSystem, setMoveSystem] = useState<MoveSystem>(params.get('system') === 'standard' ? 'standard' : 'inner-square');
  const [level, setLevel] = useState(Number(params.get('level')) || 2);
  const [scrambleLength, setScrambleLength] = useState(() => {
    const length = Number(params.get('length') ?? '20');
    return Number.isSafeInteger(length) && length >= 0 ? length : 20;
  });
  const [compareSeedCount, setCompareSeedCount] = useState(5);
  const [compareSpec, setCompareSpec] = useState<(CompareSpec & { moveSystem: MoveSystem }) | null>(null);
  const [compareRuns, setCompareRuns] = useState<CompareRun[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const comparisonRef = useRef<RunningComparison | null>(null);
  const isDesktop = useIsDesktop();
  const levels = levelsFor(moveSystem);
  const effectiveLevel = levels.includes(level) ? level : levels[0]!;
  const blockedOnThisDevice = effectiveLevel >= 3 && !isDesktop;
  const visibleAlgorithms = algorithms.filter((algorithm) => isCompleteFor(algorithm, moveSystem, effectiveLevel));
  const visibleAlgorithmIds = visibleAlgorithms.map((algorithm) => algorithm.id);

  useEffect(() => () => comparisonRef.current?.cancel(), []);

  const runComparison = async () => {
    if (blockedOnThisDevice || visibleAlgorithmIds.length === 0) return;
    const spec: CompareSpec = {
      level: effectiveLevel,
      algorithmIds: visibleAlgorithmIds,
      scrambleAlgorithmId: referenceAlgorithmFor(moveSystem, effectiveLevel),
      seeds: Array.from({ length: Math.max(1, compareSeedCount) }, (_, index) => index + 1),
      length: scrambleLength,
    };
    setError(null);
    setCompareSpec({ ...spec, moveSystem });
    setCompareRuns([]);
    setIsComparing(true);
    const running = compareInWorker(spec, moveSystem, (run) => setCompareRuns((previous) => [...previous, run]));
    comparisonRef.current = running;
    try {
      await running.done;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Comparison failed.';
      if (message !== 'Comparison cancelled.') setError(message);
    } finally {
      comparisonRef.current = null;
      setIsComparing(false);
    }
  };

  return (
    <main className="min-h-full bg-slate-950 px-4 py-6 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Menger Cube · Algorithm Lab</p>
            <h1 className="mt-1 text-2xl font-bold">Moves vs. compute</h1>
            <p className="mt-1 text-sm leading-6 text-slate-400">Compare solution length and computation time on shared scrambles.</p>
          </div>
          <a className={buttonClass} href="/lab/">Back to Algorithm Lab</a>
        </header>
        <section aria-label="Comparison settings" className="grid grid-cols-1 gap-3 rounded-lg border border-slate-700 bg-slate-900/60 p-3 sm:grid-cols-3">
          <label className="text-xs text-slate-400">
            Move system
            <select className={numberInputClass} value={moveSystem} disabled={isComparing}
              onChange={(event) => setMoveSystem(event.target.value as MoveSystem)}>
              {moveSystems.map((system) => <option key={system} value={system}>{moveSystemLabels[system]}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Level
            <select className={numberInputClass} value={effectiveLevel} disabled={isComparing}
              onChange={(event) => setLevel(Number(event.target.value))}>
              {levels.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Scramble length
            <input className={numberInputClass} type="number" min={0} value={scrambleLength} disabled={isComparing}
              onChange={(event) => setScrambleLength(Math.max(0, Math.trunc(Number(event.target.value))))} />
          </label>
        </section>
        {blockedOnThisDevice && <p className="text-sm text-slate-400">Level 3 and 4 comparisons run on desktop devices.</p>}
        {error && <p role="alert" className="rounded border border-rose-500/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{error}</p>}
        <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-3xl">
              <h2 className="text-sm font-semibold text-slate-100">Comparison results</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Every complete solver for this level and move system solves the same seeded scrambles. A solver is on the
                Pareto front when no other solver is at least as fast and as short, and strictly better in one of the two.
                Times are measured on this device in a single worker after one untimed warm-up solve per solver.
              </p>
              {effectiveLevel === 2 && (
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  The two rotation solvers accept any of the 24 completed orientations. The other solvers use the fixed orientation.
                </p>
              )}
            </div>
            <div className="flex items-end gap-2">
              <label className="text-xs text-slate-400">
                Seeds
                <input
                  className={`${numberInputClass} w-20`}
                  type="number"
                  min={1}
                  value={compareSeedCount}
                  disabled={isComparing}
                  onChange={(event) => setCompareSeedCount(Number(event.target.value))}
                />
              </label>
              {isComparing ? (
                <button className={buttonClass} onClick={() => comparisonRef.current?.cancel()}>
                  Stop
                </button>
              ) : (
                <button
                  className={`${buttonClass} border-cyan-500/60 bg-cyan-900/40 hover:bg-cyan-800/50`}
                  onClick={() => void runComparison()}
                  disabled={blockedOnThisDevice || visibleAlgorithms.length === 0}
                >
                  Compare {visibleAlgorithms.length} solver{visibleAlgorithms.length === 1 ? '' : 's'}
                </button>
              )}
            </div>
          </div>
          <p role="status" className="mt-2 break-words font-mono text-[11px] leading-5 text-slate-400">
            {compareSpec
              ? `Level ${compareSpec.level} · ${compareSpec.moveSystem} · scramble length ${compareSpec.length} · seeds 1–${compareSpec.seeds.length} · scrambles from the ${compareSpec.scrambleAlgorithmId} generator set · ${compareRuns.length}/${compareSpec.seeds.length * compareSpec.algorithmIds.length} runs${isComparing ? ' · running' : ''}`
              : `Will compare ${visibleAlgorithmIds.join(', ') || 'no solver'} on Level ${effectiveLevel}, scramble length ${scrambleLength}.`}
            {effectiveLevel >= 4 && ' Level 4 solves take minutes each; start with one or two seeds.'}
            {visibleAlgorithms.length === 1 && ' Only one complete solver exists here, so the plot has a single series.'}
          </p>
          <div className="mt-3">
            <TradeoffChart
              algorithmIds={compareSpec?.algorithmIds ?? visibleAlgorithmIds}
              runs={compareRuns}
              seedCount={compareSpec?.seeds.length ?? compareSeedCount}
            />
          </div>
        </section>

      </div>
    </main>
  );
}

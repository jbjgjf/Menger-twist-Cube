import type { SolverBenchmarkRecord, SolverRunResult } from '../solver/types';
import { summarizeBenchmarkRecords } from '../solver/benchmarkStore';

interface Props {
  lastRun: SolverRunResult | null;
  benchmarkRecords: SolverBenchmarkRecord[];
  preparedStepCount: number;
  nextStepIndex: number;
  disabled: boolean;
  onSolveInstant: () => void;
  onSolveAnimated: () => void;
  onPrepareStep: () => void;
  onApplyStep: () => void;
  onClearBenchmarks: () => void;
}

const formatMs = (value: number): string => `${value.toFixed(1)}ms`;

export default function SolverPanel({
  lastRun,
  benchmarkRecords,
  preparedStepCount,
  nextStepIndex,
  disabled,
  onSolveInstant,
  onSolveAnimated,
  onPrepareStep,
  onApplyStep,
  onClearBenchmarks,
}: Props) {
  const summary = summarizeBenchmarkRecords(benchmarkRecords);
  const latestRecords = benchmarkRecords.slice(0, 5);
  const progress = lastRun?.explanation[lastRun.explanation.length - 1]?.progress;

  return (
    <div className="rounded-md border border-slate-700 bg-slate-950/40 p-2 text-xs text-slate-300">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-semibold text-slate-100">Solver Lab</p>
        {lastRun && (
          <span className={lastRun.success ? 'font-mono text-emerald-300' : 'font-mono text-rose-300'}>
            {lastRun.success ? 'Solved' : 'Failed'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1">
        <button disabled={disabled} onClick={onSolveInstant}>Instant</button>
        <button disabled={disabled} onClick={onSolveAnimated}>Animated</button>
        <button disabled={disabled} onClick={onPrepareStep}>Prepare</button>
      </div>

      <div className="mt-1 grid grid-cols-[1fr_auto] gap-1">
        <button disabled={disabled || preparedStepCount === 0 || nextStepIndex >= preparedStepCount} onClick={onApplyStep}>
          Step
        </button>
        <div className="flex items-center rounded border border-slate-700 bg-slate-900/70 px-2 font-mono text-slate-300">
          {preparedStepCount === 0 ? '0/0' : `${Math.min(nextStepIndex, preparedStepCount)}/${preparedStepCount}`}
        </div>
      </div>

      {lastRun && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-1 font-mono">
            <div className="rounded border border-slate-700 bg-slate-900/60 p-1.5">
              <p className="text-slate-500">Algorithm</p>
              <p className="truncate text-cyan-200">{lastRun.name}</p>
            </div>
            <div className="rounded border border-slate-700 bg-slate-900/60 p-1.5">
              <p className="text-slate-500">Runtime</p>
              <p className="text-cyan-200">{formatMs(lastRun.runtime_ms)}</p>
            </div>
            <div className="rounded border border-slate-700 bg-slate-900/60 p-1.5">
              <p className="text-slate-500">Moves</p>
              <p className="text-cyan-200">{lastRun.move_count}</p>
            </div>
            <div className="rounded border border-slate-700 bg-slate-900/60 p-1.5">
              <p className="text-slate-500">Progress</p>
              <p className="text-cyan-200">
                {progress ? `${progress.solvedCubies}/${progress.totalCubies}` : 'n/a'}
              </p>
            </div>
          </div>

          <div className="max-h-28 overflow-y-auto rounded border border-slate-700 bg-slate-900/60 p-2 leading-5">
            {lastRun.explanation.map((step) => (
              <div key={`${step.phase}-${step.objective}`} className="mb-2 last:mb-0">
                <p className="font-semibold text-slate-100">{step.phase}</p>
                <p className="text-slate-300">{step.objective}</p>
                <p className="text-slate-400">{step.observation}</p>
                {step.reason && <p className="text-slate-500">{step.reason}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2 rounded border border-slate-700 bg-slate-900/60 p-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="font-semibold text-slate-100">Benchmarks</p>
          <button className="px-2 py-1 text-[10px]" onClick={onClearBenchmarks}>Clear</button>
        </div>
        <div className="grid grid-cols-3 gap-1 font-mono text-[11px]">
          <span>{summary.runs} runs</span>
          <span>{Math.round(summary.successRate * 100)}% ok</span>
          <span>{formatMs(summary.averageRuntime)}</span>
        </div>
        {latestRecords.length > 0 && (
          <div className="mt-2 max-h-24 overflow-y-auto">
            <table className="w-full table-fixed text-left text-[10px]">
              <thead className="text-slate-500">
                <tr>
                  <th>Alg</th>
                  <th>ms</th>
                  <th>moves</th>
                  <th>ok</th>
                </tr>
              </thead>
              <tbody className="font-mono text-slate-300">
                {latestRecords.map((record) => (
                  <tr key={record.id} className="border-t border-slate-800">
                    <td className="truncate pr-1">{record.algorithm}</td>
                    <td>{record.runtime_ms.toFixed(0)}</td>
                    <td>{record.move_count}</td>
                    <td>{record.success ? 'Y' : 'N'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

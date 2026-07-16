import type { SolverRunResult } from '@menger/solver-core';

interface Props {
  result: SolverRunResult;
}

export default function ExplanationTimeline({ result }: Props) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-100">Algorithm visualizer</h2>
        <span className={result.success ? 'font-mono text-xs text-emerald-300' : 'font-mono text-xs text-rose-300'}>
          {result.success ? 'Solved' : 'Failed'}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-4 gap-2 font-mono text-xs">
        <div className="rounded border border-slate-700 bg-slate-950/50 p-2">
          <p className="text-slate-500">Algorithm</p>
          <p className="truncate text-cyan-200">{result.name}</p>
        </div>
        <div className="rounded border border-slate-700 bg-slate-950/50 p-2">
          <p className="text-slate-500">Runtime</p>
          <p className="text-cyan-200">{result.runtime_ms.toFixed(1)}ms</p>
        </div>
        <div className="rounded border border-slate-700 bg-slate-950/50 p-2">
          <p className="text-slate-500">Moves</p>
          <p className="text-cyan-200">{result.move_count}</p>
        </div>
        <div className="rounded border border-slate-700 bg-slate-950/50 p-2">
          <p className="text-slate-500">Phases</p>
          <p className="text-cyan-200">{result.explanation.length}</p>
        </div>
      </div>

      <ol className="space-y-2">
        {result.explanation.map((step, index) => {
          const total = step.progress.totalCubies || 1;
          const pct = Math.round((step.progress.solvedCubies / total) * 100);
          return (
            <li key={`${step.phase}-${index}`} className="rounded border border-slate-700 bg-slate-950/50 p-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-100">
                    {index + 1}. {step.phase}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-slate-400">
                    <span>Position: {step.progress.positionSolved}/{step.progress.totalCubies} home</span>
                    <span>Fully Solved: {step.progress.solvedCubies}/{step.progress.totalCubies}</span>
                  </div>
                </div>
                <p className="font-mono text-slate-400 whitespace-nowrap">
                  {pct}% fully solved
                </p>
              </div>
              <p className="mt-1 text-slate-300">{step.objective}</p>
              <p className="mt-1 text-slate-400">{step.observation}</p>
              {step.selectedMove && (
                <p className="mt-1 font-mono text-amber-300">selected: {step.selectedMove}</p>
              )}
              {step.reason && <p className="mt-1 text-slate-500">{step.reason}</p>}
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-slate-800">
                <div className="h-full bg-cyan-500" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

import type { SolverRunResult } from '@menger/solver-core';

interface Props {
  result: SolverRunResult;
}

interface PhaseProgress {
  label: string;
  pct: number;
}

const getPhaseProgress = (phase: string, progress: any): PhaseProgress => {
  const normalized = phase.trim().toLowerCase();
  
  if (normalized.includes('cc placement') && progress.ccHome !== undefined) {
    const current = progress.ccHome;
    const total = 64;
    const pct = Math.round((current / total) * 100);
    return { label: `CC placement: ${current}/${total} home`, pct };
  }
  if (normalized.includes('ce placement') && progress.ceHome !== undefined) {
    const current = progress.ceHome;
    const total = 96;
    const pct = Math.round((current / total) * 100);
    return { label: `CE placement: ${current}/${total} home`, pct };
  }
  if (normalized.includes('cc orientation') && progress.ccSolved !== undefined) {
    const current = progress.ccSolved;
    const total = 64;
    const pct = Math.round((current / total) * 100);
    return { label: `CC orientation: ${current}/${total} oriented`, pct };
  }
  if (normalized.includes('ec placement') && progress.ecHome !== undefined) {
    const current = progress.ecHome;
    const total = 96;
    const pct = Math.round((current / total) * 100);
    return { label: `EC placement: ${current}/${total} home`, pct };
  }
  if (normalized.includes('eea placement') && progress.eeaHome !== undefined) {
    const current = progress.eeaHome;
    const total = 48;
    const pct = Math.round((current / total) * 100);
    return { label: `EEa placement: ${current}/${total} home`, pct };
  }
  if (normalized.includes('eeo placement') && progress.eeoHome !== undefined) {
    const current = progress.eeoHome;
    const total = 96;
    const pct = Math.round((current / total) * 100);
    return { label: `EEo placement: ${current}/${total} home`, pct };
  }
  if (normalized.includes('orientation normalization') && progress.solvedCubies !== undefined) {
    const current = progress.solvedCubies;
    const total = progress.totalCubies || 400;
    const pct = Math.round((current / total) * 100);
    return { label: `Orientation normalization: ${current}/${total} fully solved`, pct };
  }

  // Fallback (e.g. Level 1 or other steps)
  const current = progress.solvedCubies || 0;
  const total = progress.totalCubies || 1;
  const pct = Math.round((current / total) * 100);
  return { label: `${phase}: ${current}/${total} solved`, pct };
};

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
          const { label: phaseProgressLabel, pct: phasePct } = getPhaseProgress(step.phase, step.progress);
          const total = step.progress.totalCubies || 1;
          const overallPct = Math.round((step.progress.solvedCubies / total) * 100);

          return (
            <li key={`${step.phase}-${index}`} className="rounded border border-slate-700 bg-slate-950/50 p-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-100">
                    {index + 1}. {step.phase}
                  </p>
                  <p className="mt-0.5 text-slate-400 font-mono text-[10px]">
                    Phase: {phaseProgressLabel} — {phasePct}%
                  </p>
                  <div className="mt-2 flex flex-col font-mono text-[10px] text-slate-500 border-t border-slate-800/60 pt-1.5">
                    <p className="text-slate-600 font-semibold uppercase tracking-wider text-[8px] mb-0.5">Overall Puzzle Progress</p>
                    {step.progress.totalCubies === 400 ? (
                      <p>
                        {step.progress.positionSolved}/{step.progress.totalCubies} positions home,{' '}
                        {step.progress.solvedCubies}/{step.progress.totalCubies} fully solved
                        {step.progress.positionSolved - step.progress.solvedCubies > 0 ? (
                          `, ${step.progress.positionSolved - step.progress.solvedCubies} orientation defects remain`
                        ) : ''}
                      </p>
                    ) : (
                      <p>
                        Position: {step.progress.positionSolved}/{step.progress.totalCubies} home | {' '}
                        Fully Solved: {step.progress.solvedCubies}/{step.progress.totalCubies} — {overallPct}%
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <p className="mt-2 text-slate-300">{step.objective}</p>
              <p className="mt-1 text-slate-400">{step.observation}</p>
              {step.selectedMove && (
                <p className="mt-1 font-mono text-amber-300">selected: {step.selectedMove}</p>
              )}
              {step.reason && <p className="mt-1 text-slate-500">{step.reason}</p>}
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-slate-800" title={`Phase progress: ${phasePct}%`}>
                <div className="h-full bg-cyan-500" style={{ width: `${phasePct}%` }} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

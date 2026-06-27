import type { SolverBenchmarkRecord } from '@menger/solver-core';

interface Props {
  title: string;
  records: SolverBenchmarkRecord[];
  summary: { runs: number; successRate: number; averageRuntime: number; averageMoveCount: number };
}

const formatMs = (value: number): string => `${value.toFixed(1)}ms`;

export default function ResultsTable({ title, records, summary }: Props) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        <span className="font-mono text-xs text-slate-400">{summary.runs} run(s)</span>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 font-mono text-xs">
        <div className="rounded border border-slate-700 bg-slate-950/50 p-2">
          <p className="text-slate-500">Success rate</p>
          <p className="text-cyan-200">{(summary.successRate * 100).toFixed(1)}%</p>
        </div>
        <div className="rounded border border-slate-700 bg-slate-950/50 p-2">
          <p className="text-slate-500">Avg runtime</p>
          <p className="text-cyan-200">{formatMs(summary.averageRuntime)}</p>
        </div>
        <div className="rounded border border-slate-700 bg-slate-950/50 p-2">
          <p className="text-slate-500">Avg moves</p>
          <p className="text-cyan-200">{summary.averageMoveCount.toFixed(1)}</p>
        </div>
      </div>

      {records.length > 0 && (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="pb-1">Seed</th>
                <th className="pb-1">Algorithm</th>
                <th className="pb-1">ms</th>
                <th className="pb-1">moves</th>
                <th className="pb-1">ok</th>
              </tr>
            </thead>
            <tbody className="font-mono text-slate-300">
              {records.map((record) => (
                <tr key={record.id} className="border-t border-slate-800">
                  <td className="truncate py-1">{record.scramble_seed ?? '—'}</td>
                  <td className="truncate py-1">{record.algorithm}</td>
                  <td className="py-1">{record.runtime_ms.toFixed(0)}</td>
                  <td className="py-1">{record.move_count}</td>
                  <td className="py-1">{record.success ? 'Y' : 'N'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

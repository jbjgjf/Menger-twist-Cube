import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@menger/theme';
import type { CompareRun } from '../solverWorkerProtocol';

// Categorical colors for the five Level 2 solvers on the dark plot surface.
const seriesColors = ['#3987e5', '#d95926', '#199e70', '#ca8fdb', '#dac354'] as const;
const chartHeight = 340;
const margin = { top: 16, right: 28, bottom: 52, left: 68 };
/** Advance of an 11px monospace glyph, used to keep direct labels inside the plot. */
const monoCharWidth = 6.7;

export interface SolverSummary {
  algorithmId: string;
  color: string;
  solved: number;
  failed: number;
  medianMs: number;
  medianMoves: number;
  meanMoves: number;
  onFront: boolean;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

export const formatMs = (ms: number): string => {
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${Number((ms / 1000).toPrecision(3))} s`;
};
const formatMoves = (moves: number): string => Math.round(moves).toLocaleString('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

const niceStep = (span: number, count: number): number => {
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  return (normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10) * magnitude;
};

const linearTicks = (lo: number, hi: number, count: number): number[] => {
  const step = niceStep(hi - lo, count);
  const ticks: number[] = [];
  for (let value = Math.ceil(lo / step) * step; value <= hi + step * 1e-9; value += step) {
    ticks.push(Number(value.toPrecision(12)));
  }
  return ticks;
};

/** Decades when the range is wide, then 1-2-5, then every integer mantissa. */
const logTicks = (lo: number, hi: number): number[] => {
  if (hi / lo < 4) return linearTicks(lo, hi, 4);
  for (const mantissas of [[1], [1, 2, 5], [1, 2, 3, 4, 5, 6, 7, 8, 9]]) {
    const ticks: number[] = [];
    for (let k = Math.floor(Math.log10(lo)); k <= Math.ceil(Math.log10(hi)); k += 1) {
      for (const m of mantissas) {
        const value = m * 10 ** k;
        if (value >= lo && value <= hi) ticks.push(value);
      }
    }
    if (ticks.length >= 3) return ticks;
  }
  return [lo, hi];
};

/** One point per solver: median time and median moves over its solved seeds. */
export const summarizeComparison = (algorithmIds: string[], runs: CompareRun[]): SolverSummary[] => {
  const summaries = algorithmIds.map((algorithmId, index) => {
    const own = runs.filter((run) => run.algorithmId === algorithmId);
    const solved = own.filter((run) => run.success);
    return {
      algorithmId,
      color: seriesColors[index] ?? '#94a3b8',
      solved: solved.length,
      failed: own.length - solved.length,
      medianMs: solved.length ? median(solved.map((run) => run.wallMs)) : Number.NaN,
      medianMoves: solved.length ? median(solved.map((run) => run.moveCount)) : Number.NaN,
      meanMoves: solved.length ? solved.reduce((sum, run) => sum + run.moveCount, 0) / solved.length : Number.NaN,
      onFront: false,
    };
  });
  const plotted = summaries.filter((s) => s.solved > 0);
  // Both axes are minimized; a solver is on the front unless another is no
  // worse on both and strictly better on one.
  for (const s of plotted) {
    s.onFront = !plotted.some((q) => q !== s && q.medianMs <= s.medianMs && q.medianMoves <= s.medianMoves
      && (q.medianMs < s.medianMs || q.medianMoves < s.medianMoves));
  }
  return summaries;
};

const useElementWidth = () => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    observer.observe(element);
    setWidth(Math.floor(element.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
};

interface Hover {
  x: number;
  y: number;
  lines: string[];
}

interface Props {
  algorithmIds: string[];
  runs: CompareRun[];
  seedCount: number;
}

export default function TradeoffChart({ algorithmIds, runs, seedCount }: Props) {
  const theme = useTheme();
  const surface = theme.background;
  const gridStroke = theme.resolved === 'dark' ? '#2c2c2e' : '#d2d2d7';
  const frontStroke = theme.resolved === 'dark' ? '#c7c7cc' : '#515154';
  const [containerRef, width] = useElementWidth();
  const [hover, setHover] = useState<Hover | null>(null);
  // Marks move when runs stream in or a new comparison starts.
  useEffect(() => setHover(null), [runs]);
  const summaries = useMemo(() => summarizeComparison(algorithmIds, runs), [algorithmIds, runs]);
  const colorOf = useMemo(() => new Map(summaries.map((s) => [s.algorithmId, s.color])), [summaries]);
  const solvedRuns = useMemo(() => runs.filter((run) => run.success), [runs]);
  const plotted = summaries.filter((s) => s.solved > 0);

  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = chartHeight - margin.top - margin.bottom;

  const scales = useMemo(() => {
    if (solvedRuns.length === 0) return null;
    const times = solvedRuns.map((run) => Math.max(run.wallMs, 0.05));
    const moves = solvedRuns.map((run) => run.moveCount);
    const xLo = Math.min(...times) / 1.4;
    const xHi = Math.max(...times) * 1.4;
    const yMin = Math.min(...moves);
    const yMax = Math.max(...moves);
    const pad = Math.max((yMax - yMin) * 0.12, yMax * 0.01, 1);
    const yLo = Math.max(0, yMin - pad);
    const yHi = yMax + pad;
    const x = (ms: number) => margin.left + ((Math.log(Math.max(ms, 0.05)) - Math.log(xLo)) / (Math.log(xHi) - Math.log(xLo))) * innerWidth;
    const y = (value: number) => margin.top + innerHeight - ((value - yLo) / (yHi - yLo)) * innerHeight;
    return { x, y, xTicks: logTicks(xLo, xHi), yTicks: linearTicks(yLo, yHi, 5) };
  }, [solvedRuns, innerWidth, innerHeight]);

  const front = plotted.filter((s) => s.onFront).sort((a, b) => a.medianMs - b.medianMs);
  const frontPath = scales && front.length > 1
    ? front.map((s, i) => (i === 0
      ? `M${scales.x(s.medianMs)},${scales.y(s.medianMoves)}`
      : `H${scales.x(s.medianMs)}V${scales.y(s.medianMoves)}`)).join('')
    : null;

  const showHover = (x: number, y: number, lines: string[]) => setHover({ x, y, lines });

  return (
    <div className="space-y-3">
      {plotted.length >= 2 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300" aria-label="Legend">
          {summaries.map((s) => (
            <li key={s.algorithmId} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              <span className="font-mono">{s.algorithmId}</span>
            </li>
          ))}
          <li className="flex items-center gap-1.5 text-slate-400">
            <span className="inline-block h-px w-4 bg-slate-300" /> Pareto front
          </li>
        </ul>
      )}

      <div ref={containerRef} className="relative w-full" style={{ height: chartHeight }}>
        {width > 0 && scales ? (
          <svg width={width} height={chartHeight} role="img"
            aria-label="Solution length against solver time; each large dot is a solver's median, small dots are single seeds.">
            {scales.yTicks.map((tick) => (
              <g key={`y${tick}`}>
                <line x1={margin.left} x2={width - margin.right} y1={scales.y(tick)} y2={scales.y(tick)} stroke={gridStroke} strokeWidth={1} />
                <text x={margin.left - 8} y={scales.y(tick)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[11px]">
                  {compact.format(tick)}
                </text>
              </g>
            ))}
            {scales.xTicks.map((tick) => (
              <g key={`x${tick}`}>
                <line x1={scales.x(tick)} x2={scales.x(tick)} y1={margin.top} y2={margin.top + innerHeight} stroke={gridStroke} strokeWidth={1} />
                <text x={scales.x(tick)} y={margin.top + innerHeight + 16} textAnchor="middle" className="fill-slate-500 text-[11px]">
                  {formatMs(tick)}
                </text>
              </g>
            ))}
            <text x={margin.left + innerWidth / 2} y={chartHeight - 8} textAnchor="middle" className="fill-slate-400 text-[11px]">
              Wall time per solve (log scale) — lower is cheaper
            </text>
            <text transform={`translate(14 ${margin.top + innerHeight / 2}) rotate(-90)`} textAnchor="middle" className="fill-slate-400 text-[11px]">
              Solution length (moves) — lower is shorter
            </text>

            {frontPath && <path d={frontPath} fill="none" stroke={frontStroke} strokeWidth={1.5} />}

            {solvedRuns.map((run) => (
              <circle key={`${run.algorithmId}-${run.seed}`} cx={scales.x(run.wallMs)} cy={scales.y(run.moveCount)} r={4}
                fill={colorOf.get(run.algorithmId)} fillOpacity={0.45} stroke={surface} strokeWidth={2} />
            ))}
            {plotted.map((s) => {
              const cx = scales.x(s.medianMs);
              const cy = scales.y(s.medianMoves);
              // Labels sit above the point (the front runs horizontally out of
              // it), on whichever side fits inside the plot.
              const labelWidth = s.algorithmId.length * monoCharWidth;
              const labelX = cx + 8 + labelWidth <= width - 4
                ? cx + 8
                : cx - 8 - labelWidth >= margin.left
                  ? cx - 8 - labelWidth
                  : Math.min(Math.max(cx - labelWidth / 2, margin.left), width - 4 - labelWidth);
              const labelY = cy - 16 < margin.top + 6 ? cy + 24 : cy - 16;
              return (
                <g key={s.algorithmId}>
                  {s.onFront && <circle cx={cx} cy={cy} r={11} fill="none" stroke={frontStroke} strokeWidth={1} />}
                  <circle cx={cx} cy={cy} r={7} fill={s.color} stroke={surface} strokeWidth={2} />
                  <text x={labelX} y={labelY} className="fill-slate-300 font-mono text-[11px]">
                    {s.algorithmId}
                  </text>
                </g>
              );
            })}

            {/* Hit targets: larger than the marks, medians on top. */}
            {solvedRuns.map((run) => {
              const cx = scales.x(run.wallMs);
              const cy = scales.y(run.moveCount);
              return (
                <circle key={`hit-${run.algorithmId}-${run.seed}`} cx={cx} cy={cy} r={10} fill="transparent"
                  onPointerEnter={() => showHover(cx, cy, [run.algorithmId, `seed ${run.seed}`, `${formatMoves(run.moveCount)} moves`, formatMs(run.wallMs)])}
                  onPointerLeave={() => setHover(null)} />
              );
            })}
            {plotted.map((s) => {
              const cx = scales.x(s.medianMs);
              const cy = scales.y(s.medianMoves);
              return (
                <circle key={`hit-${s.algorithmId}`} cx={cx} cy={cy} r={13} fill="transparent"
                  onPointerEnter={() => showHover(cx, cy, [s.algorithmId, `median of ${s.solved} seed(s)`, `${formatMoves(s.medianMoves)} moves`, formatMs(s.medianMs), s.onFront ? 'on the Pareto front' : 'dominated'])}
                  onPointerLeave={() => setHover(null)} />
              );
            })}
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center rounded border border-dashed border-slate-700 px-6 text-center text-xs text-slate-500">
            {runs.length > 0
              ? 'No solver has finished a seed yet.'
              : 'Run a comparison to plot every complete solver for this level and move system on the same scrambles.'}
          </div>
        )}
        {hover && (
          <div
            className="pointer-events-none absolute z-10 rounded border border-slate-600 bg-slate-950/95 px-2 py-1.5 font-mono text-[11px] leading-4 text-slate-200 shadow-lg"
            style={hover.x > width - 190 ? { right: width - hover.x + 14, top: hover.y - 12 } : { left: hover.x + 14, top: hover.y - 12 }}
          >
            {hover.lines.map((line, index) => <p key={index} className={index === 0 ? 'text-slate-100' : 'text-slate-400'}>{line}</p>)}
          </div>
        )}
      </div>

      {runs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="pb-1 font-medium">Solver</th>
                <th className="pb-1 font-medium">Solved</th>
                <th className="pb-1 font-medium">Median time</th>
                <th className="pb-1 font-medium">Median moves</th>
                <th className="pb-1 font-medium">Mean moves</th>
                <th className="pb-1 font-medium">Pareto front</th>
              </tr>
            </thead>
            <tbody className="font-mono text-slate-300">
              {summaries.map((s) => (
                <tr key={s.algorithmId} className="border-t border-slate-800">
                  <td className="py-1">
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: s.color }} />
                    {s.algorithmId}
                  </td>
                  <td className="py-1">{s.solved}/{seedCount}{s.failed > 0 ? ` (${s.failed} failed)` : ''}</td>
                  <td className="py-1">{s.solved ? formatMs(s.medianMs) : '—'}</td>
                  <td className="py-1">{s.solved ? formatMoves(s.medianMoves) : '—'}</td>
                  <td className="py-1">{s.solved ? formatMoves(s.meanMoves) : '—'}</td>
                  <td className="py-1">{s.solved ? (s.onFront ? 'yes' : 'dominated') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

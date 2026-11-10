import type { MoveSystem } from '@menger/engine';
import type { SolverAlgorithm } from '@menger/solver-core';

// The move system is chosen before the level: it decides which rotations the
// cube has at all. Inner rotations are primary; historical standard-only
// results remain available as explicitly separate comparisons.
export const moveSystemLabels: Record<MoveSystem, string> = {
  standard: 'Historical system (without inner rotations)',
  'inner-square': 'Inner square rotations (primary system)',
};
// The complete solver each (system, level) is anchored to: the default pick,
// and the generator set that scrambles the shared inputs of a comparison.
export const referenceAlgorithmFor = (system: MoveSystem, level: number): string => {
  if (level === 1) return 'level1-quotient';
  if (level === 2) return 'level2-certified';
  return system === 'inner-square' ? `level${level}-inner-square-certified` : `level${level}-slice-reduction`;
};

export const isCompleteFor = (candidate: SolverAlgorithm, system: MoveSystem, level: number): boolean =>
  candidate.levelsSupported.includes(level) && (candidate.completeIn ?? []).includes(system);

export const numberInputClass =
  'w-full rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-sm text-slate-100 outline-none focus:border-cyan-500';
export const buttonClass =
  'rounded border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40';

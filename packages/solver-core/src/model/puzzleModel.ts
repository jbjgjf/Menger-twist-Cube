/**
 * The abstraction the benchmark runner, CLI, and algorithm registry use to
 * stay puzzle-agnostic. A `PuzzleModel` is the only thing that needs to know
 * how a concrete puzzle represents state and moves; everything generic
 * (seeded scrambling, benchmarking, comparing algorithms) is written once
 * against this interface and works for any model that implements it.
 *
 * `mengerPuzzleModel` is the only implementation today, but the type is
 * shaped so a future puzzle (a different Menger variant, or an entirely
 * different twisty puzzle) could register its own model + algorithms
 * without touching the runner or the CLI.
 */
export interface PuzzleModel<TState, TMove> {
  readonly id: string;
  readonly levelsSupported: readonly number[];
  createState(level: number): TState;
  cloneState(state: TState): TState;
  legalMoves(state: TState): TMove[];
  applyMove(state: TState, move: TMove): TState;
  isSolved(state: TState): boolean;
  describeMove(move: TMove): string;
  stateFingerprint(state: TState): string;
}

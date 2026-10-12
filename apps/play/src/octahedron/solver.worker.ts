/// <reference lib="webworker" />
/**
 * Runs the octahedron solvers off the main thread. The Level 1 tables take a
 * few seconds to build (one is a 16 MB breadth-first search), which the
 * original pages hid by building them in idle slices on the UI thread.
 */
import { createOctaPuzzle, solveOcta, warmOctaSolverStep, type OctaLevel, type OctaMove } from '@menger/octahedron';

export type OctaWorkerRequest =
  | { type: 'warm'; level: OctaLevel }
  | { type: 'solve'; id: number; level: OctaLevel; state: number[] };

export type OctaWorkerResponse =
  | { type: 'solved'; id: number; moves: OctaMove[] | null; error?: string };

self.onmessage = (event: MessageEvent<OctaWorkerRequest>) => {
  const request = event.data;
  if (request.type === 'warm') {
    const puzzle = createOctaPuzzle(request.level);
    while (warmOctaSolverStep(puzzle)) { /* build every table */ }
    return;
  }
  try {
    const moves = solveOcta(createOctaPuzzle(request.level), Uint8Array.from(request.state));
    self.postMessage({ type: 'solved', id: request.id, moves } satisfies OctaWorkerResponse);
  } catch (error) {
    self.postMessage({ type: 'solved', id: request.id, moves: null, error: String(error) } satisfies OctaWorkerResponse);
  }
};

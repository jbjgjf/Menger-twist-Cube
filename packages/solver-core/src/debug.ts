/**
 * Lightweight solver debug channel. Solvers emit phase-boundary events so a
 * UI (apps/lab's debug log) or a test can see exactly where a solve is —
 * and, when something stalls, where it stopped. The default listener writes
 * to `console.debug`, so events are always inspectable in devtools even
 * without a subscriber.
 */
export interface SolverDebugEvent {
  source: string;
  message: string;
  timestamp: number;
}

type SolverDebugListener = (event: SolverDebugEvent) => void;

const listeners = new Set<SolverDebugListener>();

export const onSolverDebug = (listener: SolverDebugListener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const emitSolverDebug = (source: string, message: string): void => {
  const event: SolverDebugEvent = { source, message, timestamp: Date.now() };
  // eslint-disable-next-line no-console
  console.debug(`[solver:${source}] ${message}`);
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // A broken listener must never break a solve.
    }
  }
};

/**
 * Bounds a promise so a solve can never hang on an external subroutine (the
 * `cubing` search has no internal time limit and can search unboundedly on
 * pathological patterns). On timeout the promise rejects; the caller falls
 * back or fails honestly. The underlying work is not cancelled — cubing has
 * no cancellation API — but the solve itself always terminates.
 */
export const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause) => {
        clearTimeout(timer);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      },
    );
  });

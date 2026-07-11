import { useCallback, useEffect, useRef, useState } from 'react';
import type { Cubie } from '@menger/engine';
import type { SolverMove } from '@menger/solver-core';

export interface PlaybackApi {
  /** Cubie states: states[i] = cubies after i moves. Always length >= 1. */
  states: Cubie[][];
  moves: SolverMove[];
  /** Number of fully applied moves; the displayed base state is states[index]. */
  index: number;
  playing: boolean;
  durationMs: number;
  /** 0..1 progress of the currently animating move; read per frame by the cube view. */
  progressRef: React.MutableRefObject<number>;
  /** Wall-clock advancement; idempotent. Called by an interval AND by the render loop. */
  tick: () => void;
  load: (states: Cubie[][], moves: SolverMove[], options?: { autoPlay?: boolean }) => void;
  play: () => void;
  pause: () => void;
  /** Reset to the pre-solve state (index 0) and pause. */
  stop: () => void;
  /** Animate exactly one move, then pause. */
  stepForward: () => void;
  /** Rewind one move instantly. */
  stepBack: () => void;
  /** Jump to an exact index (paused). */
  jumpTo: (index: number) => void;
  setDurationMs: (ms: number) => void;
}

/**
 * Deterministic solve playback driven by the wall clock, not by timer
 * cadence: every tick computes how many whole moves have elapsed since the
 * current move started and catches up. requestAnimationFrame gives smooth
 * per-frame rotation while visible; a coarse interval keeps the index
 * advancing when the tab is hidden (where rAF never fires and timers are
 * throttled) — playback can lag there, but it can never stall.
 */
export const useSolvePlayback = (onEvent?: (message: string) => void): PlaybackApi => {
  const [states, setStates] = useState<Cubie[][]>([[]]);
  const [moves, setMoves] = useState<SolverMove[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [durationMs, setDurationMs] = useState(400);

  const progressRef = useRef(0);
  const indexRef = useRef(0);
  const playingRef = useRef(false);
  const movesRef = useRef<SolverMove[]>([]);
  const durationRef = useRef(durationMs);
  const moveStartRef = useRef(0);
  const stopAtRef = useRef<number | null>(null);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    durationRef.current = durationMs;
  }, [durationMs]);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const emit = (message: string) => onEventRef.current?.(message);

  const syncIndex = (nextIndex: number) => {
    indexRef.current = nextIndex;
    setIndex(nextIndex);
  };

  const syncPlaying = (nextPlaying: boolean) => {
    playingRef.current = nextPlaying;
    setPlaying(nextPlaying);
  };

  const tick = useCallback(() => {
    if (!playingRef.current) return;
    const total = movesRef.current.length;
    const duration = Math.max(50, durationRef.current);
    const now = performance.now();
    let currentIndex = indexRef.current;
    let elapsed = now - moveStartRef.current;
    let advanced = false;

    while (elapsed >= duration && currentIndex < total) {
      currentIndex += 1;
      moveStartRef.current += duration;
      elapsed = now - moveStartRef.current;
      advanced = true;
      if (currentIndex >= total || (stopAtRef.current !== null && currentIndex >= stopAtRef.current)) {
        stopAtRef.current = null;
        progressRef.current = 0;
        syncIndex(currentIndex);
        syncPlaying(false);
        emit(currentIndex >= total ? `playback: finished (${total} moves applied)` : `playback: paused at move ${currentIndex}/${total}`);
        return;
      }
    }

    progressRef.current = Math.min(1, Math.max(0, elapsed / duration));
    if (advanced) syncIndex(currentIndex);
  }, []);

  // Coarse driver: keeps playback advancing even when rAF never fires
  // (hidden tab). Visible tabs get smooth motion from the render loop
  // calling tick() every frame on top of this.
  useEffect(() => {
    if (!playing) return;
    const interval = window.setInterval(tick, 100);
    return () => window.clearInterval(interval);
  }, [playing, tick]);

  const load = useCallback((nextStates: Cubie[][], nextMoves: SolverMove[], options?: { autoPlay?: boolean }) => {
    setStates(nextStates.length > 0 ? nextStates : [[]]);
    setMoves(nextMoves);
    movesRef.current = nextMoves;
    stopAtRef.current = null;
    progressRef.current = 0;
    syncIndex(0);
    if (options?.autoPlay && nextMoves.length > 0) {
      moveStartRef.current = performance.now();
      syncPlaying(true);
      emit(`playback: auto-playing ${nextMoves.length} moves`);
    } else {
      syncPlaying(false);
    }
  }, []);

  const play = useCallback(() => {
    if (movesRef.current.length === 0) return;
    if (indexRef.current >= movesRef.current.length) {
      // Replay from the start when already at the end.
      progressRef.current = 0;
      syncIndex(0);
    }
    stopAtRef.current = null;
    moveStartRef.current = performance.now();
    syncPlaying(true);
    emit(`playback: playing from move ${indexRef.current}`);
  }, []);

  const pause = useCallback(() => {
    if (!playingRef.current) return;
    stopAtRef.current = null;
    progressRef.current = 0;
    syncPlaying(false);
    emit(`playback: paused at move ${indexRef.current}`);
  }, []);

  const stop = useCallback(() => {
    stopAtRef.current = null;
    progressRef.current = 0;
    syncIndex(0);
    syncPlaying(false);
    emit('playback: stopped (reset to scrambled state)');
  }, []);

  const stepForward = useCallback(() => {
    if (playingRef.current || indexRef.current >= movesRef.current.length) return;
    stopAtRef.current = indexRef.current + 1;
    moveStartRef.current = performance.now();
    syncPlaying(true);
    emit(`playback: stepping move ${indexRef.current + 1}/${movesRef.current.length}`);
  }, []);

  const stepBack = useCallback(() => {
    if (playingRef.current || indexRef.current === 0) return;
    progressRef.current = 0;
    syncIndex(indexRef.current - 1);
    emit(`playback: rewound to move ${indexRef.current}`);
  }, []);

  const jumpTo = useCallback((nextIndex: number) => {
    const clamped = Math.max(0, Math.min(movesRef.current.length, Math.floor(nextIndex)));
    stopAtRef.current = null;
    progressRef.current = 0;
    syncIndex(clamped);
    syncPlaying(false);
  }, []);

  return {
    states,
    moves,
    index,
    playing,
    durationMs,
    progressRef,
    tick,
    load,
    play,
    pause,
    stop,
    stepForward,
    stepBack,
    jumpTo,
    setDurationMs,
  };
};

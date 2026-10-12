import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyOctaMove,
  createOctaPuzzle,
  inverseOctaMove,
  isOctaSolved,
  octaAxes,
  octaHasSolver,
  octaLevels,
  octaMovedPieces,
  octaScramble,
  solvedOctaState,
  type OctaDir,
  type OctaLevel,
  type OctaMove,
  type OctaState,
} from '@menger/octahedron';
import OctahedronScene, { type OctaAnimation } from './OctahedronScene';
import type { OctaWorkerRequest, OctaWorkerResponse } from './solver.worker';

/** A queued turn. `kind` decides what it does to the move counter and the undo history. */
interface QueuedTurn {
  move: OctaMove;
  duration: number;
  kind: 'manual' | 'undo' | 'scramble' | 'solve';
}

const turnButtons: Array<{ dir: OctaDir; label: string; title: string }> = [
  { dir: 1, label: '↺ +90°', title: 'counter-clockwise' },
  { dir: -1, label: '↻ −90°', title: 'clockwise' },
  { dir: 2, label: '180°', title: '180°' },
];

const selectedClass = 'border-cyan-400 bg-cyan-900/50 text-cyan-100';

export default function OctahedronApp() {
  const [level, setLevel] = useState<OctaLevel>(0);
  const puzzle = useMemo(() => createOctaPuzzle(level), [level]);
  const [state, setState] = useState<OctaState>(() => solvedOctaState(puzzle));
  const [busy, setBusy] = useState(false);
  const [moves, setMoves] = useState(0);
  const [history, setHistory] = useState<OctaMove[]>([]);
  const [scrambled, setScrambled] = useState(false);
  const [solveLeft, setSolveLeft] = useState(0);
  const [computing, setComputing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [axis, setAxis] = useState(0);
  const [hover, setHover] = useState<{ axis: number; region: number } | null>(null);
  const [lock, setLock] = useState<{ axis: number; region: number } | null>(null);
  const [controlsOpen, setControlsOpen] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [cameraRequest, setCameraRequest] = useState(0);

  const animation = useRef<OctaAnimation | null>(null);
  const queue = useRef<QueuedTurn[]>([]);
  const running = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // ---------- turn queue ----------

  const runQueue = useCallback(() => {
    const turn = queue.current.shift();
    if (!turn) {
      running.current = false;
      animation.current = null;
      setBusy(false);
      return;
    }
    running.current = true;
    setBusy(true);
    const before = stateRef.current;
    const pieces = new Set(octaMovedPieces(puzzle, before, turn.move));
    const target = (turn.move.dir * Math.PI) / 2;
    animation.current = { axis: turn.move.axis, pieces, angle: 0 };
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / turn.duration);
      const eased = 1 - Math.pow(1 - t, 3);
      if (animation.current) animation.current.angle = target * eased;
      if (t < 1) { requestAnimationFrame(step); return; }
      const after = applyOctaMove(puzzle, before, turn.move);
      stateRef.current = after;
      animation.current = null;
      setState(after);
      if (turn.kind === 'manual') { setHistory((h) => [...h, turn.move]); setMoves((n) => n + 1); }
      if (turn.kind === 'undo') setMoves((n) => Math.max(0, n - 1));
      if (turn.kind === 'solve') setSolveLeft((n) => Math.max(0, n - 1));
      runQueue();
    };
    requestAnimationFrame(step);
  }, [puzzle]);

  const enqueue = useCallback((turns: QueuedTurn[]) => {
    queue.current.push(...turns);
    if (!running.current) runQueue();
  }, [runQueue]);

  const turn = (move: OctaMove) => {
    if (busy || computing) return;
    setNotice(null);
    enqueue([{ move, duration: puzzle.durations.manual, kind: 'manual' }]);
  };

  // ---------- solver worker ----------

  const worker = useRef<Worker | null>(null);
  const pending = useRef<{ id: number; resolve: (moves: OctaMove[] | null) => void } | null>(null);
  useEffect(() => {
    const w = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (event: MessageEvent<OctaWorkerResponse>) => {
      const job = pending.current;
      if (job && job.id === event.data.id) { pending.current = null; job.resolve(event.data.moves); }
    };
    worker.current = w;
    return () => w.terminate();
  }, []);
  useEffect(() => {
    // Build the tables ahead of the first Solve, as the original pages did after load.
    if (octaHasSolver(puzzle)) worker.current?.postMessage({ type: 'warm', level } satisfies OctaWorkerRequest);
  }, [level, puzzle]);

  const solve = () => {
    if (busy || computing || !worker.current || !octaHasSolver(puzzle)) return;
    if (isOctaSolved(state)) { setNotice('Already solved.'); return; }
    setComputing(true);
    setNotice(null);
    const id = Date.now();
    new Promise<OctaMove[] | null>((resolve) => {
      pending.current = { id, resolve };
      worker.current!.postMessage({ type: 'solve', id, level, state: Array.from(state) } satisfies OctaWorkerRequest);
    }).then((solution) => {
      setComputing(false);
      if (!solution) { setNotice('No solution found.'); return; }
      if (solution.length === 0) return;
      setHistory([]);
      setScrambled(true);
      setSolveLeft(solution.length);
      setNotice(level === 0 ? `Shortest solution: ${solution.length} moves` : `Solution: ${solution.length} moves`);
      enqueue(solution.map((move) => ({ move, duration: puzzle.durations.solve, kind: 'solve' })));
    });
  };

  // ---------- actions ----------

  const scramble = () => {
    if (busy || computing) return;
    setHistory([]);
    setMoves(0);
    setScrambled(true);
    setNotice(null);
    enqueue(octaScramble(puzzle).map((move) => ({ move, duration: puzzle.durations.scramble, kind: 'scramble' })));
  };

  const undo = () => {
    if (busy || computing || history.length === 0) return;
    const last = history[history.length - 1]!;
    setHistory((h) => h.slice(0, -1));
    enqueue([{ move: inverseOctaMove(last), duration: puzzle.durations.manual, kind: 'undo' }]);
  };

  const reset = () => {
    if (busy || computing) return;
    setHistory([]);
    setMoves(0);
    setScrambled(false);
    setNotice(null);
    setState(solvedOctaState(puzzle));
  };

  const changeLevel = (next: OctaLevel) => {
    if (busy || computing || next === level) return;
    const nextPuzzle = createOctaPuzzle(next);
    setLevel(next);
    setState(solvedOctaState(nextPuzzle));
    setHistory([]);
    setMoves(0);
    setScrambled(false);
    setNotice(null);
    setHover(null);
    setLock(null);
  };

  // Level 0 keeps the page's keyboard: 1–6 turn a vertex, Shift reverses, Alt turns 180°.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (level !== 0 || event.repeat) return;
      const i = Number.parseInt(event.key, 10);
      if (i >= 1 && i <= 6) turn({ axis: i - 1, region: 0, dir: event.altKey ? 2 : event.shiftKey ? -1 : 1 });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const focus = hover ?? lock;
  const highlighted = useMemo(
    () => new Set(focus ? octaMovedPieces(puzzle, state, focus) : []),
    [focus, puzzle, state],
  );

  const solved = scrambled && isOctaSolved(state);
  const status = computing
    ? 'Computing solution…'
    : solveLeft > 0
      ? `Solving… ${solveLeft} moves left`
      : solved
        ? `Solved! (${moves} moves)`
        : `Moves ${moves}`;

  return (
    <main className="min-h-full bg-slate-950 text-slate-100">
      <section className="relative h-screen w-full" aria-labelledby="octa-title">
        <OctahedronScene puzzle={puzzle} state={state} animation={animation} highlighted={highlighted} cameraRequest={cameraRequest} />

        <header className="pointer-events-none absolute left-1/2 top-2 z-10 w-[min(44rem,calc(100vw-12rem))] -translate-x-1/2 text-center sm:top-3">
          <p className="hidden text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80 sm:block">
            Sierpiński octahedron twisty puzzle
          </p>
          <h1 id="octa-title" className="truncate text-sm font-bold tracking-wide text-white drop-shadow-lg sm:text-lg">
            Octahedron Puzzle · Level {level}
          </h1>
          <p className={`mt-1 text-xs font-semibold drop-shadow sm:text-sm ${solved && solveLeft === 0 ? 'text-emerald-300' : 'text-slate-300'}`} aria-live="polite">
            {status}
          </p>
        </header>

        <div className="pointer-events-none absolute inset-0 flex items-start justify-between gap-3 p-2 sm:p-4">
          <div className="pointer-events-auto flex flex-col items-start gap-2">
            <div className="flex gap-2">
              <button onClick={() => setControlsOpen((open) => !open)}>{controlsOpen ? 'Close controls' : 'Controls'}</button>
              <a href="/" className="rounded-md border border-slate-600 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-100 transition hover:bg-slate-700">
                Menger Cube
              </a>
            </div>

            {controlsOpen && (
              <div className="max-h-[calc(100vh-4rem)] w-[min(350px,calc(100vw-1rem))] space-y-3 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/75 p-3 shadow-2xl backdrop-blur-sm sm:p-4">
                <div>
                  <h2 className="text-lg font-bold tracking-wide text-white sm:text-xl">Octahedron Puzzle</h2>
                  <p className="text-xs text-slate-400">Turn pyramids and frustums about the six vertex axes.</p>
                </div>

                <div className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-md border border-slate-700 bg-slate-950/40 p-2 text-xs text-slate-300">
                  <span className="font-semibold text-slate-100">Level</span>
                  <div className="grid grid-cols-4 gap-2">
                    {octaLevels.map((target) => (
                      <button
                        key={target}
                        disabled={busy || computing || level === target}
                        onClick={() => changeLevel(target)}
                        className={level === target ? selectedClass : undefined}
                      >
                        L{target}
                      </button>
                    ))}
                  </div>
                  <span className="text-slate-400">Pieces</span>
                  <span className="font-mono text-slate-200">{puzzle.pieces.length}</span>
                  <span className="text-slate-400">Solver</span>
                  <span className="font-mono text-slate-200">
                    {level === 0 ? 'shortest (bidirectional BFS)' : level === 1 ? 'Thistlethwaite + Level 0' : level === 2 ? 'layered, reuses Level 1' : 'none'}
                  </span>
                </div>

                <div className="rounded-md border border-slate-700 bg-slate-950/40 p-2 text-xs text-slate-300">
                  <p className="mb-2 font-semibold text-slate-100">Turn Navigator</p>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Axis</p>
                  <div className="mb-2 grid grid-cols-6 gap-1" role="group" aria-label="Turning axis">
                    {octaAxes.map((a, i) => (
                      <button
                        key={a.label}
                        aria-pressed={axis === i}
                        onClick={() => { setAxis(i); setHover(null); if (lock) setLock({ axis: i, region: lock.region }); }}
                        className={`px-1 ${axis === i ? selectedClass : ''}`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>

                  <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Region</p>
                  <div className="space-y-1">
                    {puzzle.regions.map((region, k) => {
                      const isLocked = !!lock && lock.axis === axis && lock.region === k;
                      const isFocused = !!focus && focus.axis === axis && focus.region === k;
                      const on = () => setHover({ axis, region: k });
                      const off = () => setHover(null);
                      return (
                        <div
                          key={region.label}
                          className={`flex items-center gap-1 rounded-md p-0.5 ${isFocused ? 'bg-slate-800' : ''}`}
                          onPointerEnter={on}
                          onPointerLeave={off}
                          onFocus={on}
                          onBlur={off}
                        >
                          <button
                            className={`flex-1 truncate border-transparent bg-transparent px-1 text-left ${isLocked ? 'border-cyan-400 text-cyan-100' : ''}`}
                            aria-pressed={isLocked}
                            title="Highlight this region"
                            onClick={() => setLock(isLocked ? null : { axis, region: k })}
                          >
                            {region.label} <span className="text-slate-500">({region.count})</span>
                          </button>
                          {turnButtons.map(({ dir, label, title }) => (
                            <button
                              key={dir}
                              className="px-2"
                              disabled={busy || computing}
                              aria-label={`Turn ${octaAxes[axis]!.label} ${region.label} ${title}`}
                              onClick={() => turn({ axis, region: k, dir })}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {notice && <div className="rounded-md border border-slate-700 bg-slate-950/40 p-2 text-xs text-slate-300">{notice}</div>}

                <div className="grid grid-cols-2 gap-2">
                  <button disabled={busy || computing} onClick={scramble}>Scramble</button>
                  <button disabled={busy || computing || !octaHasSolver(puzzle)} onClick={solve} title={octaHasSolver(puzzle) ? undefined : 'Level 3 has no solver yet'}>
                    Solve
                  </button>
                  <button disabled={busy || computing || history.length === 0} onClick={undo}>Undo</button>
                  <button disabled={busy || computing} onClick={reset}>Reset</button>
                  <button className="col-span-2" onClick={() => setCameraRequest((n) => n + 1)}>Reset camera</button>
                </div>
              </div>
            )}
          </div>

          <div className="pointer-events-auto flex flex-col items-end gap-2">
            <button onClick={() => setInfoOpen((open) => !open)}>{infoOpen ? 'Close info' : 'Info'}</button>
            {infoOpen && (
              <div className="w-[min(280px,calc(100vw-1rem))] rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-300">
                <p className="mb-1 font-semibold text-slate-100">How it works</p>
                <ul className="space-y-1">
                  <li>• Each label (+X, −X, …) marks a turning axis through a vertex.</li>
                  <li>• Pick an axis, then turn one of its regions.</li>
                  <li>• Hover a region to light up its pieces; click its name to keep it lit.</li>
                  <li>• Solved means every piece wears the same orientation — a whole-puzzle rotation still counts.</li>
                  {level === 0 && <li>• Keys 1–6 turn a vertex; Shift reverses, Alt turns 180°.</li>}
                  <li>• Drag empty space to orbit the view.</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

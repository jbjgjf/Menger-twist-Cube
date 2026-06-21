import type { Cubie, PuzzleState, RotationFrame, TwistAngle } from '../types/puzzle';
import type { SolverExplanationStep, SolverMove, SolverRunResult } from './types';
import {
  applyExtensionRotation,
  applyTwistToCubies,
  createExtensionMove,
  createMove,
  cubieNaturalAxis,
} from '../engine/moves';
import { generateMenger } from '../engine/generateMenger';
import { rotateQuaternion } from '../engine/geometry';
import {
  isExactlySolved,
  isFrameSolved,
  isOrientationSolved,
  orientationKey,
  progressForCubies,
  progressSummary,
  samePosition,
  stateKey,
  vectorKey,
} from './level1State';
import { cube3x3x3 } from 'cubing/puzzles';
import { experimentalSolve3x3x3IgnoringCenters } from 'cubing/search';
import { KPattern, type KPuzzle, type KPatternData } from 'cubing/kpuzzle';

const solverName = 'level-1-state-normalizer';
const solverVersion = '0.1.0';
const frameSearchNodeBudget = 80000;
const frameSearchMaxDepth = 14;
const frameSearchRuntimeBudgetMs = 420;
const primaryComplexityEstimate =
  'O(20) state projection plus cubing frame solve over the 3x3x3 quotient, then O(12 * 4) extension normalization';
const frameAngles: TwistAngle[] = [90, -90, 180];
const extensionAngles: TwistAngle[] = [90, -90, 180];
const cubingMoveNames = ['U', 'D', 'R', 'L', 'F', 'B', 'M', 'E', 'S'] as const;

const edgePositions = [
  [0, 1, 1], [1, 1, 0], [0, 1, -1], [-1, 1, 0],
  [0, -1, 1], [1, -1, 0], [0, -1, -1], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
] as const;

const cornerPositions = [
  [1, 1, 1], [1, 1, -1], [-1, 1, -1], [-1, 1, 1],
  [1, -1, 1], [-1, -1, 1], [-1, -1, -1], [1, -1, -1],
] as const;

const edgeSlotByPosition = new Map(edgePositions.map((position, index) => [vectorKey(position), index]));
const cornerSlotByPosition = new Map(cornerPositions.map((position, index) => [vectorKey(position), index]));

const cubingMoveToFrame: Record<string, { axisName: 'X' | 'Y' | 'Z'; layer: number; angle: TwistAngle }> = {
  U: { axisName: 'Y', layer: 1, angle: -90 },
  D: { axisName: 'Y', layer: -1, angle: 90 },
  R: { axisName: 'X', layer: 1, angle: -90 },
  L: { axisName: 'X', layer: -1, angle: 90 },
  F: { axisName: 'Z', layer: 1, angle: -90 },
  B: { axisName: 'Z', layer: -1, angle: 90 },
  M: { axisName: 'X', layer: 0, angle: 90 },
  E: { axisName: 'Y', layer: 0, angle: 90 },
  S: { axisName: 'Z', layer: 0, angle: -90 },
};

interface CubingCalibration {
  kpuzzle: KPuzzle;
  cornerOrientationByKey: Map<string, number>;
  edgeOrientationByKey: Map<string, number>;
}

let calibrationPromise: Promise<CubingCalibration> | null = null;

interface QueueNode {
  cubies: Cubie[];
  moves: SolverMove[];
  key: string;
  depth: number;
  heuristic: number;
  priority: number;
  lastFrameId: string | null;
  lastAxisName: string | null;
}

interface CandidateFrameMove {
  frame: RotationFrame;
  angle: TwistAngle;
  notation: string;
}

const orientationLookupKey = (slot: number, piece: number, orientation: string): string =>
  `${slot}:${piece}:${orientation}`;

const pieceIndexForCubie = (cubie: Cubie): number | null => {
  if (cubie.type === 'corner') return cornerSlotByPosition.get(vectorKey(cubie.homePosition)) ?? null;
  if (cubie.type === 'edge') return edgeSlotByPosition.get(vectorKey(cubie.homePosition)) ?? null;
  return null;
};

const slotIndexForCubie = (cubie: Cubie): number | null => {
  if (cubie.type === 'corner') return cornerSlotByPosition.get(vectorKey(cubie.currentPosition)) ?? null;
  if (cubie.type === 'edge') return edgeSlotByPosition.get(vectorKey(cubie.currentPosition)) ?? null;
  return null;
};

const findFrameForCubingMove = (
  puzzle: PuzzleState,
  moveName: string,
): RotationFrame | null => {
  const mapping = cubingMoveToFrame[moveName];
  if (!mapping) return null;
  return puzzle.frames.find((frame) =>
    frame.axisName === mapping.axisName && frame.layer === mapping.layer && frame.scale === 1,
  ) ?? null;
};

const parseCubingToken = (token: string): { moveName: string; angle: TwistAngle } | null => {
  const moveName = token[0];
  const mapping = moveName ? cubingMoveToFrame[moveName] : null;
  if (!mapping) return null;
  if (token.endsWith('2')) return { moveName, angle: 180 };
  if (token.endsWith("'")) return { moveName, angle: (-mapping.angle) as TwistAngle };
  return { moveName, angle: mapping.angle };
};

const solverMoveFromCubingToken = (token: string, puzzle: PuzzleState): SolverMove | null => {
  const parsed = parseCubingToken(token);
  if (!parsed) return null;
  const frame = findFrameForCubingMove(puzzle, parsed.moveName);
  if (!frame) return null;
  const notation = createMove(frame.id, parsed.angle, puzzle.frameById).notation;
  return {
    targetKind: 'frame',
    targetId: `frame:${frame.id}`,
    frameId: frame.id,
    angle: parsed.angle,
    notation,
    reason: `Cubing frame solver selected ${token}; mapped to local frame ${notation}.`,
  };
};

const applyCubingTokenToCubies = (cubies: Cubie[], token: string, puzzle: PuzzleState): Cubie[] => {
  const move = solverMoveFromCubingToken(token, puzzle);
  if (!move?.frameId) return cubies;
  return applyTwistToCubies(cubies, move.frameId, move.angle, puzzle.frameById);
};

const algTokens = (alg: string): string[] =>
  alg.trim().length === 0 ? [] : alg.trim().split(/\s+/).filter(Boolean);

const deterministicCalibrationAlgs = (): string[] => {
  const moves = cubingMoveNames.flatMap((move) => [move, `${move}'`, `${move}2`]);
  const algs = ['', ...moves];
  let seed = 0x51f15e;
  for (let index = 0; index < 2600; index += 1) {
    const length = 1 + (index % 13);
    const tokens: string[] = [];
    let lastMove = '';
    for (let turn = 0; turn < length; turn += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      let token = moves[seed % moves.length]!;
      if (token[0] === lastMove) {
        token = moves[(seed + 7) % moves.length]!;
      }
      tokens.push(token);
      lastMove = token[0]!;
    }
    algs.push(tokens.join(' '));
  }
  return algs;
};

const addCalibrationEntry = (
  cubie: Cubie,
  patternData: KPatternData,
  calibration: CubingCalibration,
) => {
  const slot = slotIndexForCubie(cubie);
  const piece = pieceIndexForCubie(cubie);
  if (slot === null || piece === null) return;
  if (cubie.type === 'corner') {
    const orientation = patternData.CORNERS.orientation[slot];
    calibration.cornerOrientationByKey.set(
      orientationLookupKey(slot, piece, orientationKey(cubie.orientation)),
      orientation,
    );
    return;
  }
  if (cubie.type === 'edge') {
    const orientation = patternData.EDGES.orientation[slot];
    calibration.edgeOrientationByKey.set(
      orientationLookupKey(slot, piece, orientationKey(cubie.orientation)),
      orientation,
    );
  }
};

const ensureCubingCalibration = async (puzzle: PuzzleState): Promise<CubingCalibration> => {
  if (calibrationPromise) return calibrationPromise;

  calibrationPromise = (async () => {
    const kpuzzle = await cube3x3x3.kpuzzle();
    const calibration: CubingCalibration = {
      kpuzzle,
      cornerOrientationByKey: new Map(),
      edgeOrientationByKey: new Map(),
    };
    const solvedCubies = generateMenger(1);

    for (const alg of deterministicCalibrationAlgs()) {
      let cubies = cloneCubies(solvedCubies);
      for (const token of algTokens(alg)) {
        cubies = applyCubingTokenToCubies(cubies, token, puzzle);
      }
      const pattern = kpuzzle.defaultPattern().applyAlg(alg);
      for (const cubie of cubies) {
        addCalibrationEntry(cubie, pattern.patternData, calibration);
      }
      if (calibration.cornerOrientationByKey.size >= 192 && calibration.edgeOrientationByKey.size >= 288) {
        break;
      }
    }

    return calibration;
  })();

  return calibrationPromise;
};

const edgeOrientationCandidates = (cubie: Cubie): string[] => {
  const axis = cubieNaturalAxis(cubie.currentPosition);
  return [0, 90, -90, 180]
    .map((angle) => orientationKey(rotateQuaternion(cubie.orientation, axis, angle)));
};

const cubiesToKPattern = async (cubies: Cubie[], puzzle: PuzzleState): Promise<KPattern> => {
  const calibration = await ensureCubingCalibration(puzzle);
  const patternData: KPatternData = {
    EDGES: {
      pieces: new Array(12).fill(0),
      orientation: new Array(12).fill(0),
    },
    CORNERS: {
      pieces: new Array(8).fill(0),
      orientation: new Array(8).fill(0),
    },
    CENTERS: {
      pieces: [0, 1, 2, 3, 4, 5],
      orientation: [0, 0, 0, 0, 0, 0],
      orientationMod: [1, 1, 1, 1, 1, 1],
    },
  };

  for (const cubie of cubies) {
    const slot = slotIndexForCubie(cubie);
    const piece = pieceIndexForCubie(cubie);
    if (slot === null || piece === null) continue;

    if (cubie.type === 'corner') {
      const lookupKey = orientationLookupKey(slot, piece, orientationKey(cubie.orientation));
      const orientation = calibration.cornerOrientationByKey.get(lookupKey);
      if (orientation === undefined) {
        throw new Error(`Cannot map corner orientation for ${cubie.id}.`);
      }
      patternData.CORNERS.pieces[slot] = piece;
      patternData.CORNERS.orientation[slot] = orientation;
      continue;
    }

    if (cubie.type === 'edge') {
      const orientation = edgeOrientationCandidates(cubie)
        .map((candidate) => calibration.edgeOrientationByKey.get(orientationLookupKey(slot, piece, candidate)))
        .find((candidate): candidate is number => candidate !== undefined);
      if (orientation === undefined) {
        throw new Error(`Cannot map edge orientation for ${cubie.id}.`);
      }
      patternData.EDGES.pieces[slot] = piece;
      patternData.EDGES.orientation[slot] = orientation;
    }
  }

  return new KPattern(calibration.kpuzzle, patternData);
};

const solveFramePhaseWithCubing = async (
  inputCubies: Cubie[],
  puzzle: PuzzleState,
  explanation: SolverExplanationStep[],
): Promise<{ cubies: Cubie[]; moves: SolverMove[]; success: boolean; notes: string; expanded: number }> => {
  if (isFrameSolved(inputCubies)) {
    explanation.push({
      phase: 'frame quotient',
      objective: 'Place all cubies and solve corners while ignoring independent edge extension roll.',
      observation: 'The current state is already solved in the frame quotient.',
      progress: progressForCubies(inputCubies),
    });
    return { cubies: cloneCubies(inputCubies), moves: [], success: true, notes: 'Frame quotient already solved.', expanded: 0 };
  }

  const basePattern = await cubiesToKPattern(inputCubies, puzzle);
  
  let finalAlg = '';
  let usedM = false;
  let solved = false;

  const variants = [
    { m: false, flip: false },
    { m: true, flip: false },
    { m: false, flip: true },
    { m: true, flip: true },
  ];

  for (const variant of variants) {
    let pData = JSON.parse(JSON.stringify(basePattern.patternData));
    
    if (variant.m) {
      const pTemp = new KPattern(basePattern.kpuzzle, pData).applyAlg('M');
      pData = JSON.parse(JSON.stringify(pTemp.patternData));
      pData.CENTERS.pieces = [0, 1, 2, 3, 4, 5];
      pData.CENTERS.orientation = [0, 0, 0, 0, 0, 0];
    }
    
    if (variant.flip) {
      pData.EDGES.orientation[0] = 1 - pData.EDGES.orientation[0];
    }

    const pTest = new KPattern(basePattern.kpuzzle, pData);

    try {
      const alg = await experimentalSolve3x3x3IgnoringCenters(pTest);
      finalAlg = alg.toString();
      usedM = variant.m;
      solved = true;
      break;
    } catch {
      // Continue to next variant
    }
  }

  if (!solved) {
     throw new Error('All parity variants failed to solve.');
  }

  const tokens = algTokens(finalAlg);
  if (usedM) {
    tokens.unshift('M');
  }
  const moves: SolverMove[] = [];
  let cubies = cloneCubies(inputCubies);

  for (const token of tokens) {
    const move = solverMoveFromCubingToken(token, puzzle);
    if (!move?.frameId) {
      throw new Error(`Cannot map cubing move ${token} to a local frame target.`);
    }
    moves.push(move);
    cubies = applyTwistToCubies(cubies, move.frameId, move.angle, puzzle.frameById);
  }

  if (!isFrameSolved(cubies)) {
    throw new Error('Cubing frame solution did not solve the local frame quotient.');
  }

  explanation.push({
    phase: 'frame quotient',
    objective: 'Solve positions and corner orientations using a state-derived 3x3x3 frame model.',
    observation: `Mapped current cubies into a Reid-order KPattern and selected ${moves.length} frame move(s).`,
    selectedMove: moves[0]?.notation,
    reason: 'The sequence is derived from the current cubie permutation/orientation, with centers ignored to match the Menger Level 1 frame model.',
    progress: progressForCubies(cubies),
  });

  return {
    cubies,
    moves,
    success: true,
    notes: 'Frame quotient solved with cubing KPattern search.',
    expanded: 0,
  };
};

class MinHeap<T> {
  private readonly items: T[] = [];

  constructor(private readonly less: (a: T, b: T) => boolean) {}

  get size(): number {
    return this.items.length;
  }

  push(item: T) {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    const first = this.items[0];
    const last = this.items.pop();
    if (!first || !last) return first;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return first;
  }

  private bubbleUp(index: number) {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (!this.less(this.items[current]!, this.items[parent]!)) return;
      [this.items[parent], this.items[current]] = [this.items[current]!, this.items[parent]!];
      current = parent;
    }
  }

  private bubbleDown(index: number) {
    let current = index;
    while (true) {
      const left = current * 2 + 1;
      const right = left + 1;
      let best = current;
      if (left < this.items.length && this.less(this.items[left]!, this.items[best]!)) best = left;
      if (right < this.items.length && this.less(this.items[right]!, this.items[best]!)) best = right;
      if (best === current) return;
      [this.items[current], this.items[best]] = [this.items[best]!, this.items[current]!];
      current = best;
    }
  }
}

const cloneCubies = (cubies: Cubie[]): Cubie[] =>
  cubies.map((cubie) => ({ ...cubie, orientation: cubie.orientation.clone() }));

const frameHeuristic = (cubies: Cubie[]): number => {
  const progress = progressForCubies(cubies);
  const misplaced = progress.totalCubies - progress.positionSolved;
  const cornerWrong = progress.totalCorners - progress.cornerOrientationSolved;
  const edgeFrameWrong = progress.totalEdges - progress.edgeFrameSolved;

  return Math.max(
    Math.ceil(misplaced / 8),
    Math.ceil(cornerWrong / 4),
    Math.ceil(edgeFrameWrong / 8),
  );
};

const nodePriority = (depth: number, heuristic: number, cubies: Cubie[]): number => {
  const progress = progressForCubies(cubies);
  const exactUnsolved = progress.totalCubies - progress.solvedCubies;
  const positionUnsolved = progress.totalCubies - progress.positionSolved;
  return depth + heuristic * 1.7 + exactUnsolved * 0.025 + positionUnsolved * 0.04;
};

const buildFrameMoves = (puzzle: PuzzleState): CandidateFrameMove[] =>
  puzzle.frames
    .filter((frame) => frame.scale === 1)
    .sort((a, b) => a.axisName.localeCompare(b.axisName) || a.layer - b.layer)
    .flatMap((frame) =>
      frameAngles.map((angle) => ({
        frame,
        angle,
        notation: createMove(frame.id, angle, puzzle.frameById).notation,
      })),
    );

const shouldSkipFrameMove = (node: QueueNode, move: CandidateFrameMove): boolean => {
  if (node.lastFrameId === move.frame.id) return true;
  if (node.lastAxisName !== move.frame.axisName) return false;
  if (!node.lastFrameId) return false;
  return move.frame.id.localeCompare(node.lastFrameId) <= 0;
};

const solveFramePhase = (
  inputCubies: Cubie[],
  puzzle: PuzzleState,
  explanation: SolverExplanationStep[],
): { cubies: Cubie[]; moves: SolverMove[]; success: boolean; notes: string; expanded: number } => {
  if (isFrameSolved(inputCubies)) {
    explanation.push({
      phase: 'frame quotient',
      objective: 'Place all cubies and solve corners while ignoring independent edge extension roll.',
      observation: 'The current state is already solved in the frame quotient.',
      progress: progressForCubies(inputCubies),
    });
    return { cubies: cloneCubies(inputCubies), moves: [], success: true, notes: 'Frame quotient already solved.', expanded: 0 };
  }

  const start = performance.now();
  const frameMoves = buildFrameMoves(puzzle);
  const startCubies = cloneCubies(inputCubies);
  const startHeuristic = frameHeuristic(startCubies);
  const startKey = stateKey(startCubies, true);
  const frontier = new MinHeap<QueueNode>((a, b) =>
    a.priority === b.priority
      ? a.key.localeCompare(b.key) < 0
      : a.priority < b.priority,
  );
  const visited = new Map<string, number>([[startKey, 0]]);
  let expanded = 0;

  frontier.push({
    cubies: startCubies,
    moves: [],
    key: startKey,
    depth: 0,
    heuristic: startHeuristic,
    priority: nodePriority(0, startHeuristic, startCubies),
    lastFrameId: null,
    lastAxisName: null,
  });

  while (frontier.size > 0 && expanded < frameSearchNodeBudget) {
    if (performance.now() - start > frameSearchRuntimeBudgetMs) {
      return {
        cubies: inputCubies,
        moves: [],
        success: false,
        notes: `Frame search timed out after ${expanded.toLocaleString()} expanded states.`,
        expanded,
      };
    }

    const node = frontier.pop()!;
    expanded += 1;

    if (isFrameSolved(node.cubies)) {
      explanation.push({
        phase: 'frame quotient',
        objective: 'Find legal frame moves that solve positions and corner orientations.',
        observation: `Solved the frame quotient after expanding ${expanded.toLocaleString()} states.`,
        selectedMove: node.moves[0]?.notation,
        reason: 'The selected sequence minimizes the deterministic search priority among explored candidates.',
        progress: progressForCubies(node.cubies),
      });
      return { cubies: node.cubies, moves: node.moves, success: true, notes: 'Frame quotient solved.', expanded };
    }

    if (node.depth >= frameSearchMaxDepth) continue;

    for (const candidate of frameMoves) {
      if (shouldSkipFrameMove(node, candidate)) continue;

      const childCubies = applyTwistToCubies(node.cubies, candidate.frame.id, candidate.angle, puzzle.frameById);
      const childKey = stateKey(childCubies, true);
      const childDepth = node.depth + 1;
      const priorDepth = visited.get(childKey);
      if (priorDepth !== undefined && priorDepth <= childDepth) continue;

      const heuristic = frameHeuristic(childCubies);
      visited.set(childKey, childDepth);
      frontier.push({
        cubies: childCubies,
        moves: [
          ...node.moves,
          {
            targetKind: 'frame',
            targetId: `frame:${candidate.frame.id}`,
            frameId: candidate.frame.id,
            angle: candidate.angle,
            notation: candidate.notation,
            reason: `Frame search selected ${candidate.notation} to reduce the frame-quotient distance.`,
          },
        ],
        key: childKey,
        depth: childDepth,
        heuristic,
        priority: nodePriority(childDepth, heuristic, childCubies),
        lastFrameId: candidate.frame.id,
        lastAxisName: candidate.frame.axisName,
      });
    }
  }

  return {
    cubies: inputCubies,
    moves: [],
    success: false,
    notes: `Frame search exhausted ${expanded.toLocaleString()} states without solving within depth ${frameSearchMaxDepth}.`,
    expanded,
  };
};

const solveExtensionPhase = (
  inputCubies: Cubie[],
  puzzle: PuzzleState,
  explanation: SolverExplanationStep[],
): { cubies: Cubie[]; moves: SolverMove[]; success: boolean; notes: string } => {
  let cubies = cloneCubies(inputCubies);
  const moves: SolverMove[] = [];
  const extensionTargets = puzzle.turnTargets.filter((target) => target.kind === 'extension');

  for (const cubie of [...cubies].sort((a, b) => a.id.localeCompare(b.id))) {
    if (cubie.type !== 'edge') continue;
    const liveCubie = cubies.find((candidate) => candidate.id === cubie.id);
    if (!liveCubie) continue;
    if (!samePosition(liveCubie.currentPosition, liveCubie.homePosition)) {
      return {
        cubies,
        moves,
        success: false,
        notes: `Cannot normalize ${liveCubie.id}; it is not at its home position.`,
      };
    }
    if (isOrientationSolved(liveCubie)) continue;

    const target = extensionTargets.find((candidate) => candidate.selector(liveCubie.currentPosition));
    if (!target) {
      return {
        cubies,
        moves,
        success: false,
        notes: `No extension target found for ${liveCubie.id}.`,
      };
    }

    let solvedAngle: TwistAngle | null = null;
    for (const angle of extensionAngles) {
      const candidateCubies = applyExtensionRotation(cubies, target.id, angle, puzzle.turnTargetById);
      const candidateCubie = candidateCubies.find((candidate) => candidate.id === liveCubie.id);
      if (candidateCubie && isOrientationSolved(candidateCubie)) {
        solvedAngle = angle;
        cubies = candidateCubies;
        break;
      }
    }

    if (!solvedAngle) {
      return {
        cubies,
        moves,
        success: false,
        notes: `No legal extension roll solved ${liveCubie.id}.`,
      };
    }

    const notation = createExtensionMove(target, solvedAngle).notation;
    moves.push({
      targetKind: 'extension',
      targetId: target.id,
      extensionTargetId: target.id,
      angle: solvedAngle,
      notation,
      reason: `${liveCubie.id} is home but rolled; ${notation} restores its orientation without moving other cubies.`,
    });
  }

  explanation.push({
    phase: 'extension normalization',
    objective: 'Inspect each home edge cubie and remove remaining extension roll.',
    observation: moves.length === 0
      ? 'No edge extension roll remained after the frame phase.'
      : `Selected ${moves.length} independent extension move(s).`,
    selectedMove: moves[0]?.notation,
    reason: 'Each extension move affects exactly one Level 1 edge target and leaves solved positions fixed.',
    progress: progressForCubies(cubies),
  });

  return {
    cubies,
    moves,
    success: isExactlySolved(cubies),
    notes: isExactlySolved(cubies) ? 'All extension rolls normalized.' : 'Extension normalization ended with unsolved orientation.',
  };
};

export const solveLevel1 = async (puzzle: PuzzleState): Promise<SolverRunResult> => {
  const start = performance.now();
  const inputProgress = progressForCubies(puzzle.cubies);
  const explanation: SolverExplanationStep[] = [{
    phase: 'state inspection',
    objective: 'Build a solve plan from the current Level 1 cubie state without reading move history.',
    observation: progressSummary(inputProgress),
    progress: inputProgress,
  }];

  if (puzzle.level !== 1) {
    return {
      name: solverName,
      version: solverVersion,
      level_supported: [1],
      input_state: {
        level: puzzle.level,
        cubieCount: puzzle.cubies.length,
        stateKey: stateKey(puzzle.cubies, false),
        progress: inputProgress,
      },
      output_moves: [],
      runtime_ms: performance.now() - start,
      move_count: 0,
      success: false,
      explanation,
      final_strategy: 'Level 1 only.',
      complexity_estimate: primaryComplexityEstimate,
      notes: 'This solver currently supports Level 1 only.',
    };
  }

  let frameResult: { cubies: Cubie[]; moves: SolverMove[]; success: boolean; notes: string; expanded: number };
  try {
    frameResult = await solveFramePhaseWithCubing(puzzle.cubies, puzzle, explanation);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown cubing frame solver error.';
    explanation.push({
      phase: 'frame quotient',
      objective: 'Use the browser-native cubing solver after mapping local cubies into a KPattern.',
      observation: `Cubing-backed frame solve failed: ${message}`,
      reason: 'Falling back to the in-house bounded deterministic frame search.',
      progress: progressForCubies(puzzle.cubies),
    });
    frameResult = solveFramePhase(puzzle.cubies, puzzle, explanation);
  }
  if (!frameResult.success) {
    return {
      name: solverName,
      version: solverVersion,
      level_supported: [1],
      input_state: {
        level: puzzle.level,
        cubieCount: puzzle.cubies.length,
        stateKey: stateKey(puzzle.cubies, false),
        progress: inputProgress,
      },
      output_moves: [],
      runtime_ms: performance.now() - start,
      move_count: 0,
      success: false,
      explanation: [
        ...explanation,
        {
          phase: 'frame quotient',
          objective: 'Solve positions and corner orientations using legal frame moves.',
          observation: frameResult.notes,
          progress: progressForCubies(puzzle.cubies),
        },
      ],
      final_strategy: 'Frame quotient search failed within the deterministic baseline budget.',
      complexity_estimate: `Expanded ${frameResult.expanded.toLocaleString()} / ${frameSearchNodeBudget.toLocaleString()} budgeted states`,
      notes: frameResult.notes,
    };
  }

  const extensionResult = solveExtensionPhase(frameResult.cubies, puzzle, explanation);
  const outputMoves = [...frameResult.moves, ...extensionResult.moves];
  const runtime = performance.now() - start;
  const finalProgress = progressForCubies(extensionResult.cubies);

  explanation.push({
    phase: 'final verification',
    objective: 'Confirm every cubie is home and exactly oriented.',
    observation: progressSummary(finalProgress),
    progress: finalProgress,
  });

  return {
    name: solverName,
    version: solverVersion,
    level_supported: [1],
    input_state: {
      level: puzzle.level,
      cubieCount: puzzle.cubies.length,
      stateKey: stateKey(puzzle.cubies, false),
      progress: inputProgress,
    },
    output_moves: outputMoves,
    runtime_ms: runtime,
    move_count: outputMoves.length,
    success: extensionResult.success,
    explanation,
    final_strategy: 'Solve the frame quotient first, then independently normalize Level 1 edge extension rolls.',
    complexity_estimate: primaryComplexityEstimate,
    notes: extensionResult.success
      ? frameResult.notes
      : extensionResult.notes,
  };
};

export const warmLevel1Solver = (puzzle: PuzzleState) => {
  if (puzzle.level !== 1) return;
  void ensureCubingCalibration(puzzle);
};

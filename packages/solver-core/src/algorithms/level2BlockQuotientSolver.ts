import { Quaternion as ThreeQuaternion, Vector3 } from 'three';
import type { Vector3Tuple } from 'three';
import type { Cubie, MengerPuzzleState, TurnTarget, TwistAngle } from '@menger/engine';
import {
  applyExtensionRotation,
  applyTwistToCubies,
  cloneCubies,
  createExtensionMove,
  createMengerPuzzleState,
  createMove,
} from '@menger/engine';
import type { SolverAlgorithm, SolverExplanationStep, SolverMove, SolverRunResult } from '../algorithm/types';
import type { PuzzleModel } from '../model/puzzleModel';
import {
  isExactlySolved,
  isOrientationSolved,
  progressForCubies,
  progressSummary,
  samePosition,
  stateKey,
  vectorKey,
} from './level1State';
import { level1QuotientAlgorithm, warmLevel1Solver } from './level1QuotientSolver';

const solverId = 'level2-block-quotient';
const solverName = 'level-2-block-quotient-reducer';
const solverVersion = '0.1.0';
const extensionAngles: TwistAngle[] = [90, -90, 180];
const primaryComplexityEstimate =
  'O(400) block-rigidity analysis, one Level 1 quotient solve over the 20-block macro state, then O(240 * 3) cell-roll normalization';

// --- 24 orientation-preserving cube rotations, as exact integer matrices ---

interface BlockRotation {
  matrix: readonly number[]; // row-major 3x3
  quaternion: ThreeQuaternion;
}

const identityMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;

const rotationGenerators: ReadonlyArray<{ axis: Vector3Tuple; matrix: readonly number[] }> = [
  { axis: [1, 0, 0], matrix: [1, 0, 0, 0, 0, -1, 0, 1, 0] },
  { axis: [0, 1, 0], matrix: [0, 0, 1, 0, 1, 0, -1, 0, 0] },
  { axis: [0, 0, 1], matrix: [0, -1, 0, 1, 0, 0, 0, 0, 1] },
];

const multiplyMatrices = (a: readonly number[], b: readonly number[]): number[] => {
  const result = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      for (let inner = 0; inner < 3; inner += 1) {
        result[row * 3 + col]! += a[row * 3 + inner]! * b[inner * 3 + col]!;
      }
    }
  }
  return result;
};

const applyMatrixToVector = (m: readonly number[], v: Vector3Tuple): Vector3Tuple => [
  m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2],
  m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2],
  m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2],
];

const matrixKey = (m: readonly number[]): string => m.join(',');

const quarterTurnQuaternion = (axis: Vector3Tuple): ThreeQuaternion =>
  new ThreeQuaternion().setFromAxisAngle(new Vector3(axis[0], axis[1], axis[2]), Math.PI / 2);

const allBlockRotations: readonly BlockRotation[] = (() => {
  const identity: BlockRotation = { matrix: identityMatrix, quaternion: new ThreeQuaternion() };
  const found = new Map<string, BlockRotation>([[matrixKey(identityMatrix), identity]]);
  const queue: BlockRotation[] = [identity];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const generator of rotationGenerators) {
      const matrix = multiplyMatrices(generator.matrix, current.matrix);
      const key = matrixKey(matrix);
      if (found.has(key)) continue;
      const rotation: BlockRotation = {
        matrix,
        quaternion: current.quaternion.clone().premultiply(quarterTurnQuaternion(generator.axis)),
      };
      found.set(key, rotation);
      queue.push(rotation);
    }
  }

  return [...found.values()];
})();

// --- Block-region geometry (Level 2: 9x9x9 grid, 20 blocks of 20 cells) ---

const gridExtent = 4;

const blockCoordOf = (value: number): number => Math.floor((value + gridExtent) / 3) - 1;

const blockOf = (position: Vector3Tuple): Vector3Tuple => [
  blockCoordOf(position[0]),
  blockCoordOf(position[1]),
  blockCoordOf(position[2]),
];

const isMengerBlock = (block: Vector3Tuple): boolean =>
  block.filter((component) => component === 0).length <= 1;

const offsetWithinBlock = (position: Vector3Tuple, block: Vector3Tuple): Vector3Tuple => [
  position[0] - 3 * block[0],
  position[1] - 3 * block[1],
  position[2] - 3 * block[2],
];

// --- Phase 1: project the 400-cell state onto a Level 1 macro puzzle ---

type MacroAnalysis =
  | { ok: true; macroCubies: Cubie[] }
  | { ok: false; reason: string };

/**
 * A Level 2 state is "block-rigid" when every 3x3x3 block region holds
 * exactly the 20 cells of one home block, moved as a rigid body (a single
 * rotation maps every home offset onto the matching current offset). Cell
 * orientations are deliberately ignored here: independent cell rolls do not
 * move cells, so they cannot break rigidity — they are normalized in the
 * final phase instead.
 */
const analyzeMacroState = (cubies: Cubie[]): MacroAnalysis => {
  const regions = new Map<string, Cubie[]>();

  for (const cubie of cubies) {
    const region = blockOf(cubie.currentPosition);
    if (!isMengerBlock(region)) {
      return {
        ok: false,
        reason: `Cell ${cubie.id} sits at (${vectorKey(cubie.currentPosition)}), outside every Menger block region.`,
      };
    }
    const key = vectorKey(region);
    const members = regions.get(key);
    if (members) members.push(cubie);
    else regions.set(key, [cubie]);
  }

  if (regions.size !== 20) {
    return { ok: false, reason: `Expected 20 occupied block regions, found ${regions.size}.` };
  }

  const macroCubies: Cubie[] = [];
  const usedHomeBlocks = new Set<string>();

  for (const [regionKey, members] of [...regions.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const homeBlockKeys = new Set(members.map((cubie) => vectorKey(blockOf(cubie.homePosition))));
    if (homeBlockKeys.size !== 1) {
      return {
        ok: false,
        reason:
          `Block region (${regionKey}) holds cells from ${homeBlockKeys.size} different home blocks — ` +
          'single-layer moves have torn block boundaries, which this solver version does not repair.',
      };
    }
    if (members.length !== 20) {
      return { ok: false, reason: `Block region (${regionKey}) holds ${members.length} cells instead of 20.` };
    }

    const homeBlock = blockOf(members[0]!.homePosition);
    const homeBlockKey = vectorKey(homeBlock);
    if (usedHomeBlocks.has(homeBlockKey)) {
      return { ok: false, reason: `Home block (${homeBlockKey}) occupies more than one region.` };
    }
    usedHomeBlocks.add(homeBlockKey);

    const region = blockOf(members[0]!.currentPosition);
    const rotation = allBlockRotations.find((candidate) =>
      members.every((cubie) =>
        samePosition(
          applyMatrixToVector(candidate.matrix, offsetWithinBlock(cubie.homePosition, homeBlock)),
          offsetWithinBlock(cubie.currentPosition, region),
        ),
      ),
    );
    if (!rotation) {
      return {
        ok: false,
        reason:
          `Block region (${regionKey}) is not a rigid copy of home block (${homeBlockKey}) — ` +
          'slab twists or partial-layer moves left it internally scrambled, which this solver version does not repair.',
      };
    }

    macroCubies.push({
      id: `L1_${homeBlock[0]}_${homeBlock[1]}_${homeBlock[2]}`,
      homePosition: [...homeBlock] as Vector3Tuple,
      currentPosition: [...region] as Vector3Tuple,
      orientation: rotation.quaternion.clone(),
      type: homeBlock.filter((component) => component === 0).length === 1 ? 'edge' : 'corner',
    });
  }

  return { ok: true, macroCubies };
};

// --- Phase 2: lift macro Level 1 moves back to Level 2 targets ---

const translateMacroMove = (
  macroMove: SolverMove,
  macroPuzzle: MengerPuzzleState,
  puzzle: MengerPuzzleState,
): SolverMove | null => {
  if (macroMove.targetKind === 'frame' && macroMove.frameId) {
    const macroFrame = macroPuzzle.frameById.get(macroMove.frameId);
    if (!macroFrame) return null;
    // Macro layer ℓ ∈ {-1,0,1} lifts to the scale-3 block layer centered at 3ℓ.
    const frame = puzzle.frames.find(
      (candidate) =>
        candidate.scale === 3 &&
        candidate.axisName === macroFrame.axisName &&
        candidate.layer === macroFrame.layer * 3,
    );
    if (!frame) return null;
    const notation = createMove(frame.id, macroMove.angle, puzzle.frameById).notation;
    return {
      targetKind: 'frame',
      targetId: `frame:${frame.id}`,
      frameId: frame.id,
      angle: macroMove.angle,
      notation,
      reason: `Macro move ${macroMove.notation} lifted to the scale-3 block layer as ${notation}.`,
    };
  }

  if (macroMove.targetKind === 'extension' && macroMove.extensionTargetId) {
    // Depth-1 extension target ids share the same scheme at every level
    // (`extension:d1:proot:s<slot>`), so the macro edge target id addresses
    // the whole-block extension target directly.
    const target = puzzle.turnTargetById.get(macroMove.extensionTargetId);
    if (!target || target.kind !== 'extension') return null;
    const notation = createExtensionMove(target, macroMove.angle).notation;
    return {
      targetKind: 'extension',
      targetId: target.id,
      extensionTargetId: target.id,
      angle: macroMove.angle,
      notation,
      reason: `Macro edge-roll fix ${macroMove.notation} lifted to the whole-block extension ${notation}.`,
    };
  }

  return null;
};

const applySolverMoveToCubies = (cubies: Cubie[], move: SolverMove, puzzle: MengerPuzzleState): Cubie[] => {
  if (move.targetKind === 'frame' && move.frameId) {
    return applyTwistToCubies(cubies, move.frameId, move.angle, puzzle.frameById);
  }
  if (move.targetKind === 'extension' && move.extensionTargetId) {
    return applyExtensionRotation(cubies, move.extensionTargetId, move.angle, puzzle.turnTargetById);
  }
  return cubies;
};

// --- Phase 3: normalize residual per-cell rolls with depth-2 targets ---

const solveCellRollPhase = (
  inputCubies: Cubie[],
  puzzle: MengerPuzzleState,
  explanation: SolverExplanationStep[],
): { cubies: Cubie[]; moves: SolverMove[]; success: boolean; notes: string } => {
  let cubies = cloneCubies(inputCubies);
  const moves: SolverMove[] = [];
  const cellTargets = puzzle.turnTargets.filter(
    (target) => target.kind === 'extension' && target.depth === 2 && target.scale === 1,
  );

  for (const cubie of [...cubies].sort((a, b) => a.id.localeCompare(b.id))) {
    const liveCubie = cubies.find((candidate) => candidate.id === cubie.id);
    if (!liveCubie) continue;
    if (!samePosition(liveCubie.currentPosition, liveCubie.homePosition)) {
      return { cubies, moves, success: false, notes: `Cannot normalize ${liveCubie.id}; it is not at its home position.` };
    }
    if (isOrientationSolved(liveCubie)) continue;

    const target = cellTargets.find((candidate) => candidate.selector(liveCubie.currentPosition));
    if (!target) {
      return {
        cubies,
        moves,
        success: false,
        notes:
          `${liveCubie.id} is home but twisted, and no single-cell extension target exists at ` +
          `(${vectorKey(liveCubie.currentPosition)}) — block-corner cells cannot roll independently, ` +
          'so this residue is outside the supported state class.',
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
        notes: `No legal roll around the cell axis of ${liveCubie.id} restores its orientation — the residue is not a pure roll.`,
      };
    }

    const notation = createExtensionMove(target, solvedAngle).notation;
    moves.push({
      targetKind: 'extension',
      targetId: target.id,
      extensionTargetId: target.id,
      angle: solvedAngle,
      notation,
      reason: `${liveCubie.id} is home but rolled; ${notation} restores its orientation without moving any cell.`,
    });
  }

  explanation.push({
    phase: 'cell extension normalization',
    objective: 'Inspect every home cell and remove remaining single-cell extension roll.',
    observation:
      moves.length === 0
        ? 'No cell roll remained after the macro phase.'
        : `Selected ${moves.length} independent single-cell extension move(s).`,
    selectedMove: moves[0]?.notation,
    reason: 'Each depth-2 extension move rotates exactly one cell in place and leaves every position fixed.',
    progress: progressForCubies(cubies),
  });

  return {
    cubies,
    moves,
    success: isExactlySolved(cubies),
    notes: isExactlySolved(cubies)
      ? 'All cell rolls normalized.'
      : 'Cell normalization ended with unsolved orientation.',
  };
};

// --- Main solve ---

const solve = async (
  model: PuzzleModel<MengerPuzzleState, SolverMove>,
  puzzle: MengerPuzzleState,
): Promise<SolverRunResult> => {
  const start = performance.now();
  const inputProgress = progressForCubies(puzzle.cubies);
  const inputState = {
    level: puzzle.level,
    cubieCount: puzzle.cubies.length,
    stateKey: stateKey(puzzle.cubies, false),
    progress: inputProgress,
  };
  const explanation: SolverExplanationStep[] = [{
    phase: 'state inspection',
    objective: 'Build a solve plan from the current Level 2 cell state without reading move history.',
    observation: progressSummary(inputProgress),
    progress: inputProgress,
  }];

  const failure = (finalStrategy: string, notes: string): SolverRunResult => ({
    name: solverName,
    version: solverVersion,
    level_supported: [2],
    input_state: inputState,
    output_moves: [],
    runtime_ms: performance.now() - start,
    move_count: 0,
    success: false,
    explanation,
    final_strategy: finalStrategy,
    complexity_estimate: primaryComplexityEstimate,
    notes,
  });

  if (puzzle.level !== 2) {
    return failure('Level 2 only.', 'This solver currently supports Level 2 only.');
  }

  const analysis = analyzeMacroState(puzzle.cubies);
  if (!analysis.ok) {
    explanation.push({
      phase: 'block rigidity analysis',
      objective: 'Verify every 3x3x3 block region is a rigid copy of exactly one home block.',
      observation: analysis.reason,
      progress: inputProgress,
    });
    return failure('The state is outside the block-rigid class this solver version handles.', analysis.reason);
  }
  explanation.push({
    phase: 'block rigidity analysis',
    objective: 'Verify every 3x3x3 block region is a rigid copy of exactly one home block.',
    observation:
      'All 20 block regions are rigid copies of distinct home blocks; the state projects exactly onto a Level 1 macro puzzle.',
    reason:
      'Menger self-similarity: the 20 blocks occupy the same corner/edge layout as the 20 Level 1 cubies, so the block arrangement is itself a Level 1 state.',
    progress: inputProgress,
  });

  const macroPuzzle = createMengerPuzzleState(1);
  const macroState: MengerPuzzleState = { ...macroPuzzle, cubies: analysis.macroCubies };
  const macroResult = await level1QuotientAlgorithm.solve(model, macroState);

  for (const step of macroResult.explanation) {
    if (step.phase === 'state inspection') continue;
    explanation.push({ ...step, phase: `macro ${step.phase}` });
  }
  if (!macroResult.success) {
    return failure('Macro Level 1 solve failed.', `Macro Level 1 solve failed: ${macroResult.notes}`);
  }

  let cubies = cloneCubies(puzzle.cubies);
  const macroMoves: SolverMove[] = [];
  for (const macroMove of macroResult.output_moves) {
    const translated = translateMacroMove(macroMove, macroState, puzzle);
    if (!translated) {
      return failure(
        'Macro move translation failed.',
        `Cannot lift macro move ${macroMove.notation} to a Level 2 turn target.`,
      );
    }
    macroMoves.push(translated);
    cubies = applySolverMoveToCubies(cubies, translated, puzzle);
  }

  if (!cubies.every((cubie) => samePosition(cubie.currentPosition, cubie.homePosition))) {
    return failure(
      'Macro solution verification failed.',
      'Lifted macro moves did not bring every cell to its home position.',
    );
  }
  explanation.push({
    phase: 'macro verification',
    objective: 'Replay the lifted block moves on the real 400-cell state.',
    observation: `All ${cubies.length} cells are at their home positions after ${macroMoves.length} lifted move(s).`,
    progress: progressForCubies(cubies),
  });

  const cellResult = solveCellRollPhase(cubies, puzzle, explanation);
  const outputMoves = [...macroMoves, ...cellResult.moves];
  const finalProgress = progressForCubies(cellResult.cubies);

  explanation.push({
    phase: 'final verification',
    objective: 'Confirm every cell is home and exactly oriented.',
    observation: progressSummary(finalProgress),
    progress: finalProgress,
  });

  return {
    name: solverName,
    version: solverVersion,
    level_supported: [2],
    input_state: inputState,
    output_moves: cellResult.success ? outputMoves : [],
    runtime_ms: performance.now() - start,
    move_count: cellResult.success ? outputMoves.length : 0,
    success: cellResult.success,
    explanation,
    final_strategy:
      'Project the 20 rigid blocks onto a Level 1 macro state, solve it with the Level 1 quotient solver, lift the ' +
      'solution to scale-3 block layers and whole-block extensions, then independently normalize residual cell rolls.',
    complexity_estimate: primaryComplexityEstimate,
    notes: cellResult.success ? 'Level 2 solved through the block quotient.' : cellResult.notes,
  };
};

// --- Scramble generator set (see SolverAlgorithm.scrambleMovePool) ---

const repeatPool = <T>(pool: T[], times: number): T[] =>
  Array.from({ length: times }).flatMap(() => pool);

const extensionMovesFor = (
  state: MengerPuzzleState,
  predicate: (target: TurnTarget) => boolean,
): SolverMove[] =>
  state.turnTargets
    .filter((target) => target.kind === 'extension' && predicate(target))
    .flatMap((target) =>
      extensionAngles.map((angle) => ({
        targetKind: 'extension' as const,
        targetId: target.id,
        extensionTargetId: target.id,
        angle,
        notation: createExtensionMove(target, angle).notation,
        reason: '',
      })),
    );

/**
 * The generator set this algorithm inverts: scale-3 block layers, depth-1
 * whole-block extensions, and depth-2 single-cell rolls. Repetition counts
 * weight the uniform sampler toward block-level moves (roughly 55% layers /
 * 25% block extensions / 20% cell rolls) so scrambles are dominated by real
 * permutation moves rather than orientation noise.
 */
const scrambleMovePool = (
  _model: PuzzleModel<MengerPuzzleState, SolverMove>,
  state: MengerPuzzleState,
): SolverMove[] => {
  const frameMoves: SolverMove[] = state.frames
    .filter((frame) => frame.scale === 3)
    .flatMap((frame) =>
      extensionAngles.map((angle) => ({
        targetKind: 'frame' as const,
        targetId: `frame:${frame.id}`,
        frameId: frame.id,
        angle,
        notation: createMove(frame.id, angle, state.frameById).notation,
        reason: '',
      })),
    );
  const blockMoves = extensionMovesFor(state, (target) => target.depth === 1 && target.family === 'block');
  const cellMoves = extensionMovesFor(state, (target) => target.depth === 2 && target.scale === 1);

  return [...repeatPool(frameMoves, 75), ...repeatPool(blockMoves, 25), ...cellMoves];
};

export const level2BlockQuotientAlgorithm: SolverAlgorithm<MengerPuzzleState, SolverMove> = {
  id: solverId,
  name: solverName,
  version: solverVersion,
  levelsSupported: [2],
  solve,
  scrambleMovePool,
};

/** Pre-warms the shared cubing calibration used by the macro Level 1 solve. */
export const warmLevel2Solver = (puzzle: MengerPuzzleState) => {
  if (puzzle.level !== 2) return;
  warmLevel1Solver(createMengerPuzzleState(1));
};

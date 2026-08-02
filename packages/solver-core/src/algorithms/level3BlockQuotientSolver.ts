import { Quaternion as ThreeQuaternion } from 'three';
import type { Vector3Tuple } from 'three';
import type { Cubie, MengerPuzzleState, TurnTarget, TwistAngle } from '@menger/engine';
import {
  applyExtensionRotation,
  applyTwistToCubies,
  cloneCubies,
  createExtensionMove,
  createMengerPuzzleState,
  createMove,
  createPuzzleConfig,
  isMengerCell,
  rotateQuaternion,
  validateFrameRotation,
  validateTurnTargetRotation,
} from '@menger/engine';
import type { SolverAlgorithm, SolverExplanationStep, SolverMove, SolverRunResult } from '../algorithm/types';
import type { PuzzleModel } from '../model/puzzleModel';
import {
  isExactlySolved,
  isOrientationSolved,
  orientationKey,
  progressForCubies,
  progressSummary,
  samePosition,
  stateKey,
  vectorKey,
} from './level1State';
import { level2SliceReductionAlgorithm, warmLevel2SliceReductionSolver } from './level2SliceReductionSolver';
import { allBlockRotations, applyMatrixToVector } from './blockRotations';
import { emitSolverDebug } from '../debug';

const solverId = 'level3-block-quotient';
const solverName = 'level-3-block-quotient-reducer';
const solverVersion = '0.1.0';
const extensionAngles: TwistAngle[] = [90, -90, 180];
const primaryComplexityEstimate =
  'O(8000) mid-block rigidity analysis over 400 regions x 24 rotations, one Level 2 slice-reduction solve of the ' +
  '400-block macro state, an O(moves x 8000) lifted replay, then one depth-3 turn per residual cell roll';

/*
 * Level 3 block-quotient solver.
 *
 * The Level 3 Menger cube is a Level 2 Menger arrangement of 3x3x3 mid-blocks:
 * 400 blocks of 20 cells. Quotienting by "every mid-block is a rigid body"
 * therefore does not land on a Level 1 puzzle (as the Level 2 block quotient
 * does) but on a full Level 2 puzzle, and the quotient is exact — verified
 * move for move: a Level 2 target's selector applied to a block coordinate
 * agrees with the identically-named Level 3 target's selector applied to every
 * cell of that block, for all 36 frames and all 288 extension targets.
 *
 *   L3 scale-3 frame     <->  L2 scale-1 slice
 *   L3 scale-9 frame     <->  L2 scale-3 block layer
 *   L3 depth-1/1.5/2 ext <->  L2 depth-1/1.5/2 ext   (identical target ids)
 *   L3 depth-3 cell roll  ->  invisible in the quotient
 *
 * So the pipeline is:
 *
 *   1. mid-block rigidity analysis -> a 400-cell Level 2 macro state
 *   2. solve it with the Level 2 slice-reduction solver (which itself fast-paths
 *      to the Level 2 block quotient when the macro state is block-rigid)
 *   3. lift every macro move (frames scale x3, extension ids verbatim)
 *   4. normalize the residual per-cell rolls that the quotient could not see
 *
 * Scope: the generator set that keeps mid-blocks rigid — scale-3 and scale-9
 * frames, depth-1 and depth-1.5 block extensions, depth-2 mid-block rotations,
 * and depth-3 single-cell rolls. Scale-1 slices and depth-2.5 slabs tear
 * mid-blocks apart and are rejected honestly (they need a cell-level reduction,
 * the Level 3 analogue of docs/algorithms/level2-slice-reduction-solver.md).
 */

// --- Mid-block geometry (Level 3: 27x27x27 grid, 400 blocks of 20 cells) ---

const gridExtent = 13;
const macroLevel = 2;
const macroBlockCount = 400;
const cellsPerBlock = 20;
const macroConfig = createPuzzleConfig(macroLevel);

/** Level 3 coordinate (-13..13) to the coordinate of its mid-block on the Level 2 lattice (-4..4). */
const blockCoordOf = (value: number): number => Math.floor((value + gridExtent) / 3) - macroConfig.extent;

const midBlockOf = (position: Vector3Tuple): Vector3Tuple => [
  blockCoordOf(position[0]),
  blockCoordOf(position[1]),
  blockCoordOf(position[2]),
];

/** A mid-block region is addressable exactly when its coordinate is a Level 2 Menger site. */
const isMacroSite = (block: Vector3Tuple): boolean =>
  block.every((component) => Math.abs(component) <= macroConfig.extent) && isMengerCell(block, macroConfig);

const offsetWithinBlock = (position: Vector3Tuple, block: Vector3Tuple): Vector3Tuple => [
  position[0] - 3 * block[0],
  position[1] - 3 * block[1],
  position[2] - 3 * block[2],
];

// --- Phase 1: project the 8000-cell state onto a Level 2 macro puzzle ---

type MacroAnalysis =
  | { ok: true; macroCubies: Cubie[] }
  | { ok: false; reason: string };

/**
 * A Level 3 state is "block-rigid" when every 3x3x3 mid-block region holds
 * exactly the 20 cells of one home mid-block, moved as a rigid body (a single
 * rotation maps every home offset onto the matching current offset). Cell
 * orientations are deliberately ignored: a depth-3 roll turns one cell in
 * place without moving it, so it cannot break rigidity — those rolls are
 * normalized in the final phase instead.
 */
const analyzeMacroState = (cubies: Cubie[], macroTemplate: MengerPuzzleState): MacroAnalysis => {
  const regions = new Map<string, Cubie[]>();

  for (const cubie of cubies) {
    const region = midBlockOf(cubie.currentPosition);
    if (!isMacroSite(region)) {
      return {
        ok: false,
        reason: `Cell ${cubie.id} sits at (${vectorKey(cubie.currentPosition)}), outside every Menger mid-block region.`,
      };
    }
    const key = vectorKey(region);
    const members = regions.get(key);
    if (members) members.push(cubie);
    else regions.set(key, [cubie]);
  }

  if (regions.size !== macroBlockCount) {
    return { ok: false, reason: `Expected ${macroBlockCount} occupied mid-block regions, found ${regions.size}.` };
  }

  const templateByHome = new Map(macroTemplate.cubies.map((cubie) => [vectorKey(cubie.homePosition), cubie]));
  const macroCubies: Cubie[] = [];
  const usedHomeBlocks = new Set<string>();

  for (const [regionKey, members] of [...regions.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const homeBlockKeys = new Set(members.map((cubie) => vectorKey(midBlockOf(cubie.homePosition))));
    if (homeBlockKeys.size !== 1) {
      return {
        ok: false,
        reason:
          `Mid-block region (${regionKey}) holds cells from ${homeBlockKeys.size} different home blocks — ` +
          'single-layer slices or depth-2.5 slab twists have torn mid-block boundaries, which this solver version does not repair.',
      };
    }
    if (members.length !== cellsPerBlock) {
      return {
        ok: false,
        reason: `Mid-block region (${regionKey}) holds ${members.length} cells instead of ${cellsPerBlock}.`,
      };
    }

    const homeBlock = midBlockOf(members[0]!.homePosition);
    const homeBlockKey = vectorKey(homeBlock);
    if (usedHomeBlocks.has(homeBlockKey)) {
      return { ok: false, reason: `Home mid-block (${homeBlockKey}) occupies more than one region.` };
    }
    usedHomeBlocks.add(homeBlockKey);

    const region = midBlockOf(members[0]!.currentPosition);
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
          `Mid-block region (${regionKey}) is not a rigid copy of home block (${homeBlockKey}) — ` +
          'a slab twist or partial-layer move left it internally scrambled, which this solver version does not repair.',
      };
    }

    const template = templateByHome.get(homeBlockKey);
    if (!template) {
      return { ok: false, reason: `Home mid-block (${homeBlockKey}) has no matching Level 2 macro site.` };
    }

    macroCubies.push({
      ...template,
      currentPosition: [...region] as Vector3Tuple,
      orientation: rotation.quaternion.clone(),
    });
  }

  return { ok: true, macroCubies };
};

// --- Phase 2: lift macro Level 2 moves onto Level 3 turn targets ---

const liftMacroMove = (
  macroMove: SolverMove,
  macroPuzzle: MengerPuzzleState,
  puzzle: MengerPuzzleState,
): SolverMove | null => {
  if (macroMove.targetKind === 'frame' && macroMove.frameId) {
    const macroFrame = macroPuzzle.frameById.get(macroMove.frameId);
    if (!macroFrame) return null;
    // A macro frame of scale s at layer L is the Level 3 frame of scale 3s at layer 3L:
    // both select exactly the cells whose mid-block the macro frame selects.
    const frame = puzzle.frames.find(
      (candidate) =>
        candidate.scale === macroFrame.scale * 3 &&
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
      reason: `Macro move ${macroMove.notation} lifted one fractal step to ${notation}.`,
    };
  }

  if (macroMove.targetKind === 'extension' && macroMove.extensionTargetId) {
    // Extension target ids are level-independent (`extension:d<depth>:p<path>:s<slot>`),
    // so a macro depth-1/1.5/2 target names the Level 3 target that rotates the
    // corresponding block of blocks. Verified: 288/288 ids shared, selectors agree.
    const target = puzzle.turnTargetById.get(macroMove.extensionTargetId);
    if (!target || target.kind !== 'extension') return null;
    const notation = createExtensionMove(target, macroMove.angle).notation;
    return {
      targetKind: 'extension',
      targetId: target.id,
      extensionTargetId: target.id,
      angle: macroMove.angle,
      notation,
      reason: `Macro extension ${macroMove.notation} lifted one fractal step to ${notation}.`,
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

// --- Phase 3: normalize the residual per-cell rolls the quotient cannot see ---

/**
 * Two facts make this phase a one-move-per-defect lookup rather than a search.
 *
 * *Rolls compose in the cell's own frame.* Every move coarser than depth-3 turns
 * a cell's whole mid-block, carrying the cell and its block frame together, so
 * the cell-relative orientation does not change. Only a depth-3 turn changes it,
 * and always about the cell's home slot axis. Every residue the macro phase
 * leaves behind is therefore a pure roll about a known axis.
 *
 * *Roll-legality is an orbit invariant.* Only 744 of the 4800 depth-3 targets
 * are physically legal — turning a unit cell in place sweeps a disk wider than
 * the cell, so a cell with a face neighbour perpendicular to its slot axis
 * cannot turn — which raises the worry that a cell might be rolled at one site
 * and need unrolling at a blocked one. It cannot: the 8000 sites fall into 164
 * orbits under the full move group, and roll-legality is constant on each
 * (verified in `research/scratch/l3-structure.ts`). A cell that could be rolled
 * at all can be rolled at home.
 *
 * So the target at the cell's home site exists, is legal, and one of its three
 * angles removes the residue. Anything else means the state did not come from
 * this generator set, and is reported as such.
 */
const identityOrientationKey = orientationKey(new ThreeQuaternion());

const normalizeCellRolls = (
  inputCubies: Cubie[],
  puzzle: MengerPuzzleState,
  explanation: SolverExplanationStep[],
): { cubies: Cubie[]; moves: SolverMove[]; success: boolean; notes: string } => {
  let cubies = cloneCubies(inputCubies);
  const moves: SolverMove[] = [];

  const rollTargetBySite = new Map<string, TurnTarget>();
  for (const target of puzzle.turnTargets) {
    if (target.kind !== 'extension' || target.depth !== 3 || target.scale !== 1) continue;
    rollTargetBySite.set(vectorKey(target.pivot), target);
  }

  for (const cubie of [...cubies].sort((a, b) => a.id.localeCompare(b.id))) {
    const live = cubies.find((candidate) => candidate.id === cubie.id)!;
    if (!samePosition(live.currentPosition, live.homePosition)) {
      return { cubies, moves, success: false, notes: `Cannot normalize ${live.id}; it is not at its home position.` };
    }
    if (isOrientationSolved(live)) continue;

    const target = rollTargetBySite.get(vectorKey(live.currentPosition));
    if (!target) {
      return {
        cubies,
        moves,
        success: false,
        notes:
          `${live.id} is home but twisted, and no depth-3 target exists at (${vectorKey(live.currentPosition)}) — ` +
          'cells at the corners of a mid-block cannot roll independently, so nothing in this generator set could ' +
          'have twisted it.',
      };
    }

    const solvedAngle = extensionAngles.find(
      (angle) =>
        orientationKey(rotateQuaternion(live.orientation, target.axis, angle)) === identityOrientationKey &&
        validateTurnTargetRotation(cubies, target, angle).legal,
    );
    if (solvedAngle === undefined) {
      return {
        cubies,
        moves,
        success: false,
        notes:
          `${live.id} is home but twisted, and no legal turn of ${target.name} restores its orientation — the ` +
          'residue is not a roll about the cell\'s own slot axis, so it cannot have come from this generator set.',
      };
    }

    cubies = applyExtensionRotation(cubies, target.id, solvedAngle, puzzle.turnTargetById);
    moves.push({
      targetKind: 'extension',
      targetId: target.id,
      extensionTargetId: target.id,
      angle: solvedAngle,
      notation: createExtensionMove(target, solvedAngle).notation,
      reason: `${live.id} is home but rolled; this turn restores its orientation without moving any cell.`,
    });
  }

  const solved = isExactlySolved(cubies);
  explanation.push({
    phase: 'cell roll normalization',
    objective: 'Remove every residual single-cell roll the block quotient could not see.',
    observation:
      moves.length === 0
        ? 'No cell roll remained after the macro phase.'
        : `Removed ${moves.length} cell roll(s), one depth-3 turn each.`,
    selectedMove: moves[0]?.notation,
    reason:
      'Coarser moves turn a cell together with its mid-block, so a cell only ever accumulates rolls about its own ' +
      'home slot axis, and roll-legality is constant on each site orbit — the home target is therefore both the ' +
      'right axis and a legal turn.',
    progress: progressForCubies(cubies),
  });

  return {
    cubies,
    moves,
    success: solved,
    notes: solved ? 'All cell rolls normalized.' : 'Cell normalization ended with unsolved orientation.',
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
    objective: 'Build a solve plan from the current 8000-cell Level 3 state without reading move history.',
    observation: progressSummary(inputProgress),
    progress: inputProgress,
  }];

  const failure = (finalStrategy: string, notes: string): SolverRunResult => ({
    name: solverName,
    version: solverVersion,
    level_supported: [3],
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

  if (puzzle.level !== 3) {
    return failure('Level 3 only.', 'This solver currently supports Level 3 only.');
  }

  emitSolverDebug(solverId, 'solve: mid-block rigidity analysis starting');
  const macroPuzzle = createMengerPuzzleState(macroLevel);
  const analysis = analyzeMacroState(puzzle.cubies, macroPuzzle);
  if (!analysis.ok) {
    emitSolverDebug(solverId, `solve: rigidity analysis rejected the state — ${analysis.reason}`);
    explanation.push({
      phase: 'mid-block rigidity analysis',
      objective: 'Verify every 3x3x3 mid-block region is a rigid copy of exactly one home mid-block.',
      observation: analysis.reason,
      progress: inputProgress,
    });
    return failure('The state is outside the block-rigid class this solver version handles.', analysis.reason);
  }
  explanation.push({
    phase: 'mid-block rigidity analysis',
    objective: 'Verify every 3x3x3 mid-block region is a rigid copy of exactly one home mid-block.',
    observation:
      `All ${macroBlockCount} mid-block regions are rigid copies of distinct home blocks; the state projects exactly ` +
      'onto a Level 2 macro puzzle.',
    reason:
      'Menger self-similarity: the 400 mid-blocks occupy the same layout as the 400 Level 2 cells, and every Level 2 ' +
      'turn target has a Level 3 target that moves exactly the blocks the macro target moves.',
    progress: inputProgress,
  });

  emitSolverDebug(solverId, 'solve: macro Level 2 solve starting');
  const macroState: MengerPuzzleState = { ...macroPuzzle, cubies: analysis.macroCubies };
  const macroResult = await level2SliceReductionAlgorithm.solve(model, macroState);
  emitSolverDebug(
    solverId,
    `solve: macro Level 2 solve finished — success=${macroResult.success}, moves=${macroResult.move_count}`,
  );

  for (const step of macroResult.explanation) {
    if (step.phase === 'state inspection') continue;
    explanation.push({ ...step, phase: `macro ${step.phase}` });
  }
  if (!macroResult.success) {
    return failure('Macro Level 2 solve failed.', `Macro Level 2 solve failed: ${macroResult.notes}`);
  }

  let cubies = cloneCubies(puzzle.cubies);
  const macroMoves: SolverMove[] = [];
  for (const macroMove of macroResult.output_moves) {
    const lifted = liftMacroMove(macroMove, macroState, puzzle);
    if (!lifted) {
      return failure(
        'Macro move lift failed.',
        `Cannot lift macro move ${macroMove.notation} to a Level 3 turn target.`,
      );
    }
    macroMoves.push(lifted);
    cubies = applySolverMoveToCubies(cubies, lifted, puzzle);
  }

  if (!cubies.every((cubie) => samePosition(cubie.currentPosition, cubie.homePosition))) {
    return failure(
      'Macro solution verification failed.',
      'Lifted macro moves did not bring every cell to its home position.',
    );
  }
  explanation.push({
    phase: 'macro verification',
    objective: 'Replay the lifted block moves on the real 8000-cell state.',
    observation: `All ${cubies.length} cells are at their home positions after ${macroMoves.length} lifted move(s).`,
    progress: progressForCubies(cubies),
  });

  const rollResult = normalizeCellRolls(cubies, puzzle, explanation);
  const outputMoves = [...macroMoves, ...rollResult.moves];

  let verifyCubies = cloneCubies(puzzle.cubies);
  for (const move of outputMoves) verifyCubies = applySolverMoveToCubies(verifyCubies, move, puzzle);
  const finalProgress = progressForCubies(verifyCubies);
  const solved = rollResult.success && isExactlySolved(verifyCubies);
  explanation.push({
    phase: 'final verification',
    objective: 'Replay the full move list on the real 8000-cell state and require an exact solve.',
    observation: progressSummary(finalProgress),
    progress: finalProgress,
  });
  emitSolverDebug(
    solverId,
    `solve: finished in ${Math.round(performance.now() - start)}ms — success=${solved}, moves=${outputMoves.length}`,
  );

  if (!solved) {
    return failure(
      'Final verification failed.',
      rollResult.success
        ? 'Replaying the generated moves did not exactly solve the real state.'
        : rollResult.notes,
    );
  }

  return {
    name: solverName,
    version: solverVersion,
    level_supported: [3],
    input_state: inputState,
    output_moves: outputMoves,
    runtime_ms: performance.now() - start,
    move_count: outputMoves.length,
    success: true,
    explanation,
    final_strategy:
      'Project the 400 rigid mid-blocks onto a Level 2 macro state, solve that with the Level 2 slice-reduction ' +
      'solver, lift every macro move one fractal step up (scale x3 frames, identical extension target ids), then ' +
      'remove the residual single-cell rolls with direct or conjugated depth-3 turns.',
    complexity_estimate: primaryComplexityEstimate,
    notes: 'Level 3 solved through the mid-block quotient onto Level 2.',
  };
};

// --- Scramble generator set (see SolverAlgorithm.scrambleMovePool) ---

const repeatPool = <T>(pool: T[], times: number): T[] =>
  Array.from({ length: times }).flatMap(() => pool);

const legalFrameMoves = (state: MengerPuzzleState, scale: number): SolverMove[] =>
  state.frames
    .filter((frame) => frame.scale === scale)
    .flatMap((frame) =>
      extensionAngles
        .filter((angle) => validateFrameRotation(state.cubies, frame, angle).legal)
        .map((angle) => ({
          targetKind: 'frame' as const,
          targetId: `frame:${frame.id}`,
          frameId: frame.id,
          angle,
          notation: createMove(frame.id, angle, state.frameById).notation,
          reason: '',
        })),
    );

const legalExtensionMoves = (
  state: MengerPuzzleState,
  predicate: (target: TurnTarget) => boolean,
): SolverMove[] =>
  state.turnTargets
    .filter((target) => target.kind === 'extension' && predicate(target))
    .flatMap((target) =>
      extensionAngles
        .filter((angle) => validateTurnTargetRotation(state.cubies, target, angle).legal)
        .map((angle) => ({
          targetKind: 'extension' as const,
          targetId: target.id,
          extensionTargetId: target.id,
          angle,
          notation: createExtensionMove(target, angle).notation,
          reason: '',
        })),
    );

const poolCache = new WeakMap<TurnTarget[], SolverMove[]>();

/**
 * The generator set this algorithm inverts: every physically legal move that
 * keeps 3x3x3 mid-blocks rigid — scale-3 and scale-9 frames, depth-1 and
 * depth-1.5 block extensions, depth-2 mid-block rotations, and depth-3 cell
 * rolls. Scale-1 slices and depth-2.5 slabs are excluded because they tear
 * mid-blocks apart.
 *
 * Illegal turns are filtered out here rather than left for the runner to
 * reject: only 744 of the 4800 depth-3 targets can physically turn, so an
 * unfiltered pool would be 80% dead weight. Repetition counts weight the
 * uniform sampler to roughly 30% scale-3 / 15% scale-9 / 10% depth-1 /
 * 15% depth-1.5 / 15% depth-2 / 15% cell rolls, so scrambles are dominated by
 * block-transporting moves rather than orientation noise.
 */
const scrambleMovePool = (
  _model: PuzzleModel<MengerPuzzleState, SolverMove>,
  state: MengerPuzzleState,
): SolverMove[] => {
  const cached = poolCache.get(state.turnTargets);
  if (cached) return cached;

  const pool = [
    ...repeatPool(legalFrameMoves(state, 3), 56),
    ...repeatPool(legalFrameMoves(state, 9), 83),
    ...repeatPool(legalExtensionMoves(state, (target) => target.depth === 1), 42),
    ...repeatPool(legalExtensionMoves(state, (target) => target.depth === 1.5), 21),
    ...repeatPool(legalExtensionMoves(state, (target) => target.depth === 2), 10),
    ...legalExtensionMoves(state, (target) => target.depth === 3 && target.scale === 1),
  ];
  poolCache.set(state.turnTargets, pool);
  return pool;
};

export const level3BlockQuotientAlgorithm: SolverAlgorithm<MengerPuzzleState, SolverMove> = {
  id: solverId,
  name: solverName,
  version: solverVersion,
  levelsSupported: [3],
  solve,
  scrambleMovePool,
};

/** Pre-builds the Level 2 commutator tool library the macro solve depends on. */
export const warmLevel3BlockQuotientSolver = (): void => {
  warmLevel2SliceReductionSolver();
};

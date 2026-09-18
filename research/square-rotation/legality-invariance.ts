/**
 * Step 2: is legality a function of the occupied position set alone, so that
 * judging once on the solved state is enough?
 *
 * Run: `npx tsx research/square-rotation/legality-invariance.ts` from the repo root.
 *
 * The argument from `rotationLegality.ts` is:
 *
 * - `validateRigidRotationUncached` reads only `cubie.currentPosition` (ids
 *   appear solely in the message strings), so its verdict is a function of the
 *   occupied position multiset together with the candidate and angle.
 * - Every legal move keeps that multiset fixed: endpoint closure forces the
 *   moving cells to permute among their own positions, and stationary cells do
 *   not move.
 *
 * Hence the legal move set is the same in every reachable state. This script is
 * the empirical differential check of both halves, with fresh target objects
 * every time so the engine's `WeakMap` cache cannot hide a difference.
 */
import {
  applyExtensionRotation,
  applyTwistToCubies,
  cloneCubies,
  createMengerPuzzleState,
  validateFrameRotation,
  validateTurnTargetRotation,
} from '../../packages/engine/src/index';
import type { Cubie, MengerPuzzleState, TwistAngle } from '../../packages/engine/src/index';
import {
  allAngles,
  cellKey,
  enumerateRegionCandidates,
  targetForCells,
  type Candidate,
} from './model';

const level = 2;
const scrambleLength = 400;
const seedCount = 6;

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const occupancyKey = (cubies: Cubie[]): string =>
  cubies.map((cubie) => cellKey(cubie.currentPosition)).sort().join(';');

const verdictKey = (cubies: Cubie[], candidate: Candidate, angle: TwistAngle): string => {
  // A fresh target object per call: the engine caches by object identity, so
  // reusing one would return the solved-state verdict no matter what.
  const verdict = validateTurnTargetRotation(cubies, targetForCells(candidate), angle);
  return verdict.legal ? 'legal' : `illegal:${verdict.code}`;
};

const solved = createMengerPuzzleState(level);
const solvedOccupancy = occupancyKey(solved.cubies);

// A manageable but non-trivial probe set: every region candidate of the three
// central planes, plus the four-block example.
const allRegions = enumerateRegionCandidates(solved.cubies, level).candidates;
const probes = allRegions.filter((candidate) => candidate.layers[0] === 0);
console.log(`probe candidates: ${probes.length} (of ${allRegions.length} region candidates at level ${level})`);

const baseline = new Map<string, string>();
for (const candidate of probes) {
  for (const angle of allAngles) baseline.set(`${candidate.id}@${angle}`, verdictKey(solved.cubies, candidate, angle));
}

const legalMovesOf = (state: MengerPuzzleState) => {
  const moves: Array<{ kind: 'frame' | 'extension'; id: string; angle: TwistAngle }> = [];
  for (const frame of state.frames) {
    for (const angle of allAngles) {
      if (validateFrameRotation(state.cubies, frame, angle).legal) {
        moves.push({ kind: 'frame', id: frame.id, angle });
      }
    }
  }
  for (const target of state.turnTargets) {
    if (target.kind !== 'extension') continue;
    for (const angle of allAngles) {
      if (validateTurnTargetRotation(state.cubies, target, angle).legal) {
        moves.push({ kind: 'extension', id: target.id, angle });
      }
    }
  }
  return moves;
};

const referenceMoves = legalMovesOf(solved);
console.log(`legal atomic moves on the solved state: ${referenceMoves.length}`);

let occupancyViolations = 0;
let verdictViolations = 0;
let moveSetViolations = 0;

for (let seed = 1; seed <= seedCount; seed += 1) {
  const random = mulberry32(seed * 7919);
  const state: MengerPuzzleState = { ...solved, cubies: cloneCubies(solved.cubies) };

  for (let step = 0; step < scrambleLength; step += 1) {
    const pool = legalMovesOf(state);
    const move = pool[Math.floor(random() * pool.length)]!;
    state.cubies =
      move.kind === 'frame'
        ? applyTwistToCubies(state.cubies, move.id, move.angle, state.frameById)
        : applyExtensionRotation(state.cubies, move.id, move.angle, state.turnTargetById);
    if (occupancyKey(state.cubies) !== solvedOccupancy) occupancyViolations += 1;
  }

  const scrambledMoves = legalMovesOf(state);
  const scrambledKeys = new Set(scrambledMoves.map((move) => `${move.kind}:${move.id}@${move.angle}`));
  const referenceKeys = new Set(referenceMoves.map((move) => `${move.kind}:${move.id}@${move.angle}`));
  if (scrambledKeys.size !== referenceKeys.size || [...referenceKeys].some((key) => !scrambledKeys.has(key))) {
    moveSetViolations += 1;
  }

  for (const candidate of probes) {
    for (const angle of allAngles) {
      if (verdictKey(state.cubies, candidate, angle) !== baseline.get(`${candidate.id}@${angle}`)) {
        verdictViolations += 1;
      }
    }
  }
}

console.log(`\nseeds: ${seedCount} x ${scrambleLength} legal moves`);
console.log(`occupied-position-set changes after a legal move: ${occupancyViolations}`);
console.log(`existing legal move set differences vs solved state: ${moveSetViolations}`);
console.log(`audit-candidate verdict differences vs solved state: ${verdictViolations} / ${seedCount * probes.length * 3}`);

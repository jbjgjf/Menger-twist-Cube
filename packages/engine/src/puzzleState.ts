import type { MengerPuzzleState } from './types';
import { generateMenger } from './generateMenger';
import { createFrameMap, generateRotationFrames } from './frameDefinitions';
import { interactionTierForLevel, isPlayableLevel, type LevelRenderOptions } from './levels';
import { createTurnTargetMap, generateTurnTargets } from './turnTargets';
import { generateMoveSystemTurnTargets, isMoveSystemAvailable, type MoveSystem } from './moveSystems';

export interface PuzzleStateOptions extends LevelRenderOptions {
  /** Opt-in generator set; defaults to the shipped `standard` system. */
  moveSystem?: MoveSystem;
}

/**
 * Builds a fresh, solved `MengerPuzzleState` for a level. This is the single
 * source of truth for "what does a puzzle look like at level N" — the Play
 * app's reducer, the solver's puzzle model, and the benchmark CLI all build
 * their starting state through this function instead of each re-deriving
 * frames/turn targets/cubies independently.
 */
export const createMengerPuzzleState = (
  level: number,
  options: PuzzleStateOptions = {},
): MengerPuzzleState => {
  const moveSystem = options.moveSystem ?? 'standard';
  if (!isMoveSystemAvailable(moveSystem, level)) {
    throw new Error(`Move system "${moveSystem}" is not defined for level ${level}.`);
  }
  const interactionTier = interactionTierForLevel(level, options);
  const playable = isPlayableLevel(level, options);
  const cubies = playable ? generateMenger(level) : [];
  const frames = generateRotationFrames(level);
  const frameById = createFrameMap(frames);
  const turnTargets = [
    ...generateTurnTargets(level, frames, playable),
    ...(playable ? generateMoveSystemTurnTargets(moveSystem, level) : []),
  ];
  const turnTargetById = createTurnTargetMap(turnTargets);

  return {
    level,
    ...(moveSystem === 'standard' ? {} : { moveSystem }),
    interactionTier,
    frames,
    frameById,
    turnTargets,
    turnTargetById,
    cubies,
  };
};

import type { MengerPuzzleState } from './types';
import { generateMenger } from './generateMenger';
import { createFrameMap, generateRotationFrames } from './frameDefinitions';
import { interactionTierForLevel, isPlayableLevel } from './levels';
import { createTurnTargetMap, generateTurnTargets } from './turnTargets';

/**
 * Builds a fresh, solved `MengerPuzzleState` for a level. This is the single
 * source of truth for "what does a puzzle look like at level N" — the Play
 * app's reducer, the solver's puzzle model, and the benchmark CLI all build
 * their starting state through this function instead of each re-deriving
 * frames/turn targets/cubies independently.
 */
export const createMengerPuzzleState = (level: number): MengerPuzzleState => {
  const interactionTier = interactionTierForLevel(level);
  const cubies = isPlayableLevel(level) ? generateMenger(level) : [];
  const frames = generateRotationFrames(level);
  const frameById = createFrameMap(frames);
  const turnTargets = generateTurnTargets(level, frames, isPlayableLevel(level));
  const turnTargetById = createTurnTargetMap(turnTargets);

  return {
    level,
    interactionTier,
    frames,
    frameById,
    turnTargets,
    turnTargetById,
    cubies,
  };
};

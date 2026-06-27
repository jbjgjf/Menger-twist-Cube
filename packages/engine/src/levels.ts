import type { InteractionTier } from './types';

export const supportedLevels = [1, 2, 3, 4, 5] as const;

export type SupportedLevel = (typeof supportedLevels)[number];

export const minPuzzleLevel = supportedLevels[0];
export const maxPuzzleLevel = supportedLevels[supportedLevels.length - 1];

export const normalizePuzzleLevel = (level: number): SupportedLevel => {
  const normalized = Math.min(maxPuzzleLevel, Math.max(minPuzzleLevel, Math.floor(level)));
  return normalized as SupportedLevel;
};

// Returns available slice scales for a given level: [1], [1,3], [1,3,9], [1,3,9,27]
export const availableScalesForLevel = (level: number): number[] => {
  const gridSize = 3 ** level;
  const scales = [1];
  for (let s = 3; s <= gridSize / 3; s *= 3) scales.push(s);
  return scales;
};

export const interactionTierForLevel = (level: number): InteractionTier => {
  if (level <= 2) return 'competitive-manual';
  if (level === 3) return 'assisted-manual';
  return 'research-evaluation';
};

export const isPlayableLevel = (level: number): boolean =>
  interactionTierForLevel(level) !== 'research-evaluation';

export const frameTargetCountForLevel = (level: number): number =>
  availableScalesForLevel(level).reduce((total, scale) => total + 3 * ((3 ** level) / scale), 0);

const extensionBlockTargetCountForLevel = (level: number): number =>
  12 * ((20 ** level - 1) / 19);

const extensionSlabTargetCountForLevel = (level: number): number =>
  level <= 1 ? 0 : 36 * ((20 ** (level - 1) - 1) / 19);

export const extensionTargetCountForLevel = (level: number): number =>
  extensionBlockTargetCountForLevel(level) + extensionSlabTargetCountForLevel(level);

export const turnTargetCountForLevel = (level: number): number =>
  frameTargetCountForLevel(level) + extensionTargetCountForLevel(level);

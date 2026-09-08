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

/**
 * Rendering options for a level. `allowHeavyRendering` is the desktop-only
 * escape hatch: Level 4 is 160,000 cubies, which an instanced renderer on a
 * desktop GPU handles but a phone does not, so the caller (which is the only
 * thing that knows what device it is on) opts in explicitly. Level 5 is
 * 3,200,000 cubies and stays research-only on every device.
 */
export interface LevelRenderOptions {
  allowHeavyRendering?: boolean;
}

export const heavyRenderLevels = [4] as const;

export const interactionTierForLevel = (
  level: number,
  options: LevelRenderOptions = {},
): InteractionTier => {
  if (level <= 2) return 'competitive-manual';
  if (level === 3) return 'assisted-manual';
  if (options.allowHeavyRendering && (heavyRenderLevels as readonly number[]).includes(level)) {
    return 'assisted-manual';
  }
  return 'research-evaluation';
};

export const isPlayableLevel = (level: number, options: LevelRenderOptions = {}): boolean =>
  interactionTierForLevel(level, options) !== 'research-evaluation';

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

export const supportedLevels = [1, 2, 3, 4] as const;

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

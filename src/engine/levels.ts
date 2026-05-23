export const supportedLevels = [1, 2, 3, 4] as const;

export type SupportedLevel = (typeof supportedLevels)[number];

export const minPuzzleLevel = supportedLevels[0];
export const maxPuzzleLevel = supportedLevels[supportedLevels.length - 1];

export const normalizePuzzleLevel = (level: number): SupportedLevel => {
  const normalized = Math.min(maxPuzzleLevel, Math.max(minPuzzleLevel, Math.floor(level)));
  return normalized as SupportedLevel;
};

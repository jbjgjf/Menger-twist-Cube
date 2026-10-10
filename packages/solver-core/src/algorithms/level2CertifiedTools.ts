/**
 * Tool words for `level2-certified`, as atom labels `<targetId>@<angle>` applied
 * left to right. All of them use standard-system atoms only, so they are valid
 * in every Level 2 move system.
 *
 * - `threeCycleWords`: one per site orbit. Each cycles exactly three cells of
 *   one orbit and leaves every other cell's position and orientation fixed.
 * - `pairToolWords`: each fixes every position and re-orients exactly two cells
 *   of one orbit (a twist pair on the two 8-cell corner orbits, a flip pair on
 *   the 48-cell aligned edge orbit).
 *
 * Found by `research/level2-completeness/find-tools.ts`; re-verified from
 * scratch by `research/level2-completeness/certify.ts` and again by the solver
 * when it builds its library, which refuses to run if any word fails.
 */
export const threeCycleWords: readonly (readonly string[])[] = [
  ['frame:Y_+4@90', 'frame:X_-4@90', 'frame:Y_-4@90', 'frame:X_-4@-90', 'frame:Y_+4@-90', 'frame:X_-4@90', 'frame:Y_-4@-90', 'frame:X_-4@-90'],
  ['frame:Y_-3@90', 'frame:X_-4@90', 'frame:Y_-4@90', 'frame:X_-4@-90', 'frame:Y_-3@-90', 'frame:X_-4@90', 'frame:Y_-4@-90', 'frame:X_-4@-90'],
  ['frame:Y_-2@90', 'frame:X_-4@90', 'frame:Y_-4@90', 'frame:X_-4@-90', 'frame:Y_-2@-90', 'frame:X_-4@90', 'frame:Y_-4@-90', 'frame:X_-4@-90'],
  ['frame:Y_-1@90', 'frame:X_-4@90', 'frame:Y_-4@90', 'frame:X_-4@-90', 'frame:Y_-1@-90', 'frame:X_-4@90', 'frame:Y_-4@-90', 'frame:X_-4@-90'],
  ['frame:Y_0@90', 'frame:X_-4@90', 'frame:Y_-4@90', 'frame:X_-4@-90', 'frame:Y_0@-90', 'frame:X_-4@90', 'frame:Y_-4@-90', 'frame:X_-4@-90'],
  ['frame:Y_-2@90', 'frame:X_-4@90', 'frame:Y_-3@90', 'frame:X_-4@-90', 'frame:Y_-2@-90', 'frame:X_-4@90', 'frame:Y_-3@-90', 'frame:X_-4@-90'],
  ['frame:Y_-1@90', 'frame:X_-4@90', 'frame:Y_-3@90', 'frame:X_-4@-90', 'frame:Y_-1@-90', 'frame:X_-4@90', 'frame:Y_-3@-90', 'frame:X_-4@-90'],
  ['frame:Y_+2@90', 'frame:X_-4@90', 'frame:Y_-3@90', 'frame:X_-4@-90', 'frame:Y_+2@-90', 'frame:X_-4@90', 'frame:Y_-3@-90', 'frame:X_-4@-90'],
  ['frame:Y_+2@90', 'frame:X_-4@90', 'frame:Y_-2@90', 'frame:X_-4@-90', 'frame:Y_+2@-90', 'frame:X_-4@90', 'frame:Y_-2@-90', 'frame:X_-4@-90'],
  ['frame:Y_+2@90', 'frame:X_-3@90', 'frame:Y_-2@90', 'frame:X_-3@-90', 'frame:Y_+2@-90', 'frame:X_-3@90', 'frame:Y_-2@-90', 'frame:X_-3@-90'],
  ['frame:Y_+2@90', 'frame:X_-2@90', 'frame:Y_-2@90', 'frame:X_-2@-90', 'frame:Y_+2@-90', 'frame:X_-2@90', 'frame:Y_-2@-90', 'frame:X_-2@-90'],
];

export const pairToolWords: readonly (readonly string[])[] = [
  ['frame:Y_-4@90', 'frame:Y_+4@90', 'frame:X_-4@90', 'frame:Y_-4@90', 'frame:X_-4@-90', 'frame:Y_+4@-90', 'frame:X_-4@90', 'frame:Y_-4@-90', 'frame:X_-4@-90', 'frame:Y_-4@-90', 'frame:X_-4@90', 'frame:X_-4@90', 'frame:Y_-4@90', 'frame:X_-4@-90', 'frame:Y_+4@90', 'frame:X_-4@90', 'frame:Y_-4@-90', 'frame:X_-4@-90', 'frame:Y_+4@-90', 'frame:X_-4@-90'],
  ['frame:Y_-4@180', 'frame:Y_0@90', 'frame:X_-4@90', 'frame:Y_-4@90', 'frame:X_-4@-90', 'frame:Y_0@-90', 'frame:X_-4@90', 'frame:Y_-4@-90', 'frame:X_-4@-90', 'frame:Y_-4@180', 'frame:X_0@90', 'frame:X_-4@90', 'frame:Y_-4@90', 'frame:X_-4@-90', 'frame:Y_0@90', 'frame:X_-4@90', 'frame:Y_-4@-90', 'frame:X_-4@-90', 'frame:Y_0@-90', 'frame:X_0@-90'],
  ['frame:Y_-2@90', 'frame:Y_+2@90', 'frame:X_-2@90', 'frame:Y_-2@90', 'frame:X_-2@-90', 'frame:Y_+2@-90', 'frame:X_-2@90', 'frame:Y_-2@-90', 'frame:X_-2@-90', 'frame:Y_-2@-90', 'frame:X_-2@90', 'frame:X_-2@90', 'frame:Y_-2@90', 'frame:X_-2@-90', 'frame:Y_+2@90', 'frame:X_-2@90', 'frame:Y_-2@-90', 'frame:X_-2@-90', 'frame:Y_+2@-90', 'frame:X_-2@-90'],
];

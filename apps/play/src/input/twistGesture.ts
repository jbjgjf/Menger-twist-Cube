/**
 * The drag distance, in preview degrees, at which a twist gesture becomes a
 * real rotation. Below it the gesture is released without turning anything.
 *
 * Both ends of the gesture must agree on this number. `PuzzleCube` uses it to
 * decide whether a pointer-up was a drag or a tap (a tap cycles the selected
 * frame's axis); `App` uses it to decide whether to commit a move. When the two
 * disagreed — the cube treated 6px of travel as a drag while a rotation needed
 * ~26px — every touch between the two thresholds fell into a dead zone: it did
 * not rotate, and it also suppressed the tap. On a mouse this was invisible
 * (a click rarely drifts 6px); on a finger it made tap-to-cycle look removed.
 */
export const twistCommitAngle = 25;

/**
 * Raw pointer travel, in pixels, that marks a gesture as a drag regardless of
 * direction. `twistCommitAngle` only measures movement *along* the frame's
 * screen tangent, so a drag across a highlighted cubie perpendicular to it
 * would otherwise release as a tap. This is comfortably above a finger's wobble
 * on a tap and roughly the distance a committing twist covers.
 */
export const twistDragSlopPx = 24;

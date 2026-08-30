/**
 * Does the sparse Level 3 simulator agree with the real engine, move for move?
 *
 * Level 2's `sim.ts` documents that it was validated against `@menger/engine`;
 * `l3sim.ts` never was. Every Level 3 result so far — the tool inventory, the
 * placement prototype's 92,402-move solve — is computed in the sparse simulator,
 * so if its permutation or rotation convention differs from the engine's, all of
 * it is void. This applies random legal words in both and compares the full
 * 8000-cell state.
 */
import { Quaternion, Matrix4, Vector3 } from 'three';
import { ROT_ID, atoms, N, rotMul, rotations, sitePositions, siteIndexByKey } from './l3sim';
import { createMengerPuzzleState } from '../../packages/engine/src/puzzleState';
import { applyTwistToCubies, applyExtensionRotation } from '../../packages/engine/src/moves';
import type { Cubie } from '../../packages/engine/src/types';

const state = createMengerPuzzleState(3);
const posKey = (p: readonly number[]) => `${p[0]},${p[1]},${p[2]}`;

/** engine orientation quaternion -> index into the 24 rotation matrices */
const rotIndexOf = (q: Quaternion): number => {
  const m = new Matrix4().makeRotationFromQuaternion(q);
  const cols = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)].map((v) => v.applyMatrix4(m));
  const r = (x: number) => (x > 0.5 ? 1 : x < -0.5 ? -1 : 0);
  const key = [
    r(cols[0]!.x), r(cols[1]!.x), r(cols[2]!.x),
    r(cols[0]!.y), r(cols[1]!.y), r(cols[2]!.y),
    r(cols[0]!.z), r(cols[1]!.z), r(cols[2]!.z),
  ].join(',');
  const idx = rotations.findIndex((mm) => mm.join(',') === key);
  return idx;
};

let rng = 987654321;
const rnd = (n: number) => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng % n; };

const trials = 6;
const wordLength = 40;
let mismatches = 0;

for (let t = 0; t < trials; t += 1) {
  // sparse simulator state: piece -> (site, rotation)
  const site = new Int32Array(N).map((_, i) => i);
  const rot = new Uint8Array(N).fill(ROT_ID);
  const pieceAt = new Int32Array(N).map((_, i) => i);

  let cubies: Cubie[] = state.cubies.map((c) => ({ ...c, orientation: c.orientation.clone() }));
  const used: string[] = [];

  for (let k = 0; k < wordLength; k += 1) {
    const a = atoms[rnd(atoms.length)]!;
    used.push(a.id);

    // apply in the sparse simulator
    const movedPieces: number[] = [];
    for (const [from] of a.map) movedPieces.push(pieceAt[from]!);
    let i = 0;
    for (const [, to] of a.map) {
      const p = movedPieces[i]!;
      site[p] = to;
      rot[p] = rotMul[a.rot]![rot[p]!]!;
      i += 1;
    }
    for (const p of movedPieces) pieceAt[site[p]!] = p;

    // apply on the real engine
    cubies = a.kind === 'frame'
      ? applyTwistToCubies(cubies, a.refId, a.angle, state.frameById)
      : applyExtensionRotation(cubies, a.refId, a.angle, state.turnTargetById);
  }

  // compare: for every piece, its site and its rotation
  let bad = 0;
  for (const c of cubies) {
    const piece = siteIndexByKey.get(posKey(c.homePosition))!;
    const engineSite = siteIndexByKey.get(posKey(c.currentPosition));
    if (engineSite === undefined) { bad += 1; continue; }
    if (engineSite !== site[piece]) { bad += 1; continue; }
    if (rotIndexOf(c.orientation) !== rot[piece]) bad += 1;
  }
  console.log(`trial ${t + 1}: ${wordLength} random legal atoms -> ${bad === 0 ? 'IDENTICAL' : `${bad} cell mismatches`}`);
  if (bad) mismatches += 1;
}

console.log(`\n${trials - mismatches}/${trials} trials agree exactly on all ${N} cells (position and orientation).`);
console.log(mismatches === 0
  ? 'RESULT: the sparse simulator matches the engine. Results computed in it carry over.'
  : 'RESULT: the simulator DISAGREES with the engine — every Level 3 result computed in it is void.');
if (mismatches !== 0) throw new Error(`sparse simulator disagreed with the engine in ${mismatches}/${trials} trials`);
void sitePositions;

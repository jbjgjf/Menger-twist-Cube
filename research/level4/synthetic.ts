import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { allBlockRotations } from '../../packages/solver-core/src/algorithms/blockRotations';
import { level4CertifiedData } from '../../packages/solver-core/src/algorithms/level4CertifiedData';
import { reduceMengerState } from '../../packages/solver-core/src/algorithms/mengerCertifiedReduction';
import { createSparseGroup, orientationFrames, ROT_ID, rotInv, rotMul } from '../../packages/solver-core/src/algorithms/mengerSparseGroup';

const group = createSparseGroup(4, console.log);
const frames = orientationFrames(group);
const destination = Int32Array.from({ length: group.N }, (_, i) => i);
const residue = new Uint8Array(group.N);
const order = (r: number): number => { let n = 1; let t = r; while (t) { t = rotMul[r]![t]!; n++; } return n; };
for (let oi = 0; oi < group.orbits.length; oi++) {
  const sites = group.orbits[oi]!; const f = frames[oi]!;
  for (let i = 0; i < 3; i++) destination[sites[i]!] = sites[(i + 1) % 3]!;
  if (f.freedom.length === 3) {
    const q = f.freedom.find((r) => r !== ROT_ID)!;
    residue[sites[0]!] = q; residue[sites[1]!] = rotInv[q]!;
  } else if (f.freedom.length === 4 || f.freedom.length === 8) {
    const q = f.freedom.find((r) => order(r) === 4)!;
    const cyclic = new Set([ROT_ID, q, rotMul[q]![q]!, rotInv[q]!]);
    const flip = f.freedom.find((r) => !cyclic.has(r));
    for (let i = 0; i < sites.length; i++) {
      let r = ROT_ID;
      for (let k = 0; k < i % 4; k++) r = rotMul[q]![r]!;
      // The D4 orbit has even size: flipping every piece obeys joint parity.
      if (flip !== undefined) r = rotMul[flip]![r]!;
      residue[sites[i]!] = r;
    }
  }
}
// Construct from the proven invariants, without any scramble or move history.
const cubies = group.canonical.cubies.map((c, p) => {
  const f = frames[group.orbitOf[p]!]!; const to = destination[p]!;
  const rotation = rotMul[f.ref[to]!]![rotMul[residue[p]!]![rotInv[f.ref[p]!]!]!]!;
  return { ...c, currentPosition: [...group.sites[to]!] as [number, number, number], orientation: allBlockRotations[rotation]!.quaternion.clone() };
});
const started = performance.now();
const result = reduceMengerState(group, level4CertifiedData, cubies, console.log);
const hash = createHash('sha256');
for (let i = 0; i < result.atoms.length; i += 16384) hash.update((i ? '\n' : '') + result.atoms.slice(i, i + 16384).map((a) => a.id).join('\n'));
const report = { ok: true, construction: 'One even 3-cycle on every orbit; balanced C3 twists; C4 residues throughout; all 768 D4 cells flipped, with quarter residues. No scramble history.',
  orbitsDisrupted: group.orbits.length, positionDefects: group.orbits.length * 3, cells: group.N,
  moveCount: result.atoms.length, runtimeMs: performance.now() - started, placements: result.placements,
  replaySelectedEntries: result.replaySelectedEntries, wordSha256: hash.digest('hex'), phases: result.phases };
writeFileSync('research/level4/out/synthetic-all-orbits.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));

import { mkdirSync, writeFileSync } from 'node:fs';
import { Quaternion } from 'three';
import { createPuzzleConfig, isMengerCell, rotatePositionAroundPivot, rotateQuaternion } from '../../packages/engine/src/index';
import { createSparseGroup, rotationOfCubie } from '../../packages/solver-core/src/algorithms/mengerSparseGroup';

const group = createSparseGroup(4, console.log);
let positionEntries = 0; let orientationChecks = 0; let targetChecks = 0;
for (const a of group.atoms) {
  const target = group.canonical.turnTargetById.get(a.move.targetId)!;
  for (const [s, to] of a.map) {
    const expected = rotatePositionAroundPivot(group.sites[s]!, target.axis, a.angle, target.pivot);
    if (group.siteAt(expected) !== to) throw new Error(`Engine position formula differs for ${a.id}, source ${s}`);
    positionEntries++;
  }
  // Left multiplication by the same delta determines the action on every
  // incoming rotation, so checking delta is enough after exact table closure.
  const c = { ...group.canonical.cubies[0]!, orientation: rotateQuaternion(new Quaternion(), target.axis, a.angle) };
  if (rotationOfCubie(c) !== a.rot) throw new Error(`Engine orientation formula differs for ${a.id}`);
  orientationChecks++;
}
// Independent analytic criterion: a block or any of its axial slabs can turn
// iff neither transverse face has an occupied neighbouring macro block.
for (const t of group.canonical.turnTargets) {
  if (t.kind !== 'extension') continue;
  const d = Math.floor(t.depth);
  const config = createPuzzleConfig(d);
  const scale = t.family === 'slab' ? 3 * t.scale : t.scale;
  const q = t.pivot.map((v) => Math.round(v / scale)) as [number, number, number];
  const axis = t.axis.findIndex((x) => x !== 0);
  let blocked = false;
  for (let a = 0; a < 3; a++) if (a !== axis) for (const sign of [-1, 1]) {
    const p = [...q] as [number, number, number]; p[a]! += sign;
    if (p.every((v) => Math.abs(v) <= config.extent) && isMengerCell(p, config)) blocked = true;
  }
  for (const angle of [90, -90, 180]) {
    if (group.atomById.has(`e:${t.id}:${angle}`) === blocked) throw new Error(`Analytic legality differs for ${t.id}:${angle}`);
    targetChecks++;
  }
}
const report = { ok: true, level: 4, atoms: group.atoms.length, enginePositionEntries: positionEntries,
  engineOrientationDeltas: orientationChecks, analyticExtensionAngleChecks: targetChecks };
mkdirSync('research/level4/out', { recursive: true });
writeFileSync('research/level4/out/atom-audit.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));

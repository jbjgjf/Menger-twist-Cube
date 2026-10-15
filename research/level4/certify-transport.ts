import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { level4CertifiedData } from '../../packages/solver-core/src/algorithms/level4CertifiedData';
import { createSparseGroup, fullAction, parityBasis } from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import { MengerPairTransport } from '../../packages/solver-core/src/algorithms/mengerPairTransport';

const group = createSparseGroup(4, console.log);
const missing: number[] = [];
let minimumGoodRoots = Infinity;
let positionUpper = 0n;
let maximumPairDistance = 0;
let pairStatesChecked = 0;
for (const record of level4CertifiedData.tools) {
  const word = record.word.map((id) => group.atomById.get(id)!);
  const action = fullAction(word);
  const a = action.keys().next().value!; const b = action.get(a)![0]; const c = action.get(b)![0];
  const transport = new MengerPairTransport(group, record.orbit, [a, b, c], word, true);
  const good = [...transport.alternatives.values()].filter((list) => list.length >= 3).length;
  const maxRootWord = Math.max(...[...transport.alternatives.values()].filter((list) => list.length >= 3).flatMap((list) => list.map((r) => r.word.length)));
  const m = BigInt(group.orbits[record.orbit]!.length);
  // The complete BFS supplies the exact maximum distance to the anchor set.
  const pairPath = BigInt(transport.maxDistance);
  maximumPairDistance = Math.max(maximumPairDistance, transport.maxDistance);
  pairStatesChecked += transport.visitedStates;
  positionUpper += (m / 2n) * (4n * BigInt(maxRootWord) + 8n * pairPath);
  minimumGoodRoots = Math.min(minimumGoodRoots, good);
  if (!good) missing.push(record.orbit);
  if (record.orbit % 100 === 0) console.log(`Transport ${record.orbit}/${group.orbits.length}, good roots=${good}`);
}
let orientationUpper = 11256n; // Every directly rollable site is cleared at most once.
for (const record of level4CertifiedData.pairTwisters) {
  const word = record.word.map((id) => group.atomById.get(id)!);
  const action = fullAction(word);
  const transport = new MengerPairTransport(group, record.orbit, [...action.keys()], word, false);
  const K = BigInt(Math.max(...transport.roots.map((r) => r.word.length)));
  const m = BigInt(group.orbits[record.orbit]!.length);
  const P = BigInt(transport.maxDistance);
  orientationUpper += record.kind === 'C3' ? 2n * (m - 1n) * (K + 2n * P) : (m / 2n) * (K + 2n * P);
}
const parityUpper = BigInt(parityBasis(group).reduce((s, r) => s + r.word.length, 0));
const report = { ok: missing.length === 0, orbitsChecked: group.orbits.length, minimumGoodRoots, missing,
  wordDataSha256: createHash('sha256').update(JSON.stringify(level4CertifiedData)).digest('hex'),
  pairStatesChecked, maximumPairDistance,
  diameterUpperBound: { parity: parityUpper.toString(), position: positionUpper.toString(), orientation: orientationUpper.toString(), total: (parityUpper + positionUpper + orientationUpper).toString() },
  lemma: 'Three pure 3-cycles with the same directed edge and distinct third sites guarantee an edge realization avoiding any two forbidden sites after arbitrary pair transport.' };
mkdirSync('research/level4/out', { recursive: true });
writeFileSync('research/level4/out/transport-certificate.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (missing.length) process.exitCode = 1;

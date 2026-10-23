import type { Cubie } from '@menger/engine';
import {
  actionOver, fullAction, inverseWord, orientationFrames, parityBasis, parityVector, ROT_ID, rotationOfCubie, rotInv, rotMul,
  type SparseAction, type SparseAtom, type SparseGroup,
} from './mengerSparseGroup';
import { MengerPairTransport } from './mengerPairTransport';

export interface CertifiedReductionData {
  tools: ReadonlyArray<{ orbit: number; word: readonly string[] }>;
  pairTwisters: ReadonlyArray<{ orbit: number; kind: string; word: readonly string[] }>;
}
export interface SparsePuzzleState { pieceAt: Int32Array; siteOf: Int32Array; rotation: Uint8Array }
export interface ReductionResult {
  atoms: SparseAtom[];
  placements: number;
  setupSearchNodes: number;
  replaySelectedEntries: number;
  phases: Array<{ phase: string; moves: number }>;
}
const verifiedToolCache = new WeakMap<SparseGroup, WeakMap<CertifiedReductionData, Map<number, { word: SparseAtom[]; cycle: number[] }>>>();

export const sparseStateOf = (group: SparseGroup, cubies: Cubie[]): SparsePuzzleState => {
  if (cubies.length !== group.N) throw new Error(`Expected ${group.N} cells, got ${cubies.length}`);
  const pieceAt = new Int32Array(group.N).fill(-1);
  const siteOf = new Int32Array(group.N).fill(-1);
  const rotation = new Uint8Array(group.N);
  for (const c of cubies) {
    const home = group.siteAt(c.homePosition); const site = group.siteAt(c.currentPosition);
    if (home < 0 || site < 0 || siteOf[home] !== -1 || pieceAt[site] !== -1) throw new Error('Cells do not bijectively occupy the canonical sites');
    if (group.orbitOf[home] !== group.orbitOf[site]) throw new Error(`Cell ${c.id} leaves its reachable orbit`);
    siteOf[home] = site; pieceAt[site] = home; rotation[home] = rotationOfCubie(c);
  }
  return { pieceAt, siteOf, rotation };
};
const cloneState = (s: SparsePuzzleState): SparsePuzzleState => ({ pieceAt: s.pieceAt.slice(), siteOf: s.siteOf.slice(), rotation: s.rotation.slice() });
const applyAction = (state: SparsePuzzleState, action: SparseAction): void => {
  const pieces = [...action.keys()].map((s) => state.pieceAt[s]!);
  let i = 0;
  for (const [, [to, r]] of action) {
    const piece = pieces[i++]!;
    state.siteOf[piece] = to; state.rotation[piece] = rotMul[r]![state.rotation[piece]!]!;
    state.pieceAt[to] = piece;
  }
};

/** Raw replay updates every selected site, independent of the reduction's net-tool updates. */
export const rawReplay = (
  group: SparseGroup, input: SparsePuzzleState, word: readonly SparseAtom[], progress?: (s: string) => void,
): { state: SparsePuzzleState; selectedEntries: number } => {
  const state = cloneState(input);
  const scratch = new Int32Array(group.N);
  const compiled = new Map<SparseAtom, { src: Int32Array; dst: Int32Array }>();
  let selectedEntries = 0;
  for (let wi = 0; wi < word.length; wi++) {
    const atom = word[wi]!;
    let a = compiled.get(atom);
    if (!a) { a = { src: Int32Array.from(atom.map.keys()), dst: Int32Array.from(atom.map.values()) }; compiled.set(atom, a); }
    for (let i = 0; i < a.src.length; i++) scratch[i] = state.pieceAt[a.src[i]!]!;
    const mul = rotMul[atom.rot]!;
    for (let i = 0; i < a.src.length; i++) {
      const piece = scratch[i]!; const to = a.dst[i]!;
      state.pieceAt[to] = piece; state.siteOf[piece] = to; state.rotation[piece] = mul[state.rotation[piece]!]!;
    }
    selectedEntries += a.src.length;
    if (wi && wi % 100000 === 0) progress?.(`Raw replay ${wi}/${word.length} atoms`);
  }
  return { state, selectedEntries };
};

/**
 * Complete constructive reduction given globally pure cycles and pair twisters.
 * Tool discovery limits never occur in this solve path. Position searches run
 * over finite tuple graphs; every placement shortens an even permutation.
 * C3 twists pair off under their zero-sum constraint, and D4 flips pair off
 * under their even-parity constraint. Independent cell rolls clear the rest.
 */
export const reduceMengerState = (
  group: SparseGroup, data: CertifiedReductionData, cubies: Cubie[], progress?: (s: string) => void,
): ReductionResult => {
  const input = sparseStateOf(group, cubies);
  const state = cloneState(input);
  const emitted: SparseAtom[] = [];
  const phases: ReductionResult['phases'] = [];
  const resolve = (ids: readonly string[]): SparseAtom[] => ids.map((id) => {
    const a = group.atomById.get(id); if (!a) throw new Error(`Certificate names an illegal atom: ${id}`); return a;
  });
  const append = (word: readonly SparseAtom[]): void => {
    for (const a of word) {
      const prev = emitted[emitted.length - 1];
      if (!prev || prev.kind !== a.kind || prev.refId !== a.refId) { emitted.push(a); continue; }
      emitted.pop();
      const q = ((prev.angle + a.angle) / 90 + 8) % 4;
      if (q) emitted.push(group.atomById.get(`${a.kind === 'frame' ? 'f' : 'e'}:${a.refId}:${q === 3 ? -90 : q === 2 ? 180 : 90}`)!);
    }
  };
  const emitRaw = (word: SparseAtom[]): void => {
    // Only parity normalization and direct single-cell rolls take this path.
    const replay = rawReplay(group, state, word);
    state.pieceAt.set(replay.state.pieceAt); state.siteOf.set(replay.state.siteOf); state.rotation.set(replay.state.rotation);
    append(word);
  };
  const emitPure = (word: SparseAtom[], support: number[], positionalCycle = false): void => {
    const action = actionOver(word, support);
    if (positionalCycle && support.some((s, i) => action.get(s)?.[0] !== support[(i + 1) % support.length])) throw new Error('Transported word has the wrong position action');
    if (!positionalCycle && [...action].some(([s, [t]]) => s !== t)) throw new Error('Transported twister moves a position');
    applyAction(state, action); append(word);
  };
  const mark = (phase: string): void => { phases.push({ phase, moves: emitted.length }); progress?.(`${phase}: ${emitted.length} atoms so far`); };

  // Every raw turn's orbit parity is included. The row words realize the
  // corresponding reduced GF(2) vectors, so applying them clears all signs.
  const inputPermutation = new Map<number, number>(Array.from(state.siteOf, (to, from) => [from, to]));
  let parity = parityVector(group, inputPermutation);
  const parityWord: SparseAtom[] = [];
  for (const row of parityBasis(group)) {
    const bit = row.vector.toString(2).length - 1;
    if ((parity >> BigInt(bit)) & 1n) { parity ^= row.vector; parityWord.push(...row.word); }
  }
  if (parity) throw new Error('Unreachable orbit-parity vector');
  emitRaw(parityWord); mark('orbit parity normalization');

  let byData = verifiedToolCache.get(group);
  if (!byData) { byData = new WeakMap(); verifiedToolCache.set(group, byData); }
  let tools = byData.get(data);
  if (!tools) {
    tools = new Map<number, { word: SparseAtom[]; cycle: number[] }>();
    for (const r of data.tools) {
      const word = resolve(r.word); const action = fullAction(word);
      if (action.size !== 3 || [...action].some(([s, [t]]) => s === t || group.orbitOf[s] !== r.orbit)) throw new Error(`Invalid pure 3-cycle certificate for orbit ${r.orbit}`);
      const a = action.keys().next().value!; const b = action.get(a)![0]; const c = action.get(b)![0];
      if (action.get(c)?.[0] !== a) throw new Error('Tool is not a 3-cycle');
      tools.set(r.orbit, { word, cycle: [a, b, c] });
    }
    if (tools.size !== group.orbits.length) throw new Error(`Incomplete position library: ${tools.size}/${group.orbits.length}`);
    byData.set(data, tools);
  }
  progress?.(`Verified all ${tools.size} pure 3-cycle words`);
  let placements = 0; let setupSearchNodes = 0;
  for (let orbit = 0; orbit < group.orbits.length; orbit++) {
    const sites = group.orbits[orbit]!;
    if (sites.every((s) => state.siteOf[s] === s)) continue;
    const tool = tools.get(orbit)!;
    if (sites.length >= 384) progress?.(`Building tuple transport for orbit ${orbit}, size ${sites.length}`);
    const transport = new MengerPairTransport(group, orbit, tool.cycle, tool.word, true);
    const place = (cycle: number[]): void => {
      const [a, b, c] = cycle as [number, number, number];
      const first = transport.cycleForEdge([a, b], new Set());
      let word: SparseAtom[];
      if (first.action.has(c)) word = first.word;
      else {
        const extra = [...first.action.keys()].find((s) => s !== a && s !== b)!;
        const second = transport.cycleForEdge([c, b], new Set([a, extra]));
        // Two pure cycles meeting only at b, with a->b and c->b, have
        // commutator (a b c). This uses pair transport instead of an m^3 graph.
        word = [...first.word, ...second.word, ...inverseWord(group, first.word), ...inverseWord(group, second.word)];
      }
      emitPure(word, cycle, true); placements++;
    };
    while (true) {
      const seen = new Set<number>(); const cycles: number[][] = [];
      for (const s of sites) {
        if (seen.has(s) || state.pieceAt[s] === s) continue;
        const cycle: number[] = []; let t = s;
        do { seen.add(t); cycle.push(t); t = state.pieceAt[t]!; } while (t !== s);
        cycles.push(cycle);
      }
      if (!cycles.length) break;
      const long = cycles.find((c) => c.length >= 3);
      if (long) place(long.slice(0, 3));
      else {
        if (cycles.length < 2) throw new Error('Odd permutation survived parity normalization');
        const [a, b] = cycles[0]!; const [c, d] = cycles[1]!;
        place([a!, c!, d!]); place([a!, c!, b!]);
      }
    }
    setupSearchNodes += transport.visitedStates;
    if (orbit % 100 === 0 || sites.length >= 384) progress?.(`Position orbit ${orbit + 1}/${group.orbits.length} (size ${sites.length}), ${emitted.length} atoms, ${transport.visitedStates} search nodes`);
  }
  if (state.siteOf.some((s, p) => s !== p)) throw new Error('Position phase did not finish');
  mark('orbit placement');

  const frames = orientationFrames(group);
  const rolls = new Map<number, SparseAtom[]>();
  for (const a of group.atoms) if (a.map.size === 1) {
    const [s, to] = a.map.entries().next().value!;
    if (s !== to) continue;
    const l = rolls.get(s) ?? []; l.push(a); rolls.set(s, l);
  }
  const clearRoll = (site: number): boolean => {
    const r = state.rotation[site]!;
    if (r === ROT_ID) return true;
    const a = rolls.get(site)?.find((a) => rotMul[a.rot]![r] === ROT_ID);
    if (!a) return false;
    state.rotation[site] = ROT_ID; append([a]); return true;
  };
  const twisters = new Map(data.pairTwisters.map((t) => [t.orbit, t]));
  for (let orbit = 0; orbit < group.orbits.length; orbit++) {
    const sites = group.orbits[orbit]!;
    const frame = frames[orbit]!; const order = frame.freedom.length;
    if (order === 1) {
      if (sites.some((s) => state.rotation[s] !== ROT_ID)) throw new Error(`Orientation-determined orbit ${orbit} has an unreachable residue`);
      continue;
    }
    for (const s of sites) clearRoll(s);
    if (sites.every((s) => state.rotation[s] === ROT_ID)) continue;
    if (order === 4) throw new Error('C4 residue cannot be cleared by a legal single-cell roll');
    if (order !== 3 && order !== 8) throw new Error(`Unsupported orientation freedom ${order}`);
    const residue = (s: number): number => rotMul[rotInv[frame.ref[s]!]!]![rotMul[state.rotation[s]!]![frame.ref[s]!]!]!;
    const rotationOrder = (r: number): number => { let n = 1; let t = r; while (t !== ROT_ID) { t = rotMul[r]![t]!; n++; } return n; };
    if (order === 3) {
      const q = frame.freedom.find((r) => r !== ROT_ID)!;
      const log = new Map([[ROT_ID, 0], [q, 1], [rotMul[q]![q]!, 2]]);
      let sum = 0;
      for (const s of sites) { const x = log.get(residue(s)); if (x === undefined) throw new Error('C3 residue outside its orientation group'); sum += x; }
      if (sum % 3) throw new Error(`Orbit ${orbit}: non-zero C3 twist sum`);
    } else {
      const q = frame.freedom.find((r) => rotationOrder(r) === 4)!;
      const cyclic = new Set([ROT_ID, q, rotMul[q]![q]!, rotInv[q]!]);
      if (sites.filter((s) => !cyclic.has(residue(s))).length % 2) throw new Error('D4 residue has an odd flip count');
    }
    const record = twisters.get(orbit);
    if (!record) throw new Error(`No certified pair twister for orbit ${orbit}`);
    const baseWord = resolve(record.word); const baseAction = fullAction(baseWord);
    if (baseAction.size !== 2 || [...baseAction].some(([s, [t]]) => s !== t || group.orbitOf[s] !== orbit)) throw new Error('Invalid pair-twister certificate');
    const transport = new MengerPairTransport(group, orbit, [...baseAction.keys()], baseWord, false);
    while (true) {
      for (const s of sites) clearRoll(s);
      const unsolved = sites.filter((s) => state.rotation[s] !== ROT_ID);
      if (!unsolved.length) break;
      if (unsolved.length < 2) throw new Error('Joint orientation invariant left one defect');
      const pair = unsolved.slice(0, 2); const word = transport.wordFor(pair);
      if (order === 3) {
        const delta = actionOver(word, pair).get(pair[0]!)?.[1];
        if (delta === undefined) throw new Error('Pair word does not twist the first cell');
        let r = state.rotation[pair[0]!]!; let repetitions = 0;
        do { r = rotMul[delta]![r]!; repetitions++; } while (r !== ROT_ID && repetitions < 3);
        if (repetitions >= 3) throw new Error('C3 pair word cannot clear its first cell');
        for (let i = 0; i < repetitions; i++) emitPure(word, pair);
      } else {
        emitPure(word, pair);
        if (!clearRoll(pair[0]!) || !clearRoll(pair[1]!)) throw new Error('D4 pair word did not remove both flips');
      }
    }
    setupSearchNodes += transport.visitedStates;
  }
  mark('certified orientation completion');
  if (state.siteOf.some((s, p) => s !== p) || state.rotation.some((r) => r !== ROT_ID)) throw new Error('Reduction did not exactly solve the state');
  progress?.(`Replaying all ${emitted.length} raw atoms independently`);
  const replay = rawReplay(group, input, emitted, progress);
  if (replay.state.siteOf.some((s, p) => s !== p) || replay.state.rotation.some((r) => r !== ROT_ID)) throw new Error('Independent raw-atom replay did not exactly solve the state');
  mark('independent raw-atom replay');
  return { atoms: emitted, placements, setupSearchNodes, replaySelectedEntries: replay.selectedEntries, phases };
};

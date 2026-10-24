import type { MengerPuzzleState } from '@menger/engine';
import type { SolverAlgorithm, SolverMove } from '../algorithm/types';
import type { PuzzleModel } from '../model/puzzleModel';
import { allBlockRotations, applyMatrixToVector } from './blockRotations';
import { createSparseGroup, type SparseGroup, type SparseAtom } from './mengerSparseGroup';
import { level2BlockQuotientAlgorithm } from './level2BlockQuotientSolver';
import { level2CertifiedAlgorithm } from './level2CertifiedSolver';
import { progressForCubies, stateKey } from './level1State';

const block = (p: readonly number[]) => p.map(v => Math.floor((v + 4) / 3) - 1);
const offset = (p: readonly number[]) => p.map((v, i) => v - 3 * block(p)[i]!);
const key = (p: ArrayLike<number>) => Array.from(p).join(',');
let cached: ReturnType<typeof buildLibrary> | undefined;
function buildLibrary() {
  const group = createSparseGroup(2);
  const regions = [...new Set(group.sites.map(p => key(block(p))))];
  const homes = group.sites.map(p => regions.indexOf(key(block(p))));
  // A vote is a candidate rigid transform: (destination block, cube rotation).
  // Different pieces of one home block must agree on the SAME transform.
  const fits = group.sites.map(p => group.sites.map(q => {
    const dest = regions.indexOf(key(block(q)));
    return allBlockRotations.flatMap((r, ri) =>
      key(applyMatrixToVector(r.matrix, offset(p) as [number, number, number])) === key(offset(q)) ? [dest * 24 + ri] : []);
  }));
  const score = (positions: Int32Array) => {
    const counts = new Uint8Array(20 * 480);
    const best = new Uint8Array(20);
    positions.forEach((site, piece) => {
      const home = homes[piece]!;
      for (const fit of fits[piece]![site]!) {
        const at = home * 480 + fit;
        counts[at] = counts[at]! + 1;
        best[home] = Math.max(best[home]!, counts[at]!);
      }
    });
    return 400 - best.reduce((a, b) => a + b, 0);
  };
  const atoms = group.atoms.filter(a => [...a.map].some(([s, t]) => s !== t));
  return { group, score, atoms };
}

/** Such an atom maps every spatial block rigidly onto a block, so it preserves
 * positional block rigidity for every input rigid state, not just solved input. */
export function level2RigidityPreservingMoves(): SolverMove[] {
  const { group, score } = cached ??= buildLibrary();
  return group.atoms.filter(a => score(Int32Array.from({ length: 400 }, (_, s) => a.map.get(s) ?? s)) === 0).map(a => a.move);
}

export interface RestorationOptions { depth?: number; width?: number; maxNodes?: number }
export interface RestorationSearch {
  moves: SolverMove[]; restored: boolean; initialDefect: number; finalDefect: number;
  expanded: number; multiRegionMoves: number;
}
/** State-only positional beam search. Zero defect means all 20 blocks are rigid,
 * not necessarily home. Budgets affect this fast path, never the certified fallback. */
export function searchLevel2BlockRestoration(state: MengerPuzzleState, options: RestorationOptions = {}): RestorationSearch {
  if (state.level !== 2 || state.moveSystem === 'inner-square') throw new Error('Standard Level 2 required');
  const { group, score, atoms } = cached ??= buildLibrary();
  const positions = new Int32Array(400).fill(-1);
  for (const c of state.cubies) {
    const home = group.siteAt(c.homePosition); const site = group.siteAt(c.currentPosition);
    if (home < 0 || site < 0 || positions[home] !== -1) throw new Error('Invalid cell placement');
    positions[home] = site;
  }
  if (positions.includes(-1) || new Set(positions).size !== 400) throw new Error('Non-bijective placement');
  type Node = { positions: Int32Array; word: SparseAtom[]; defect: number };
  const initialDefect = score(positions);
  let beam: Node[] = [{ positions, word: [], defect: initialDefect }];
  const seen = new Set([key(positions)]);
  let expanded = 0; let best = beam[0]!;
  outer: for (let depth = 0; best.defect > 0 && depth < (options.depth ?? 4); depth++) {
    const next: Node[] = [];
    for (const node of beam) for (const atom of atoms) {
      if (node.word.at(-1)?.refId === atom.refId) continue;
      if (expanded >= (options.maxNodes ?? 10000)) break outer;
      expanded++;
      const moved = node.positions.map(s => atom.map.get(s) ?? s);
      const fingerprint = key(moved);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      const child = { positions: moved, word: [...node.word, atom], defect: score(moved) };
      if (child.defect < best.defect) best = child;
      if (!child.defect) { best = child; break outer; }
      next.push(child);
    }
    next.sort((a, b) => a.defect - b.defect);
    beam = next.slice(0, options.width ?? 12);
    if (!beam.length) break;
  }
  const restored = best.defect === 0;
  const word = restored ? best.word : [];
  return { moves: word.map(a => a.move), restored, initialDefect, finalDefect: best.defect, expanded,
    multiRegionMoves: word.filter(a => new Set([...a.map].filter(([s, t]) => s !== t).map(([s]) => key(block(group.sites[s]!)))).size > 1).length };
}

/** Disjoint selected-site supports imply commutation, including orientations.
 * Move equal targets together only across this sufficient commuting condition. */
export function shortenLevel2Word(group: SparseGroup, input: readonly SolverMove[]): SolverMove[] {
  const lookup = new Map(group.atoms.map(a => [`${a.move.targetId}:${a.angle}`, a]));
  const out: SolverMove[] = [];
  for (const move of input) {
    const atom = lookup.get(`${move.targetId}:${move.angle}`);
    let merged = false;
    if (atom) for (let j = out.length - 1; j >= Math.max(0, out.length - 64); j--) {
      const previous = out[j]!;
      if (previous.targetId === move.targetId) {
        const angle = ((previous.angle + move.angle) % 360 + 360) % 360;
        if (!angle) out.splice(j, 1);
        else {
          const replacement = lookup.get(`${move.targetId}:${angle === 270 ? -90 : angle}`);
          if (!replacement) break;
          out[j] = replacement.move;
        }
        merged = true; break;
      }
      const other = lookup.get(`${previous.targetId}:${previous.angle}`);
      if (!other || [...atom.map.keys()].some(s => other.map.has(s))) break;
    }
    if (!merged) out.push(move);
  }
  return out;
}

export const level2BlockRestorationAlgorithm: SolverAlgorithm<MengerPuzzleState, SolverMove> = {
  id: 'level2-block-restoration', name: 'Level 2 block restoration with certified completion',
  version: '0.1.0', levelsSupported: [2],
  async solve(model: PuzzleModel<MengerPuzzleState, SolverMove>, state: MengerPuzzleState) {
    const start = performance.now();
    let search: RestorationSearch | undefined;
    let current = state;
    if (state.level === 2 && state.moveSystem !== 'inner-square') {
      try { search = searchLevel2BlockRestoration(state); } catch { /* Certified solver diagnoses invalid states. */ }
    }
    const prefix = search?.moves ?? [];
    for (const move of prefix) {
      if (!model.isMoveLegal(current, move)) throw new Error('Illegal restoration move');
      current = model.applyMove(current, move);
    }
    let result = search?.restored ? await level2BlockQuotientAlgorithm.solve(model, current) : undefined;
    const quotient = result?.success ?? false;
    if (!result?.success) result = await level2CertifiedAlgorithm.solve(model, current);
    const raw = [...prefix, ...result.output_moves];
    const output = result.success && state.level === 2 && state.moveSystem !== 'inner-square'
      ? shortenLevel2Word((cached ??= buildLibrary()).group, raw) : raw;
    if (result.success) {
      let replay = state;
      for (const move of output) {
        if (!model.isMoveLegal(replay, move)) throw new Error('Illegal shortened move');
        replay = model.applyMove(replay, move);
      }
      if (!model.isSolved(replay)) throw new Error('Restoration replay failed');
    }
    return { ...result, name: this.name, version: this.version,
      input_state: { level: state.level, cubieCount: state.cubies.length, stateKey: stateKey(state.cubies, false), progress: progressForCubies(state.cubies) },
      output_moves: result.success ? output : [], move_count: result.success ? output.length : 0,
      runtime_ms: performance.now() - start,
      explanation: [{ phase: 'block restoration', objective: 'Restore rigid blocks before solving their quotient.',
        observation: JSON.stringify({ ...search, moves: prefix.length, quotient, beforeShortening: raw.length }), progress: progressForCubies(current.cubies) }, ...result.explanation],
      final_strategy: `Bounded positional block search; ${quotient ? 'block quotient' : 'certified'} completion; commuting cancellation.`,
    };
  },
};

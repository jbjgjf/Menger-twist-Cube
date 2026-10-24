import type { MengerPuzzleState } from '@menger/engine';
import type { SolverAlgorithm, SolverMove, SolverRunResult } from '../algorithm/types';
import type { PuzzleModel } from '../model/puzzleModel';
import { allBlockRotations } from './blockRotations';
import { level2BlockRestorationAlgorithm } from './level2BlockRestorationSolver';
import { level3SliceReductionAlgorithm } from './level3SliceReductionSolver';
import { level4SliceReductionAlgorithm, primeLevel4StateLegality } from './level4SliceReductionSolver';
import { blockGeometry, searchMengerBlockRestoration, type BlockSearchOptions } from './mengerBlockRestoration';
import { rawReplay, sparseStateOf, type SparsePuzzleState } from './mengerCertifiedReduction';
import { getCachedSparseGroup, rotMul, type SparseAtom, type SparseGroup } from './mengerSparseGroup';
import { progressForCubies, stateKey } from './level1State';

const materialize = (group: SparseGroup, state: SparsePuzzleState, template: MengerPuzzleState): MengerPuzzleState => ({
  ...template, cubies: group.canonical.cubies.map((c, piece) => ({ ...c,
    currentPosition: [...group.sites[state.siteOf[piece]!]!], orientation: allBlockRotations[state.rotation[piece]!]!.quaternion.clone() })),
});
const lookupAtom = (group: SparseGroup, move: SolverMove): SparseAtom => {
  const a = group.atomById.get(`${move.targetKind === 'frame' ? 'f' : 'e'}:${move.frameId ?? move.extensionTargetId}:${move.angle}`);
  if (!a) throw new Error(`Missing legal atom ${move.notation}`); return a;
};
/** Verify the lift on ALL leaf cells: block permutation, offset rotation and
 * orientation action. Mere agreement on target names is insufficient. */
export function liftAndCheckMacroAtom(group: SparseGroup, macro: SparseGroup, atom: SparseAtom): SparseAtom {
  let lifted: SparseAtom | undefined;
  if (atom.kind === 'frame') {
    const source = macro.canonical.frameById.get(atom.refId)!;
    const frame = group.canonical.frames.find(f => f.scale === source.scale * 3 && f.layer === source.layer * 3 && f.axisName === source.axisName);
    if (frame) lifted = group.atomById.get(`f:${frame.id}:${atom.angle}`);
  } else lifted = group.atomById.get(`e:${atom.refId}:${atom.angle}`);
  if (!lifted || lifted.rot !== atom.rot) throw new Error(`Cannot lift macro atom ${atom.id}`);
  const geometry = blockGeometry(group);
  for (let bi = 0; bi < geometry.members.length; bi++) {
    const macroSite = macro.siteAt(geometry.blocks[bi]!);
    const target = atom.map.get(macroSite) ?? macroSite;
    const selected = atom.map.has(macroSite);
    const destination = macro.sites[target]!;
    for (const site of geometry.members[bi]!) {
      const dest = lifted.map.get(site) ?? site;
      const actual = group.sites[dest]!;
      const home = group.sites[site]!;
      const offset = home.map((v, i) => v - 3 * geometry.blocks[bi]![i]!) as [number, number, number];
      const matrix = allBlockRotations[selected ? atom.rot : 0]!.matrix;
      const rotated = [0, 1, 2].map(i => matrix[3*i]! * offset[0] + matrix[3*i+1]! * offset[1] + matrix[3*i+2]! * offset[2]);
      if (lifted.map.has(site) !== selected || actual.some((v, i) => v !== 3 * destination[i]! + rotated[i]!)) throw new Error(`Lift mismatch ${atom.id}, site ${site}`);
    }
  }
  return lifted;
}

export function createHigherBlockRestorationAlgorithm(level: 3 | 4, options: BlockSearchOptions = {}): SolverAlgorithm<MengerPuzzleState, SolverMove> {
  const fallback = level === 3 ? level3SliceReductionAlgorithm : level4SliceReductionAlgorithm;
  return {
    id: `level${level}-block-restoration`, name: `Level ${level} hierarchical block restoration`, version: '0.1.0', levelsSupported: [level],
    scrambleMovePool: fallback.scrambleMovePool,
    async solve(model: PuzzleModel<MengerPuzzleState, SolverMove>, input: MengerPuzzleState): Promise<SolverRunResult> {
      const start = performance.now();
      if (input.level !== level || (input.moveSystem && input.moveSystem !== 'standard')) return fallback.solve(model, input);
      const group = getCachedSparseGroup(level);
      let original: SparsePuzzleState;
      try { original = sparseStateOf(group, input.cubies); } catch (error) {
        return { name: this.name, version: this.version, level_supported: [level], success: false,
          input_state: { level, cubieCount: input.cubies.length, stateKey: stateKey(input.cubies, false), progress: progressForCubies(input.cubies) },
          output_moves: [], move_count: 0, runtime_ms: performance.now() - start, explanation: [],
          final_strategy: 'Reject malformed state before restoration.', complexity_estimate: 'O(N) input validation.',
          notes: error instanceof Error ? error.message : String(error) };
      }
      const search = searchMengerBlockRestoration(group, original, options);
      const emitted = [...search.atoms];
      let current = rawReplay(group, original, emitted).state;
      let quotient = false; let completion: SolverRunResult | undefined; let quotientFailure: string | undefined;
      if (search.restored) {
        try {
          const geometry = blockGeometry(group); const placements = geometry.placements(current.siteOf);
          if (!placements) throw new Error('Zero defect did not yield rigid blocks');
          const macro = getCachedSparseGroup(level - 1);
          const byHome = new Map(geometry.blocks.map((b, i) => [b.join(','), i]));
          const macroState: MengerPuzzleState = { ...macro.canonical, cubies: macro.canonical.cubies.map(c => {
            const placement = placements[byHome.get(c.homePosition.join(','))!]!;
            return { ...c, currentPosition: [...geometry.blocks[placement.destination]!], orientation: allBlockRotations[placement.rotation]!.quaternion.clone() };
          }) };
          const macroSolver = level === 3 ? level2BlockRestorationAlgorithm : level3BlockRestorationAlgorithm;
          const result = await macroSolver.solve(model, macroState);
          if (!result.success) throw new Error(`Macro solve rejected projection: ${result.notes}`);
          const cache = new Map<string, SparseAtom>();
          const lifted = result.output_moves.map(m => {
            const atom = lookupAtom(macro, m); let lift = cache.get(atom.id);
            if (!lift) { lift = liftAndCheckMacroAtom(group, macro, atom); cache.set(atom.id, lift); }
            return lift;
          });
          current = rawReplay(group, current, lifted).state; emitted.push(...lifted); quotient = true;
        } catch (error) { quotientFailure = error instanceof Error ? error.message : String(error); }
      }
      // Cheap independent rolls first. Anything else goes to certified completion.
      if (current.siteOf.every((s, p) => s === p)) {
        const rolls: SparseAtom[] = [];
        current.rotation.forEach((r, piece) => {
          if (!r) return;
          const atom = group.atomsAt[piece]!.map(i => group.atoms[i]!).find(a => a.map.size === 1 && a.map.get(piece) === piece && rotMul[a.rot]![r] === 0);
          if (atom) rolls.push(atom);
        });
        if (rolls.length) { current = rawReplay(group, current, rolls).state; emitted.push(...rolls); }
      }
      const exactlySolved = () => current.siteOf.every((s, p) => s === p && current.rotation[p] === 0);
      if (!exactlySolved()) {
        completion = await fallback.solve(model, materialize(group, current, input));
        if (!completion.success) return { ...completion, name: this.name, version: this.version, runtime_ms: performance.now() - start,
          input_state: { level, cubieCount: group.N, stateKey: stateKey(input.cubies, false), progress: progressForCubies(input.cubies) } };
        emitted.push(...completion.output_moves.map(m => lookupAtom(group, m)));
      }
      // Independent replay from the original input includes every setup/lift/roll.
      const replay = rawReplay(group, original, emitted);
      if (!replay.state.siteOf.every((s, p) => s === p && replay.state.rotation[p] === 0)) throw new Error('Hierarchical solver replay failed');
      if (level === 4) primeLevel4StateLegality(group, input);
      const checked = new Set<string>();
      for (const atom of emitted) if (!checked.has(atom.id)) {
        if (!model.isMoveLegal(input, atom.move)) throw new Error(`Model rejects ${atom.id}`);
        checked.add(atom.id);
      }
      return { name: this.name, version: this.version, level_supported: [level], success: true,
        input_state: { level, cubieCount: group.N, stateKey: stateKey(input.cubies, false), progress: progressForCubies(input.cubies) },
        output_moves: emitted.map(a => a.move), move_count: emitted.length, runtime_ms: performance.now() - start,
        explanation: [{ phase: 'hierarchical restoration', objective: 'Restore leaf blocks, solve and check the lifted quotient, complete the residual.',
          observation: JSON.stringify({ ...search, atoms: search.atoms.length, quotient, quotientFailure, fallback: !!completion, selectedEntries: replay.selectedEntries }), progress: progressForCubies(group.canonical.cubies) }, ...(completion?.explanation ?? [])],
        final_strategy: 'Bounded incremental block restoration; checked recursive quotient; independent rolls; certified completion; independent sparse replay.',
        complexity_estimate: 'O(N) geometry and beam states; candidate work proportional to affected home blocks; completion cost inherited from fixed-level solver.',
        notes: 'Search is heuristic. Completeness is inherited at fixed Levels 3 and 4; no general-level completeness or diameter bound is claimed.',
      };
    },
  };
}
export const level3BlockRestorationAlgorithm = createHigherBlockRestorationAlgorithm(3);
export const level4BlockRestorationAlgorithm = createHigherBlockRestorationAlgorithm(4);

import type { MengerPuzzleState } from '@menger/engine';
import type { Vector3Tuple } from 'three';
import { allBlockRotations, applyMatrixToVector } from './blockRotations';
import { sparseStateOf, type SparsePuzzleState } from './mengerCertifiedReduction';
import { getCachedSparseGroup, type SparseAtom, type SparseGroup } from './mengerSparseGroup';

/** Balanced ternary p = 3b + o, o in {-1,0,1}^3. */
export const leafBlockOf = (p: Vector3Tuple): Vector3Tuple => p.map(v => Math.floor((v + 1) / 3)) as Vector3Tuple;
const key = (p: readonly number[]) => p.join(',');
const localSites = [-1, 0, 1].flatMap(x => [-1, 0, 1].flatMap(y => [-1, 0, 1].filter(z => [x, y, z].filter(v => v === 0).length <= 1).map(z => [x, y, z] as Vector3Tuple)));
const localIndex = new Map(localSites.map((p, i) => [key(p), i]));
const matching = localSites.map(p => localSites.map(q => allBlockRotations.flatMap((r, ri) => key(applyMatrixToVector(r.matrix, p)) === key(q) ? [ri] : [])));

export class MengerBlockGeometry {
  readonly region: Int32Array;
  readonly offset: Int8Array;
  readonly members: number[][] = [];
  readonly blocks: Vector3Tuple[] = [];
  readonly homeBlock: Int32Array;
  constructor(readonly group: SparseGroup) {
    this.region = new Int32Array(group.N); this.offset = new Int8Array(group.N);
    const regions = new Map<string, number>();
    group.sites.forEach((p, site) => {
      const b = leafBlockOf(p); const k = key(b);
      let bi = regions.get(k);
      if (bi === undefined) { bi = this.blocks.length; regions.set(k, bi); this.blocks.push(b); this.members.push([]); }
      this.region[site] = bi;
      this.offset[site] = localIndex.get(key(p.map((v, i) => v - 3 * b[i]!)))!;
      this.members[bi]!.push(site);
    });
    if (this.members.some(b => b.length !== 20)) throw new Error('Leaf-block partition is invalid');
    this.homeBlock = this.region;
  }
  /** Exact maximum agreement with one rigid placement of ONE home block. */
  agreement(positions: Int32Array, home: number, atom?: SparseAtom): number {
    const votes = new Map<number, number>(); let best = 0;
    for (const piece of this.members[home]!) {
      const original = positions[piece]!; const dest = atom?.map.get(original) ?? original;
      for (const ri of matching[this.offset[piece]!]![this.offset[dest]!]!) {
        const k = this.region[dest]! * 24 + ri;
        const count = (votes.get(k) ?? 0) + 1; votes.set(k, count); best = Math.max(best, count);
      }
    }
    return best;
  }
  agreements(positions: Int32Array): Uint8Array { return Uint8Array.from(this.members.map((_, bi) => this.agreement(positions, bi))); }
  /** Returns each block's destination and unique positional rotation, or undefined. */
  placements(positions: Int32Array): Array<{ destination: number; rotation: number }> | undefined {
    const used = new Set<number>(); const out = [];
    for (const members of this.members) {
      const first = members[0]!; const destination = this.region[positions[first]!]!;
      const rotation = matching[this.offset[first]!]![this.offset[positions[first]!]!]!.find(r =>
        members.every(piece => this.region[positions[piece]!] === destination && matching[this.offset[piece]!]![this.offset[positions[piece]!]!]!.includes(r)));
      if (rotation === undefined || used.has(destination)) return undefined;
      used.add(destination); out.push({ destination, rotation });
    }
    return out;
  }
}
const geometryCache = new WeakMap<SparseGroup, MengerBlockGeometry>();
export const blockGeometry = (group: SparseGroup): MengerBlockGeometry => {
  let geometry = geometryCache.get(group);
  if (!geometry) { geometry = new MengerBlockGeometry(group); geometryCache.set(group, geometry); }
  return geometry;
};
const boundCache = new WeakMap<SparseGroup, { maxDefectChange: number; certifiedPreservingAtoms: number }>();
/** Whole leaf blocks with one common offset rotation certify membership in the
 * positional block-permuting subgroup. Its right action preserves D on EVERY
 * state, including torn states. Other atoms obey the moved-piece Lipschitz bound. */
export function restorationDistanceBound(group: SparseGroup) {
  let cached = boundCache.get(group); if (cached) return cached;
  const geometry = blockGeometry(group);
  const counts = new Uint8Array(geometry.members.length), dest = new Int32Array(counts.length), consistent = new Uint8Array(counts.length);
  let maxDefectChange = 0, certifiedPreservingAtoms = 0;
  for (const atom of group.atoms) {
    const touched: number[] = []; let moved = 0;
    for (const [s,t] of atom.map) {
      if (s === t) continue; moved++;
      const home = geometry.region[s]!;
      if (!counts[home]) { touched.push(home); dest[home] = geometry.region[t]!; consistent[home] = 1; }
      counts[home] = counts[home]! + 1;
      if (dest[home] !== geometry.region[t] || !matching[geometry.offset[s]!]![geometry.offset[t]!]!.includes(atom.rot)) consistent[home] = 0;
    }
    const preserves = touched.every(home => counts[home] === 20 && consistent[home] === 1);
    if (preserves) certifiedPreservingAtoms++; else maxDefectChange = Math.max(maxDefectChange, moved);
    for (const home of touched) counts[home] = 0;
  }
  cached = { maxDefectChange, certifiedPreservingAtoms }; boundCache.set(group, cached); return cached;
}

export interface BlockSearchOptions { depth?: number; width?: number; maxNodes?: number }
export interface BlockSearchResult {
  atoms: SparseAtom[]; restored: boolean; initialDefect: number; bestDefect: number;
  expanded: number; blockEvaluations: number;
  distanceLowerBound?: number; maxDefectChange?: number; certifiedDepthRejection?: boolean;
}
/** Candidate evaluation visits only home blocks touched by the atom. It does not
 * build an N-by-N compatibility table or clone an N-cell state per candidate. */
export function searchMengerBlockRestoration(group: SparseGroup, input: SparsePuzzleState, options: BlockSearchOptions = {}): BlockSearchResult {
  const geometry = blockGeometry(group);
  const agreements = geometry.agreements(input.siteOf);
  const initialDefect = group.N - agreements.reduce((a, b) => a + b, 0);
  type Node = { positions: Int32Array; pieces: Int32Array; agreements: Uint8Array; defect: number; word: SparseAtom[] };
  let beam: Node[] = [{ positions: input.siteOf, pieces: input.pieceAt, agreements, defect: initialDefect, word: [] }];
  const depthLimit = options.depth ?? 3; const width = options.width ?? 2; const maxNodes = options.maxNodes ?? 30000;
  if (![depthLimit, width, maxNodes].every(Number.isInteger) || depthLimit < 0 || width < 1 || maxNodes < 0) throw new Error('Invalid restoration budgets');
  const stamps = new Int32Array(geometry.members.length); let stamp = 0;
  let expanded = 0; let blockEvaluations = 0; let bestDefect = initialDefect;
  if (!initialDefect) return { atoms: [], restored: true, initialDefect, bestDefect, expanded, blockEvaluations };
  const { maxDefectChange } = restorationDistanceBound(group);
  const distanceLowerBound = maxDefectChange ? Math.ceil(initialDefect / maxDefectChange) : Infinity;
  if (distanceLowerBound > depthLimit) return { atoms: [], restored: false, initialDefect, bestDefect, expanded, blockEvaluations,
    distanceLowerBound, maxDefectChange, certifiedDepthRejection: true };
  for (let depth = 0; depth < depthLimit; depth++) {
    const candidates: Array<{ parent: Node; atom: SparseAtom; defect: number; affected: number[]; agreement: number[] }> = [];
    for (const parent of beam) for (const atom of group.atoms) {
      if (expanded >= maxNodes) break;
      if (parent.word.at(-1)?.refId === atom.refId) continue;
      const affected: number[] = [];
      if (++stamp === 0x7fffffff) { stamps.fill(0); stamp = 1; }
      for (const [s, t] of atom.map) {
        if (s === t) continue;
        const bi = geometry.homeBlock[parent.pieces[s]!]!;
        if (stamps[bi] !== stamp) { stamps[bi] = stamp; affected.push(bi); }
      }
      if (!affected.length) continue;
      expanded++;
      let defect = parent.defect;
      const agreement = affected.map(bi => {
        blockEvaluations++; const value = geometry.agreement(parent.positions, bi, atom);
        defect += parent.agreements[bi]! - value; return value;
      });
      bestDefect = Math.min(bestDefect, defect);
      const candidate = { parent, atom, defect, affected, agreement };
      if (!defect) return { atoms: [...parent.word, atom], restored: true, initialDefect, bestDefect, expanded, blockEvaluations, distanceLowerBound, maxDefectChange };
      // Store only the bounded beam, not every candidate's arrays.
      if (candidates.length < width || defect < candidates[candidates.length - 1]!.defect) {
        candidates.push(candidate); candidates.sort((a, b) => a.defect - b.defect); candidates.length = Math.min(width, candidates.length);
      }
    }
    if (!candidates.length || expanded >= maxNodes) break;
    beam = candidates.map(({ parent, atom, defect, affected, agreement }) => {
      const positions = parent.positions.slice(); const pieces = parent.pieces.slice(); const scores = parent.agreements.slice();
      for (const [s, t] of atom.map) { const piece = parent.pieces[s]!; positions[piece] = t; pieces[t] = piece; }
      affected.forEach((bi, i) => { scores[bi] = agreement[i]!; });
      return { positions, pieces, agreements: scores, defect, word: [...parent.word, atom] };
    });
  }
  return { atoms: [], restored: false, initialDefect, bestDefect, expanded, blockEvaluations, distanceLowerBound, maxDefectChange };
}

export function inspectMengerBlocks(state: MengerPuzzleState): { defect: number; blocks: number } {
  const group = getCachedSparseGroup(state.level, state.moveSystem ?? 'standard'); const input = sparseStateOf(group, state.cubies);
  const geometry = blockGeometry(group);
  return { defect: group.N - geometry.agreements(input.siteOf).reduce((a, b) => a + b, 0), blocks: geometry.members.length };
}

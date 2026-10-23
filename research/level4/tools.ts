import {
  actionOver, inverseAtom, inverseWord, ROT_ID, rotInv, rotMul,
  type SparseAction, type SparseAtom, type SparseGroup,
} from '../../packages/solver-core/src/algorithms/mengerSparseGroup';

export interface Tool { word: SparseAtom[]; action: SparseAction }
export const inverseAction = (a: SparseAction): SparseAction => new Map([...a].map(([s, [t, r]]) => [t, [s, rotInv[r]!]]));
export const actionKey = (a: SparseAction): string => [...a].sort((x, y) => x[0] - y[0]).map(([s, [t, r]]) => `${s}>${t}#${r}`).join(';');
export const permutationKey = (a: SparseAction): string => [...a].filter(([s, [t]]) => s !== t).sort((x, y) => x[0] - y[0]).map(([s, [t]]) => `${s}>${t}`).join(';');
export const composeActions = (...actions: SparseAction[]): SparseAction => {
  const support = new Set(actions.flatMap((a) => [...a.keys()]));
  const result: SparseAction = new Map();
  for (const s of support) {
    let t = s; let r = ROT_ID;
    for (const a of actions) { const p = a.get(t); if (p) { t = p[0]; r = rotMul[p[1]]![r]!; } }
    if (s !== t || r !== ROT_ID) result.set(s, [t, r]);
  }
  return result;
};
export const commutatorAction = (a: SparseAction, b: SparseAction): SparseAction => {
  const ai = inverseAction(a); const bi = inverseAction(b);
  const support = new Set(b.keys());
  for (const s of b.keys()) support.add(ai.get(s)?.[0] ?? s);
  const result: SparseAction = new Map();
  for (const s of support) {
    let t = s; let r = ROT_ID;
    for (const map of [a, b, ai, bi]) { const p = map.get(t); if (p) { t = p[0]; r = rotMul[p[1]]![r]!; } }
    if (s !== t || r !== ROT_ID) result.set(s, [t, r]);
  }
  return result;
};
export const conjugateAction = (group: SparseGroup, a: SparseAction, setup: SparseAtom): SparseAction => {
  const inv = inverseAtom(group, setup);
  const result: SparseAction = new Map();
  for (const [s, [t, r]] of a) {
    const from = inv.map.get(s) ?? s; const to = inv.map.get(t) ?? t;
    const preRot = setup.map.has(from) ? setup.rot : ROT_ID;
    const postRot = inv.map.has(t) ? inv.rot : ROT_ID;
    result.set(from, [to, rotMul[postRot]![rotMul[r]![preRot]!]!]);
  }
  return result;
};
export const simplifyWord = (group: SparseGroup, word: SparseAtom[]): SparseAtom[] => {
  const out: SparseAtom[] = [];
  for (const a of word) {
    const last = out[out.length - 1];
    if (!last || last.kind !== a.kind || last.refId !== a.refId) { out.push(a); continue; }
    out.pop();
    const q = ((last.angle + a.angle) / 90 + 8) % 4;
    if (!q) continue;
    const angle = q === 3 ? -90 : q === 2 ? 180 : 90;
    out.push(group.atomById.get(`${a.kind === 'frame' ? 'f' : 'e'}:${a.refId}:${angle}`)!);
  }
  return out;
};
const commutator = (group: SparseGroup, a: Tool, b: Tool): Tool => ({
  action: commutatorAction(a.action, b.action),
  word: simplifyWord(group, [...a.word, ...b.word, ...inverseWord(group, a.word), ...inverseWord(group, b.word)]),
});
export const isPure = (group: SparseGroup, orbit: number, action: SparseAction): boolean =>
  action.size >= 3 && [...action].every(([s, [t]]) => s !== t && group.orbitOf[s] === orbit);
export const isThreeCycle = (group: SparseGroup, orbit: number, action: SparseAction): boolean =>
  action.size === 3 && isPure(group, orbit, action);

export const alphabetFor = (group: SparseGroup, orbit: number, withRotations = false): SparseAtom[] => {
  const ids = new Set(group.orbits[orbit]!.flatMap((s) => group.atomsAt[s]!));
  const seen = new Set<string>(); const result: SparseAtom[] = [];
  for (const ai of [...ids].sort((a, b) => a - b)) {
    const a = group.atoms[ai]!;
    const key = group.orbits[orbit]!.flatMap((s) => {
      const t = a.map.get(s);
      return t === undefined || (!withRotations && t === s) ? [] : [`${s}>${t}${withRotations ? `#${a.rot}` : ''}`];
    }).join(';');
    if (!key || seen.has(key)) continue;
    seen.add(key); result.push(a);
  }
  return result;
};

interface Candidate { word: SparseAtom[]; support: number[] }
export const findLocalTools = (group: SparseGroup, orbit: number, limit: number, conjugates = false, maxLocalWidth = 3): Tool[] => {
  const sites = group.orbits[orbit]!;
  const ids = new Set(sites.flatMap((s) => group.atomsAt[s]!));
  const touching = [...ids].sort((a, b) => a - b).map((i) => group.atoms[i]!);
  const pool: Candidate[] = [];
  for (const a of touching) {
    const support = sites.filter((s) => a.map.has(s) && a.map.get(s) !== s);
    if (support.length && support.length <= 24) pool.push({ word: [a], support });
  }
  if (conjugates) {
    const extra: Candidate[] = [];
    for (const g of touching.filter((a) => a.kind === 'frame')) for (const h of touching) {
      if (g.refId === h.refId) continue;
      const support = sites.filter((s) => { const t = g.map.get(s) ?? s; return h.map.has(t) && h.map.get(t) !== t; });
      if (support.length && support.length <= 8) extra.push({ word: [g, h, inverseAtom(group, g)], support });
    }
    extra.sort((a, b) => a.support.length - b.support.length);
    pool.push(...extra.slice(0, 4000));
  }
  const bySite = new Map<number, number[]>();
  pool.forEach((c, i) => { for (const s of c.support) { const list = bySite.get(s) ?? []; list.push(i); bySite.set(s, list); } });
  const found: Tool[] = []; const seen = new Set<string>();
  const visited = new Set<number>();
  for (const maxShared of [1, 3]) for (const s of sites) {
    const list = bySite.get(s) ?? [];
    for (let ix = 0; ix < list.length; ix++) for (let iy = ix + 1; iy < list.length; iy++) {
      const i = Math.min(list[ix]!, list[iy]!); const j = Math.max(list[ix]!, list[iy]!);
      const pair = i * pool.length + j;
      if (visited.has(pair)) continue;
      const a = pool[i]!; const b = pool[j]!;
      const shared = a.support.filter((v) => b.support.includes(v)).length;
      if (shared < 1 || shared > maxShared) continue;
      visited.add(pair);
      const word = [...a.word, ...b.word, ...inverseWord(group, a.word), ...inverseWord(group, b.word)];
      const restricted = actionOver(word, sites);
      if (restricted.size < 3 || restricted.size > maxLocalWidth || [...restricted].some(([x, [t]]) => x === t)) continue;
      const key = maxLocalWidth === 3 ? [...restricted.keys()].sort((x, y) => x - y).join(',') : permutationKey(restricted);
      if (seen.has(key)) continue;
      seen.add(key);
      // The smaller B gives the smaller proven commutator support.
      const aw = a.word; const bw = b.word;
      const bSupport = new Set(bw.flatMap((g) => [...g.map.keys()]));
      const candidates = new Set(bSupport);
      for (const x of bSupport) {
        let t = x;
        for (const g of inverseWord(group, aw)) t = g.map.get(t) ?? t;
        candidates.add(t);
      }
      const action = actionOver(word, candidates);
      const tool = { word: simplifyWord(group, word), action };
      found.push(tool);
      if (isThreeCycle(group, orbit, action)) return [tool];
      if (found.length >= limit) return found;
    }
    if (found.length && maxShared === 3) return found;
  }
  return found;
};

export const isolate = (group: SparseGroup, orbit: number, local: Tool[], maxRungs = 5, beamWidth = 32): Tool | null => {
  const seeds = local.slice().sort((a, b) => a.action.size - b.action.size || a.word.length - b.word.length);
  for (const t of seeds) if (isPure(group, orbit, t.action)) return t;
  // Interchange candidates with exactly one shared cell globally.
  const small = seeds.slice(0, 200);
  for (let i = 0; i < small.length; i++) for (let j = i + 1; j < small.length; j++) {
    let count = 0; let shared = -1;
    for (const s of small[i]!.action.keys()) if (small[j]!.action.has(s)) { shared = s; if (++count > 1) break; }
    if (count !== 1 || group.orbitOf[shared] !== orbit) continue;
    const tool = commutator(group, small[i]!, small[j]!);
    if (isPure(group, orbit, tool.action)) return tool;
  }
  let beam = seeds.slice(0, beamWidth);
  for (let rung = 0; rung < maxRungs; rung++) {
    const next = new Map<string, Tool>();
    for (const t of beam) {
      const target = [...t.action.keys()].filter((s) => group.orbitOf[s] === orbit);
      const setups = new Set(target.flatMap((s) => group.atomsAt[s]!));
      for (const ai of setups) {
        const g = group.atoms[ai]!;
        const gi = inverseAtom(group, g);
        const overlap = target.filter((s) => t.action.has(g.map.get(s) ?? s)).length;
        if (!overlap || overlap === target.length) continue;
        const conjugate = conjugateAction(group, t.action, g);
        const action = commutatorAction(t.action, conjugate);
        if (!action.size || action.size >= t.action.size) continue;
        if ([...action].filter(([s, [to]]) => s !== to && group.orbitOf[s] === orbit).length < 3) continue;
        const word = simplifyWord(group, [...t.word, g, ...t.word, gi, ...inverseWord(group, t.word), g, ...inverseWord(group, t.word), gi]);
        const tool = { word, action };
        if (isPure(group, orbit, action)) return tool;
        const key = actionKey(action);
        const old = next.get(key);
        if (!old || word.length < old.word.length) next.set(key, tool);
      }
    }
    beam = [...next.values()].sort((a, b) => a.action.size - b.action.size || a.word.length - b.word.length).slice(0, beamWidth);
    if (!beam.length) break;
  }
  return null;
};

/** A singleton intersection of two conjugate supports makes a pure 3-cycle. */
export const narrowToThreeCycle = (group: SparseGroup, orbit: number, base: Tool): Tool | null => {
  if (isThreeCycle(group, orbit, base.action)) return base;
  const alphabet = alphabetFor(group, orbit);
  const queue = [{ ...base, setup: [] as SparseAtom[] }];
  const seen = new Set([actionKey(base.action)]);
  for (let cursor = 0; cursor < queue.length && cursor < 4000; cursor++) {
    const from = queue[cursor]!;
    for (const g of alphabet) {
      const action = conjugateAction(group, from.action, g);
      const key = actionKey(action);
      if (seen.has(key)) continue;
      seen.add(key);
      const overlap = [...base.action.keys()].filter((s) => action.has(s)).length;
      const word = [g, ...from.word, inverseAtom(group, g)];
      if (overlap === 1) {
        const result = commutator(group, base, { word, action });
        if (isThreeCycle(group, orbit, result.action)) return result;
      }
      queue.push({ word, action, setup: [] });
    }
  }
  return null;
};

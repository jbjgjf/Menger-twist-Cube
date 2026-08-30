/**
 * Shared tool discovery for the Level 3 orbits.
 *
 * Both the step-2 inventory and the step-3 twist search need the *same* search,
 * and reproducing it twice already produced one silently wrong result (a quick
 * reimplementation dropped the conjugate pool and reported zero tools where the
 * inventory had found hundreds). It lives here once instead.
 *
 * Two grades, as step 2 established:
 *   orbit-local   a 3-cycle on the target orbit that disturbs cells elsewhere;
 *                 4 atoms from bare atoms, 8 with a conjugate.
 *   globally pure a 3-cycle and nothing else anywhere, obtained by interchanging
 *                 two orbit-local tools that meet in exactly one cell overall.
 */
import {
  ROT_ID, actionOver, atoms, atomsOfFamily, commutatorCandidates, commutatorWord,
  inverseAtom, N, type Atom,
} from './l3sim';

export interface OrbitLocalTool { word: Atom[]; cycle: number[]; gsup: number[] }
export interface PureTool { word: Atom[]; src: number[]; dst: number[]; rots: number[] }

interface TightTool {
  word: Atom[];
  action: ReturnType<typeof actionOver>;
  support: number[];
}

const frames = atomsOfFamily('frame-s1', 'frame-s3', 'frame-s9');
const scratchMask = new Uint8Array(N);

interface Cand { word: Atom[]; sup: number[] }

const buildPool = (sites: number[], mask: Uint8Array, withConjugates: boolean): Cand[] => {
  const pool: Cand[] = [];
  for (const a of atoms) {
    const sup: number[] = [];
    for (const [from, to] of a.map) if (from !== to && mask[from]) sup.push(from);
    if (sup.length >= 1 && sup.length <= 24) pool.push({ word: [a], sup });
  }
  if (!withConjugates) return pool;
  const touching = atoms.filter((h) => {
    for (const [from, to] of h.map) if (from !== to && mask[from]) return true;
    return false;
  });
  const conj: Cand[] = [];
  for (const g of frames) {
    const gInv = inverseAtom(g);
    for (const h of touching) {
      if (g.refId === h.refId) continue;
      const sup: number[] = [];
      for (const s of sites) {
        const gs = g.map.get(s) ?? s;
        const hgs = h.map.get(gs);
        if (hgs !== undefined && hgs !== gs) sup.push(s);
      }
      if (sup.length >= 1 && sup.length <= 8) conj.push({ word: [g, h, gInv], sup });
    }
  }
  conj.sort((a, b) => a.sup.length - b.sup.length);
  pool.push(...conj.slice(0, 4000));
  return pool;
};

/**
 * 3-cycles on `sites`, allowed to disturb cells outside it.
 *
 * `shared` counts how many cells of the orbit two candidates have in common. One
 * shared cell *guarantees* a 3-cycle, which is why the cheap sweep runs first;
 * two or three produce them often enough to be worth the action computation when
 * the cheap sweep comes up empty.
 */
export const findOrbitLocalTools = (sites: number[], limit: number): OrbitLocalTool[] => {
  const mask = scratchMask;
  mask.fill(0);
  for (const s of sites) mask[s] = 1;

  const search = (pool: Cand[]): OrbitLocalTool[] => {
    const found: OrbitLocalTool[] = [];
    const seen = new Set<string>();
    const bySite = new Map<number, number[]>();
    pool.forEach((c, i) => { for (const s of c.sup) { const l = bySite.get(s) ?? []; l.push(i); bySite.set(s, l); } });
    for (const maxShared of [1, 3]) {
      for (const site of sites) {
        const list = bySite.get(site) ?? [];
        for (let x = 0; x < list.length; x += 1) {
          for (let y = x + 1; y < list.length; y += 1) {
            const A = pool[list[x]!]!; const B = pool[list[y]!]!;
            let sh = 0;
            for (const s of A.sup) { if (B.sup.includes(s)) { sh += 1; if (sh > maxShared) break; } }
            if (sh < 1 || sh > maxShared) continue;
            if (maxShared === 3 && sh === 1) continue; // already swept
            const word = commutatorWord(A.word, B.word);
            const action = actionOver(word, commutatorCandidates(A.word, B.word));
            const cycle: number[] = []; const gsup: number[] = [];
            let ok = true;
            for (const [s, [to, rot]] of action.moves) {
              if (to !== s || rot !== ROT_ID) gsup.push(s);
              if (!mask[s]) continue;
              if (to === s) { if (rot !== ROT_ID) { ok = false; break; } continue; }
              cycle.push(s);
              if (cycle.length > 3) { ok = false; break; }
            }
            if (!ok || cycle.length !== 3) continue;
            const perm = new Map(cycle.map((s) => [s, action.moves.get(s)![0]]));
            let cur = cycle[0]!;
            for (let k = 0; k < 3; k += 1) cur = perm.get(cur)!;
            if (cur !== cycle[0]!) continue;
            const key = cycle.slice().sort((p, q) => p - q).join(',');
            if (seen.has(key)) continue;
            seen.add(key);
            found.push({ word, cycle, gsup });
            if (found.length >= limit) return found;
          }
        }
      }
      if (found.length > 0) break;
    }
    return found;
  };

  const cheap = search(buildPool(sites, mask, false));
  return cheap.length > 0 ? cheap : search(buildPool(sites, mask, true));
};

/**
 * Globally pure 3-cycles on `sites`, by interchanging two orbit-local tools that
 * meet in exactly one cell — which must lie in the orbit, since the interchange
 * 3-cycles the orbit of the shared cell.
 */
export const findPureTools = (sites: number[], local: OrbitLocalTool[], limit: number): PureTool[] => {
  const mask = scratchMask;
  mask.fill(0);
  for (const s of sites) mask[s] = 1;

  const seeds = [...local].sort((a, b) => a.gsup.length - b.gsup.length).slice(0, 400);
  const out: PureTool[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < seeds.length && out.length < limit; i += 1) {
    for (let j = i + 1; j < seeds.length && out.length < limit; j += 1) {
      let sh = 0;
      let shared = -1;
      for (const s of seeds[i]!.gsup) { if (seeds[j]!.gsup.includes(s)) { sh += 1; shared = s; if (sh > 1) break; } }
      if (sh !== 1 || !mask[shared]) continue;
      const word = commutatorWord(seeds[i]!.word, seeds[j]!.word);
      const action = actionOver(word, commutatorCandidates(seeds[i]!.word, seeds[j]!.word));
      const src: number[] = []; const dst: number[] = []; const rots: number[] = [];
      let ok = true;
      for (const [s, [to, rot]] of action.moves) {
        if (to === s) { if (rot !== ROT_ID) { ok = false; break; } continue; }
        src.push(s); dst.push(to); rots.push(rot);
        if (src.length > 3) { ok = false; break; }
      }
      if (!ok || src.length !== 3) continue;
      if (src.some((s) => !mask[s])) continue;
      const key = src.map((s, k) => `${s}>${dst[k]}#${rots[k]}`).sort().join(';');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ word, src, dst, rots });
    }
  }
  return out;
};

/**
 * Isolate a globally pure tool by repeatedly commuting a target-local tool with
 * a raw-atom conjugate of itself: `[T, g T g^-1]`.
 *
 * The first orbit-local inventory stopped after interchanging two candidates.
 * On the 40 blocking Level 3 orbits that leaves structured side effects on one
 * or more other orbits.  A raw atom generally moves the target support and the
 * side-effect support differently, so the self-conjugate commutator cancels the
 * latter while retaining an even permutation on the target.  A small beam keeps
 * only strict support improvements between rungs.
 *
 * The result is deliberately a general even permutation, not only a 3-cycle:
 * double transpositions and wider tools are equally usable by placement.
 */
export const findConjugateIsolatedTools = (
  sites: number[],
  local: OrbitLocalTool[],
  limit: number,
  maxRungs = 3,
  beamWidth = 96,
): PureTool[] => {
  const mask = scratchMask;
  mask.fill(0);
  for (const site of sites) mask[site] = 1;

  const supportOf = (action: ReturnType<typeof actionOver>): number[] =>
    [...action.moves]
      .filter(([site, [to, rot]]) => site !== to || rot !== ROT_ID)
      .map(([site]) => site);
  const profileOf = (action: ReturnType<typeof actionOver>): string =>
    [...action.moves]
      .map(([site, [to, rot]]) => `${site}>${to}#${rot}`)
      .sort()
      .join(';');
  const asPure = (tool: TightTool): PureTool | null => {
    const src: number[] = [];
    const dst: number[] = [];
    const rots: number[] = [];
    for (const [site, [to, rot]] of tool.action.moves) {
      if (to === site) {
        if (rot !== ROT_ID) return null;
        continue;
      }
      if (!mask[site]) return null;
      src.push(site);
      dst.push(to);
      rots.push(rot);
    }
    return src.length >= 3 ? { word: tool.word, src, dst, rots } : null;
  };

  const initial: TightTool[] = [];
  const seenInitial = new Set<string>();
  for (const candidate of [...local].sort((a, b) => a.gsup.length - b.gsup.length)) {
    const action = actionOver(candidate.word, candidate.gsup);
    const key = profileOf(action);
    if (seenInitial.has(key)) continue;
    seenInitial.add(key);
    initial.push({ word: candidate.word, action, support: supportOf(action) });
    if (initial.length >= beamWidth) break;
  }

  const out: PureTool[] = [];
  const outSeen = new Set<string>();
  let beam = initial;
  for (let rung = 0; rung < maxRungs && beam.length > 0; rung += 1) {
    const nextByProfile = new Map<string, TightTool>();
    for (const tool of beam) {
      const targetSupport = tool.support.filter((site) => mask[site]);
      const inverseDestination = new Map<number, number>();
      for (const [from, [to]] of tool.action.moves) inverseDestination.set(to, from);

      for (const setup of atoms) {
        const setupInv = inverseAtom(setup);
        const preimage = (site: number) => setupInv.map.get(site) ?? site;
        const conjugateSupport = tool.support.map(preimage);
        const conjugateTarget = targetSupport.map(preimage);
        const overlap = targetSupport.filter((site) => conjugateTarget.includes(site)).length;
        if (overlap === 0 || overlap === targetSupport.length) continue;

        const candidates = new Set<number>(conjugateSupport);
        for (const site of conjugateSupport) candidates.add(inverseDestination.get(site) ?? site);
        const conjugate = [setup, ...tool.word, inverseAtom(setup)];
        const word = commutatorWord(tool.word, conjugate);
        const action = actionOver(word, candidates);
        const support = supportOf(action);
        if (support.length === 0 || support.length >= tool.support.length) continue;
        let targetMoves = 0;
        for (const [site, [to]] of action.moves) if (mask[site] && to !== site) targetMoves += 1;
        if (targetMoves < 3) continue;

        const tightened: TightTool = { word, action, support };
        const pure = asPure(tightened);
        if (pure) {
          const key = profileOf(action);
          if (!outSeen.has(key)) {
            outSeen.add(key);
            out.push(pure);
            if (pure.src.length === 3) return [pure];
          }
        }

        const key = profileOf(action);
        const previous = nextByProfile.get(key);
        if (!previous || word.length < previous.word.length) nextByProfile.set(key, tightened);
      }
    }
    beam = [...nextByProfile.values()]
      .sort((a, b) => a.support.length - b.support.length || a.word.length - b.word.length)
      .slice(0, beamWidth);
  }
  return out.sort((a, b) => a.src.length - b.src.length || a.word.length - b.word.length).slice(0, limit);
};

/**
 * The complementary Level-2-style class-level family.  Interchanging tight
 * `[frame, depth-2/2.5]` seeds yields globally pure 3-cycles on a handful of
 * large orbits for which the orbit-local conjugation beam is not economical.
 */
export const findClassLevelPureTools = (
  orbitOfSite: Int16Array | Int32Array,
  wantedOrbits: Set<number>,
): Map<number, PureTool> => {
  const result = new Map<number, PureTool>();
  const frameAtoms = atomsOfFamily('frame-s1', 'frame-s3', 'frame-s9');
  const localAtoms = atomsOfFamily('ext-d2', 'ext-d2.5');
  interface Seed { word: Atom[]; support: number[] }
  const seeds: Seed[] = [];
  const seenSeed = new Set<string>();
  for (const frame of frameAtoms) {
    for (const local of localAtoms) {
      let touches = false;
      for (const site of local.map.keys()) {
        if (frame.map.has(site)) { touches = true; break; }
      }
      if (!touches) continue;
      const word = commutatorWord([frame], [local]);
      const action = actionOver(word, commutatorCandidates([frame], [local]));
      if (action.moves.size === 0 || action.moves.size > 9) continue;
      const support = [...action.moves.keys()].sort((a, b) => a - b);
      const key = support.map((site) => `${site}>${action.moves.get(site)![0]}#${action.moves.get(site)![1]}`).join(';');
      if (seenSeed.has(key)) continue;
      seenSeed.add(key);
      seeds.push({ word, support });
    }
  }

  const bySite = new Map<number, number[]>();
  seeds.forEach((seed, index) => {
    for (const site of seed.support) {
      const list = bySite.get(site) ?? [];
      list.push(index);
      bySite.set(site, list);
    }
  });
  for (let i = 0; i < seeds.length && result.size < wantedOrbits.size; i += 1) {
    const partners = new Set<number>();
    for (const site of seeds[i]!.support) {
      for (const j of bySite.get(site) ?? []) if (j > i) partners.add(j);
    }
    for (const j of partners) {
      const word = commutatorWord(seeds[i]!.word, seeds[j]!.word);
      const action = actionOver(word, commutatorCandidates(seeds[i]!.word, seeds[j]!.word));
      const src: number[] = [];
      const dst: number[] = [];
      const rots: number[] = [];
      let clean = true;
      for (const [site, [to, rot]] of action.moves) {
        if (to === site) {
          if (rot !== ROT_ID) { clean = false; break; }
          continue;
        }
        src.push(site); dst.push(to); rots.push(rot);
        if (src.length > 3) { clean = false; break; }
      }
      if (!clean || src.length !== 3) continue;
      const orbit = orbitOfSite[src[0]!]!;
      if (!wantedOrbits.has(orbit) || result.has(orbit)) continue;
      if (src.some((site) => orbitOfSite[site] !== orbit)) continue;
      result.set(orbit, { word, src, dst, rots });
      if (result.size === wantedOrbits.size) break;
    }
  }
  return result;
};

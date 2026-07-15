/**
 * Experiment 10: solver v2.
 * Phase order:
 *  1. CC positions  2. CE positions  3. CC orientation (twisters; edge junk OK)
 *  4. edge parity fixers  5. EC positions (auto-oriented)  6. EEa positions  7. EEo positions
 *  8. E2 rolls + edge twisters for CE/EEa/EEo orientation  9. verify
 */
import {
  Atom,
  atoms,
  atomsFor,
  actionOfWord,
  commutatorWord,
  inverseWord,
  N,
  ROT_ID,
  rotMul,
  rotInv,
  siteClasses,
  sitePositions,
  PieceClass,
} from './sim';

const posAtoms = atomsFor((a, t) => a.kind === 'frame' || (t !== undefined && t.depth !== 2));
const frameAtoms = atomsFor((a) => a.kind === 'frame');
const blockLocalAtoms = atomsFor((a, t) => a.kind === 'extension' && (t!.depth === 1 || t!.depth === 1.5));
const e2Atoms = atomsFor((a, t) => a.kind === 'extension' && t!.depth === 2);

const isCC = (i: number) => siteClasses[i] === 'CC';
const isCE = (i: number) => siteClasses[i] === 'CE';
const isCorner = (i: number) => isCC(i) || isCE(i);

// ---------- template library ----------
interface Template { word: Atom[]; cycle: [number, number, number]; rots: [number, number, number]; cls: PieceClass }
const templates: Template[] = [];

const addTemplateIfPure = (word: Atom[], scope: 'edge' | 'corner') => {
  const action = actionOfWord(word);
  const pos: number[] = [];
  for (let i = 0; i < N; i += 1) {
    if (action.perm[i] !== i && (scope === 'edge' || isCorner(i))) pos.push(i);
    if (pos.length > 3) return;
  }
  if (pos.length !== 3) return;
  const [a] = pos as [number, number, number];
  const cls = siteClasses[a]!;
  if (pos.some((s) => siteClasses[s] !== cls)) return;
  if (action.perm[action.perm[a]!] === a) return;
  if (scope === 'edge') {
    for (let i = 0; i < N; i += 1) if (action.perm[i] === i && action.rot[i] !== ROT_ID) return;
  } else {
    for (let i = 0; i < N; i += 1) if (isCorner(i) && action.perm[i] === i && action.rot[i] !== ROT_ID) return;
  }
  const t1 = a; const t2 = action.perm[t1]!; const t3 = action.perm[t2]!;
  templates.push({ word, cycle: [t1, t2, t3], rots: [action.rot[t1]!, action.rot[t2]!, action.rot[t3]!], cls });
};

console.time('library');
{
  interface Seed { atoms: Atom[]; support: number[] }
  const seeds: Seed[] = [];
  const seen = new Set<string>();
  for (const f of frameAtoms) for (const e of blockLocalAtoms) {
    const word = commutatorWord([f], [e]);
    const action = actionOfWord(word);
    const support: number[] = [];
    let over = false;
    for (let i = 0; i < N; i += 1) {
      if (action.perm[i] !== i || action.rot[i] !== ROT_ID) { support.push(i); if (support.length > 9) { over = true; break; } }
    }
    if (over || support.length === 0) continue;
    const key = support.map((i) => `${i}>${action.perm[i]}#${action.rot[i]}`).join(';');
    if (seen.has(key)) continue;
    seen.add(key);
    seeds.push({ atoms: word, support });
  }
  const siteToSeeds = new Map<number, number[]>();
  seeds.forEach((w, wi) => { for (const s of w.support) { const l = siteToSeeds.get(s) ?? []; l.push(wi); siteToSeeds.set(s, l); } });
  for (let i1 = 0; i1 < seeds.length; i1 += 1) {
    const w1 = seeds[i1]!;
    const partners = new Set<number>();
    for (const s of w1.support) for (const j of siteToSeeds.get(s) ?? []) if (j > i1) partners.add(j);
    for (const j of partners) {
      const w2 = seeds[j]!;
      let shared = 0;
      for (const s of w1.support) if (w2.support.includes(s)) shared += 1;
      if (shared !== 1) continue;
      addTemplateIfPure(commutatorWord(w1.atoms, w2.atoms), 'edge');
    }
  }
  const cornerAtoms = frameAtoms.filter((a) => a.moved.some(isCorner));
  interface Cand { word: Atom[]; cc: Set<number>; ce: Set<number> }
  const mkCand = (word: Atom[]): Cand => {
    const action = actionOfWord(word);
    const cc = new Set<number>(); const ce = new Set<number>();
    for (let i = 0; i < N; i += 1) {
      if (action.perm[i] === i) continue;
      if (isCC(i)) cc.add(i); else if (isCE(i)) ce.add(i);
    }
    return { word, cc, ce };
  };
  const singles = cornerAtoms.map((a) => mkCand([a]));
  const conjugates: Cand[] = [];
  for (const g of cornerAtoms) for (const h of cornerAtoms) { if (g.refId !== h.refId) conjugates.push(mkCand([g, h, ...inverseWord([g])])); }
  const intersect = (a: Set<number>, b: Set<number>) => { let n = 0; for (const x of a) if (b.has(x)) n += 1; return n; };
  for (const A of singles) for (const B of conjugates) {
    const cc = intersect(A.cc, B.cc); const ce = intersect(A.ce, B.ce);
    if ((cc === 1 && ce === 0) || (ce === 1 && cc === 0)) addTemplateIfPure(commutatorWord(A.word, B.word), 'corner');
  }
}

// ordered-pair index with t3 diversity
const byPair = new Map<number, Map<number, Template[]>>();
const pairKey = (a: number, b: number) => a * N + b;
for (const t of templates) {
  const [a, b, c] = t.cycle;
  const [ra, rb, rc] = t.rots;
  const inv = inverseWord(t.word);
  const variants: Template[] = [
    { word: t.word, cls: t.cls, cycle: [a, b, c], rots: [ra, rb, rc] },
    { word: t.word, cls: t.cls, cycle: [b, c, a], rots: [rb, rc, ra] },
    { word: t.word, cls: t.cls, cycle: [c, a, b], rots: [rc, ra, rb] },
    { word: inv, cls: t.cls, cycle: [a, c, b], rots: [rotInv[ra]!, rotInv[rc]!, rotInv[rb]!] },
    { word: inv, cls: t.cls, cycle: [c, b, a], rots: [rotInv[rc]!, rotInv[rb]!, rotInv[ra]!] },
    { word: inv, cls: t.cls, cycle: [b, a, c], rots: [rotInv[rb]!, rotInv[ra]!, rotInv[rc]!] },
  ];
  for (const v of variants) {
    const key = pairKey(v.cycle[0], v.cycle[1]);
    let byT3 = byPair.get(key);
    if (!byT3) { byT3 = new Map(); byPair.set(key, byT3); }
    const list = byT3.get(v.cycle[2]) ?? [];
    if (list.length < 6) { list.push(v); byT3.set(v.cycle[2], list); }
  }
}

// twisters: same-ordered-cycle variant pairs (all classes) + [e2, T] for E2-able edge classes
interface Twister { word: Atom[]; sites: number[]; rots: number[] }
const twisterBySiteRot = new Map<number, Twister[]>();
const twisterByPair = new Map<number, Array<{ wa: number; wb: number; tw: Twister }>>();
const seenTwisterProfiles = new Set<string>();
const registerTwister = (word: Atom[]): boolean => {
  const action = actionOfWord(word);
  const sites: number[] = [];
  const rots: number[] = [];
  for (let s = 0; s < N; s += 1) {
    if (action.perm[s] !== s) return false;
    if (action.rot[s] !== ROT_ID) { sites.push(s); rots.push(action.rot[s]!); }
  }
  if (sites.length === 0 || sites.length > 3) return false;
  const profile = sites.map((s, k) => `${s}#${rots[k]}`).join(';');
  if (seenTwisterProfiles.has(profile)) return false;
  seenTwisterProfiles.add(profile);
  const tw: Twister = { word, sites, rots };
  for (let k = 0; k < sites.length; k += 1) {
    const idx = sites[k]! * 24 + rots[k]!;
    const list = twisterBySiteRot.get(idx) ?? [];
    if (list.length < 16) { list.push(tw); twisterBySiteRot.set(idx, list); }
  }
  if (sites.length === 2) {
    for (const [ai, bi] of [[0, 1], [1, 0]] as const) {
      const key = pairKey(sites[ai]!, sites[bi]!);
      const list = twisterByPair.get(key) ?? [];
      if (list.length < 24) { list.push({ wa: rots[ai]!, wb: rots[bi]!, tw }); twisterByPair.set(key, list); }
    }
  }
  return true;
};
/** Register a twister from a precomputed (analytic) profile; word is trusted, spot-verified below. */
const registerTwisterProfile = (word: Atom[], sitesIn: number[], rotsIn: number[]): boolean => {
  const sites: number[] = [];
  const rots: number[] = [];
  for (let k = 0; k < sitesIn.length; k += 1) {
    if (rotsIn[k] === ROT_ID) continue;
    sites.push(sitesIn[k]!);
    rots.push(rotsIn[k]!);
  }
  if (sites.length === 0) return false;
  const profile = sites.map((s, k) => `${s}#${rots[k]}`).join(';');
  if (seenTwisterProfiles.has(profile)) return false;
  seenTwisterProfiles.add(profile);
  const tw: Twister = { word, sites, rots };
  for (let k = 0; k < sites.length; k += 1) {
    const idx = sites[k]! * 24 + rots[k]!;
    const list = twisterBySiteRot.get(idx) ?? [];
    if (list.length < 16) { list.push(tw); twisterBySiteRot.set(idx, list); }
  }
  if (sites.length === 2) {
    for (const [ai, bi] of [[0, 1], [1, 0]] as const) {
      const key = pairKey(sites[ai]!, sites[bi]!);
      const list = twisterByPair.get(key) ?? [];
      if (list.length < 24) { list.push({ wa: rots[ai]!, wb: rots[bi]!, tw }); twisterByPair.set(key, list); }
    }
  }
  return true;
};
{
  // same-ordered-cycle variant pairs: T_i . T_j^-1 is position-identity with rot inv(rj_k) . ri_k at cycle[k]
  const byCycle = new Map<string, Template[]>();
  for (const t of templates) {
    const key = t.cycle.join(',');
    const l = byCycle.get(key) ?? [];
    if (l.length < 10) l.push(t);
    byCycle.set(key, l);
  }
  const cycleCounts = new Map<PieceClass, number>();
  for (const group of byCycle.values()) {
    const cls = group[0]!.cls;
    for (let i = 0; i < group.length; i += 1) for (let j = 0; j < group.length; j += 1) {
      if (i === j || group[i]!.rots.join() === group[j]!.rots.join()) continue;
      const ti = group[i]!;
      const tj = group[j]!;
      const rots = ti.cycle.map((_, k) => rotMul[rotInv[tj.rots[k]!]!]![ti.rots[k]!]!);
      if (registerTwisterProfile([...ti.word, ...inverseWord(tj.word)], [...ti.cycle], rots)) {
        cycleCounts.set(cls, (cycleCounts.get(cls) ?? 0) + 1);
      }
    }
  }
  // [e2, T] for pure edge templates: rot e2.rot at a=e2-site, inv-conjugated roll at the cycle-predecessor of a
  const e2Counts = new Map<PieceClass, number>();
  for (const t of templates) {
    if (t.cls !== 'EEa' && t.cls !== 'EEo') continue;
    for (const e2 of e2Atoms) {
      const a = e2.moved[0]!;
      const ka = t.cycle.indexOf(a);
      if (ka < 0) continue;
      const kc = (ka + 2) % 3; // predecessor of a in the cycle
      const c = t.cycle[kc]!;
      const rhoCA = t.rots[kc]!; // rotation applied to the piece moving c -> a
      const rotAtC = rotMul[rotInv[rhoCA]!]![rotMul[rotInv[e2.rot]!]![rhoCA]!]!;
      if (registerTwisterProfile(commutatorWord([e2], t.word), [a, c], [e2.rot, rotAtC])) {
        e2Counts.set(t.cls, (e2Counts.get(t.cls) ?? 0) + 1);
      }
    }
  }
  console.log(
    `twisters: same-cycle ${JSON.stringify(Object.fromEntries(cycleCounts))}, [e2,T] ${JSON.stringify(Object.fromEntries(e2Counts))}, ` +
    `site-rot keys ${twisterBySiteRot.size}, pair keys ${twisterByPair.size}`,
  );
  // spot-verify a sample of registered twisters against the full action
  let checked = 0;
  for (const list of twisterBySiteRot.values()) {
    for (const tw of list) {
      if (checked >= 30) break;
      checked += 1;
      const action = actionOfWord(tw.word);
      for (let s2 = 0; s2 < N; s2 += 1) {
        if (action.perm[s2] !== s2) throw new Error('twister spot-check: not position-identity');
        const k = tw.sites.indexOf(s2);
        const expected = k >= 0 ? tw.rots[k]! : ROT_ID;
        if (action.rot[s2] !== expected) throw new Error('twister spot-check: rot profile mismatch');
      }
    }
    if (checked >= 30) break;
  }
}
console.timeEnd('library');
console.log(`templates ${templates.length}, pairs ${byPair.size}`);

// ---------- state ----------
interface PState { siteOfPiece: Int16Array; pieceAtSite: Int16Array; rotOfPiece: Uint8Array }
const solvedState = (): PState => ({
  siteOfPiece: new Int16Array(N).map((_, i) => i),
  pieceAtSite: new Int16Array(N).map((_, i) => i),
  rotOfPiece: new Uint8Array(N).fill(ROT_ID),
});
const cloneState = (st: PState): PState => ({
  siteOfPiece: st.siteOfPiece.slice(),
  pieceAtSite: st.pieceAtSite.slice(),
  rotOfPiece: st.rotOfPiece.slice(),
});
const applyAtomToState = (st: PState, a: Atom) => {
  const movedPieces: number[] = [];
  for (const s of a.moved) movedPieces.push(st.pieceAtSite[s]!);
  for (let k = 0; k < a.moved.length; k += 1) {
    const p = movedPieces[k]!;
    st.siteOfPiece[p] = a.perm[a.moved[k]!]!;
    st.rotOfPiece[p] = rotMul[a.rot]![st.rotOfPiece[p]!]!;
  }
  for (const p of movedPieces) st.pieceAtSite[st.siteOfPiece[p]!] = p;
};
const applyWordToState = (st: PState, w: Atom[]) => { for (const a of w) applyAtomToState(st, a); };

const tracePiece = (site: number, rot: number, w: Atom[]): [number, number] => {
  let s = site; let r = rot;
  for (const a of w) if (a.affected[s]) { r = rotMul[a.rot]![r]!; s = a.perm[s]!; }
  return [s, r];
};

const inverseAtomCache = new Map<string, Atom>();
const preimageUnder = (word: Atom[], t: number): number => {
  let s = t;
  for (let i = word.length - 1; i >= 0; i -= 1) {
    const a = word[i]!;
    let inv = inverseAtomCache.get(a.id);
    if (!inv) { inv = inverseWord([a])[0]!; inverseAtomCache.set(a.id, inv); }
    if (inv.affected[s]) s = inv.perm[s]!;
  }
  return s;
};

// ---------- placement ----------
interface Placement { word: Atom[]; perfect: boolean }
const findPlacement = (
  x: number, s: number, pieceRot: number,
  posProtected: Uint8Array, setupAlphabet: Atom[], maxDepth: number,
): Placement | null => {
  const startKey = pairKey(x, s);
  const visited = new Map<number, { parent: number; atom: Atom | null }>();
  visited.set(startKey, { parent: -1, atom: null });
  let frontier: number[] = [startKey];
  let fallback: Placement | null = null;
  const reconstructSetup = (key: number): Atom[] => {
    const out: Atom[] = [];
    let k = key;
    while (true) {
      const node = visited.get(k)!;
      if (node.atom === null) break;
      out.push(node.atom);
      k = node.parent;
    }
    return out.reverse();
  };
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    for (const key of frontier) {
      const byT3 = byPair.get(key);
      if (!byT3) continue;
      const setup = reconstructSetup(key);
      const invSetup = inverseWord(setup);
      for (const [, list] of byT3) {
        for (const t of list) {
          const z = preimageUnder(setup, t.cycle[2]);
          if (posProtected[z] || z === x || z === s) continue;
          const word = [...setup, ...t.word, ...invSetup];
          const [endSite, endRot] = tracePiece(x, pieceRot, word);
          if (endSite !== s) continue;
          if (endRot === ROT_ID) return { word, perfect: true };
          if (!fallback) fallback = { word, perfect: false };
        }
      }
    }
    if (depth === maxDepth) break;
    const next: number[] = [];
    for (const key of frontier) {
      const a0 = Math.floor(key / N); const b0 = key % N;
      for (const atom of setupAlphabet) {
        const a1 = atom.perm[a0]!; const b1 = atom.perm[b0]!;
        if (a1 === a0 && b1 === b0) continue;
        const nkey = pairKey(a1, b1);
        if (visited.has(nkey)) continue;
        visited.set(nkey, { parent: key, atom });
        next.push(nkey);
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return fallback;
};

// ---------- twist fix: apply a net rotation `need` at site s ----------
const findTwistFix = (
  s: number, need: number, setupAlphabet: Atom[], maxDepth: number,
  validate: (word: Atom[]) => boolean,
): Atom[] | null => {
  const visited = new Map<number, { parent: number; atom: Atom | null }>();
  const start = s * 24 + ROT_ID;
  visited.set(start, { parent: -1, atom: null });
  let frontier: number[] = [start];
  const reconstructSetup = (key: number): Atom[] => {
    const out: Atom[] = [];
    let k = key;
    while (true) {
      const node = visited.get(k)!;
      if (node.atom === null) break;
      out.push(node.atom);
      k = node.parent;
    }
    return out.reverse();
  };
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    for (const key of frontier) {
      const t = Math.floor(key / 24); const rho = key % 24;
      const w = rotMul[rotMul[rho]![need]!]![rotInv[rho]!]!;
      const list = twisterBySiteRot.get(t * 24 + w);
      if (!list) continue;
      const setup = reconstructSetup(key);
      const invSetup = inverseWord(setup);
      for (const tw of list) {
        const word = [...setup, ...tw.word, ...invSetup];
        if (validate(word)) return word;
      }
    }
    if (depth === maxDepth) break;
    const next: number[] = [];
    for (const key of frontier) {
      const site = Math.floor(key / 24); const rho = key % 24;
      for (const atom of setupAlphabet) {
        if (!atom.affected[site]) continue;
        const nkey = atom.perm[site]! * 24 + rotMul[atom.rot]![rho]!;
        if (visited.has(nkey)) continue;
        visited.set(nkey, { parent: key, atom });
        next.push(nkey);
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return null;
};

// ---------- pair twist fix: BFS over (siteA, rotA, siteB, rotB) ----------
const findPairTwistFix = (
  s: number, residueS: number, q: number, residueQ: number,
  setupAlphabet: Atom[], maxNodes: number,
  potentialAt: (site: number, rot: number) => number,
  validate: (word: Atom[]) => boolean,
): Atom[] | null => {
  const basePotential = potentialAt(s, residueS) + potentialAt(q, residueQ);
  const stateKey = (a: number, ra: number, b: number, rb: number) => ((a * 24 + ra) * N + b) * 24 + rb;
  const visited = new Map<number, { parent: number; atom: Atom | null }>();
  const start = stateKey(s, ROT_ID, q, ROT_ID);
  visited.set(start, { parent: -1, atom: null });
  let frontier: number[] = [start];
  const reconstructSetup = (key: number): Atom[] => {
    const out: Atom[] = [];
    let k = key;
    while (true) {
      const node = visited.get(k)!;
      if (node.atom === null) break;
      out.push(node.atom);
      k = node.parent;
    }
    return out.reverse();
  };
  while (frontier.length > 0 && visited.size < maxNodes) {
    for (const key of frontier) {
      let rest = key;
      const rb = rest % 24; rest = (rest - rb) / 24;
      const b = rest % N; rest = (rest - b) / N;
      const ra = rest % 24;
      const a = (rest - ra) / 24;
      const list = twisterByPair.get(pairKey(a, b));
      if (!list) continue;
      for (const entry of list) {
        // effect at s: inv(ra)·wa·ra composed onto residueS (and likewise at q)
        const newS = rotMul[rotMul[rotInv[ra]!]![rotMul[entry.wa]![ra]!]!]![residueS]!;
        const newQ = rotMul[rotMul[rotInv[rb]!]![rotMul[entry.wb]![rb]!]!]![residueQ]!;
        if (potentialAt(s, newS) + potentialAt(q, newQ) >= basePotential) continue;
        const setup = reconstructSetup(key);
        const word = [...setup, ...entry.tw.word, ...inverseWord(setup)];
        if (validate(word)) return word;
      }
    }
    const next: number[] = [];
    for (const key of frontier) {
      if (visited.size >= maxNodes) break;
      let rest = key;
      const rb = rest % 24; rest = (rest - rb) / 24;
      const b = rest % N; rest = (rest - b) / N;
      const ra = rest % 24;
      const a = (rest - ra) / 24;
      for (const atom of setupAlphabet) {
        const affA = atom.affected[a] === 1;
        const affB = atom.affected[b] === 1;
        if (!affA && !affB) continue;
        const nkey = stateKey(
          affA ? atom.perm[a]! : a,
          affA ? rotMul[atom.rot]![ra]! : ra,
          affB ? atom.perm[b]! : b,
          affB ? rotMul[atom.rot]![rb]! : rb,
        );
        if (visited.has(nkey)) continue;
        visited.set(nkey, { parent: key, atom });
        next.push(nkey);
      }
    }
    frontier = next;
  }
  return null;
};

// ---------- parity: per site-orbit, F2 linear system over quarter-turn atoms ----------
const classSites = new Map<PieceClass, number[]>();
for (let i = 0; i < N; i += 1) {
  const l = classSites.get(siteClasses[i]!) ?? [];
  l.push(i);
  classSites.set(siteClasses[i]!, l);
}

// site orbits via union-find over all atoms
const orbitIndexOfSite: Int16Array = (() => {
  const parent = new Int32Array(N).map((_, i) => i);
  const find = (x: number): number => { let r = x; while (parent[r] !== r) r = parent[r]!; while (parent[x] !== r) { const nx = parent[x]!; parent[x] = r; x = nx; } return r; };
  for (const a of atoms) for (const i of a.moved) { const ra = find(i); const rb = find(a.perm[i]!); if (ra !== rb) parent[ra] = rb; }
  const roots = new Map<number, number>();
  const out = new Int16Array(N);
  for (let i = 0; i < N; i += 1) {
    const r = find(i);
    if (!roots.has(r)) roots.set(r, roots.size);
    out[i] = roots.get(r)!;
  }
  return out;
})();
const orbitCount = Math.max(...orbitIndexOfSite) + 1;
const orbitSitesList: number[][] = Array.from({ length: orbitCount }, () => []);
for (let i = 0; i < N; i += 1) orbitSitesList[orbitIndexOfSite[i]!]!.push(i);

const orbitSign = (st: PState, orbit: number): 0 | 1 => {
  const sites = orbitSitesList[orbit]!;
  const visited = new Set<number>();
  let odd = 0;
  for (const start of sites) {
    if (visited.has(start)) continue;
    let len = 0; let cur = start;
    do { visited.add(cur); cur = st.siteOfPiece[cur]!; len += 1; } while (cur !== start);
    if (len % 2 === 0) odd ^= 1;
  }
  return odd as 0 | 1;
};

// parity vector (bitmask over orbits) of each quarter-turn atom
const atomParityVector = (a: Atom): number => {
  let vec = 0;
  const seen = new Set<number>();
  for (const i of a.moved) {
    if (seen.has(i)) continue;
    let len = 0; let cur = i;
    do { seen.add(cur); cur = a.perm[cur]!; len += 1; } while (cur !== i);
    if (len % 2 === 0) vec ^= 1 << orbitIndexOfSite[i]!;
  }
  return vec;
};
const parityGenerators: Array<{ atom: Atom; vec: number }> = [];
{
  const seenVec = new Set<number>();
  for (const a of atoms) {
    if (a.angle !== 90) continue;
    const vec = atomParityVector(a);
    if (vec === 0 || seenVec.has(vec)) continue;
    seenVec.add(vec);
    parityGenerators.push({ atom: a, vec });
  }
}

/** Express target as XOR of generator vectors; returns the fixer atoms (odd multiplicity) or null. */
const solveParity = (target: number): Atom[] | null => {
  if (target === 0) return [];
  const basis: Array<{ vec: number; combo: Set<number> }> = [];
  const reduce = (vecIn: number, comboIn: Set<number>): { vec: number; combo: Set<number> } => {
    let vec = vecIn;
    let combo = new Set(comboIn);
    for (const b of basis) {
      const high = 31 - Math.clz32(b.vec);
      if ((vec >> high) & 1) {
        vec ^= b.vec;
        for (const gi of b.combo) { if (combo.has(gi)) combo.delete(gi); else combo.add(gi); }
      }
    }
    return { vec, combo };
  };
  for (let gi = 0; gi < parityGenerators.length; gi += 1) {
    const r = reduce(parityGenerators[gi]!.vec, new Set([gi]));
    if (r.vec !== 0) { basis.push(r); basis.sort((p, q) => q.vec - p.vec); }
  }
  const r = reduce(target, new Set());
  if (r.vec !== 0) return null;
  return [...r.combo].map((gi) => parityGenerators[gi]!.atom);
};

// ---------- solve ----------
interface SolveResult { ok: boolean; moves: Atom[]; note: string }
const solve = (input: PState, log: string[] = []): SolveResult => {
  const st = cloneState(input);
  const moves: Atom[] = [];
  const emit = (w: Atom[]) => { applyWordToState(st, w); moves.push(...w); };
  const posProtected = new Uint8Array(N);
  const rotProtected = new Uint8Array(N);

  const protectedOk = (word: Atom[]): PState | null => {
    const trial = cloneState(st);
    applyWordToState(trial, word);
    for (let i = 0; i < N; i += 1) {
      if (posProtected[i] && trial.pieceAtSite[i] !== st.pieceAtSite[i]) return null;
      if (rotProtected[i] && (trial.pieceAtSite[i] !== i || trial.rotOfPiece[i] !== st.rotOfPiece[i]!)) return null;
    }
    return trial;
  };

  const positionPhase = (cls: PieceClass, setupAlphabet: Atom[], maxDepth: number): boolean => {
    const sites = classSites.get(cls)!;
    for (const s of sites) if (st.pieceAtSite[s] === s) posProtected[s] = 1;

    const trySolveSite = (s: number): boolean => {
      const x = st.siteOfPiece[s]!;
      const placement = findPlacement(x, s, st.rotOfPiece[s]!, posProtected, setupAlphabet, maxDepth);
      if (!placement) return false;
      if (!protectedOk(placement.word)) return false;
      emit(placement.word);
      posProtected[s] = 1;
      return true;
    };

    let attempts = 0;
    let sacrificeRotation = 0;
    while (true) {
      const unsolved = sites.filter((s) => st.siteOfPiece[s] !== s);
      if (unsolved.length === 0) break;
      attempts += 1;
      if (attempts > sites.length * 4) { log.push(`${cls}: attempt budget exhausted (${unsolved.length} left)`); return false; }
      // keep protection flags in sync (sacrificed sites may have been broken)
      for (const s of sites) posProtected[s] = st.pieceAtSite[s] === s ? 1 : 0;
      const s = unsolved[0]!;
      if (trySolveSite(s)) continue;
      // deadlock: sacrifice one currently-solved site of this class to change the triple configuration
      const solvedSites = sites.filter((w) => w !== s && st.pieceAtSite[w] === w);
      let escaped = false;
      for (let k = 0; k < solvedSites.length; k += 1) {
        const w = solvedSites[(k + sacrificeRotation) % solvedSites.length]!;
        posProtected[w] = 0;
        if (trySolveSite(s)) { escaped = true; sacrificeRotation += 1; break; }
        posProtected[w] = 1;
      }
      if (!escaped) { log.push(`${cls}: no placement for piece ${s} from ${st.siteOfPiece[s]} even with sacrifice`); return false; }
    }
    for (const s of sites) posProtected[s] = 1;
    return true;
  };

  const orientationPhase = (classes: PieceClass[], setupAlphabet: Atom[], maxDepth: number, label: string): boolean => {
    const sites = classes.flatMap((c) => classSites.get(c)!);
    const siteSet = new Set(sites);
    // potential: 0 solved, 1 fixable by one E2 roll, 2 otherwise
    const e2FixerFor = (s: number, rot: number): Atom | undefined =>
      e2Atoms.find((a) => a.affected[s] && a.moved.length === 1 && rotMul[a.rot]![rot]! === ROT_ID);
    const potentialOf = (s: number, rot: number): number => {
      if (rot === ROT_ID) return 0;
      return e2FixerFor(s, rot) ? 1 : 2;
    };
    const totalPotential = (state: PState): number => {
      let sum = 0;
      for (const s of sites) sum += potentialOf(s, state.rotOfPiece[s]!);
      return sum;
    };

    let guard = 0;
    while (true) {
      guard += 1;
      if (guard > 400) { log.push(`${label}: twist loop guard tripped`); return false; }
      // E2 pass: clean every roll-fixable site
      for (const s of sites) {
        if (st.rotOfPiece[s] === ROT_ID) continue;
        const direct = e2FixerFor(s, st.rotOfPiece[s]!);
        if (direct) emit([direct]);
      }
      const dirty = sites.filter((s) => st.rotOfPiece[s] !== ROT_ID);
      if (dirty.length === 0) break;
      const before = totalPotential(st);
      const decreasing = (word: Atom[]): boolean => {
        const trial = protectedOk(word);
        if (!trial) return false;
        for (const w of sites) if (trial.pieceAtSite[w] !== w) return false;
        return totalPotential(trial) < before;
      };
      let fix: Atom[] | null = null;
      for (const s of dirty) {
        const r = st.rotOfPiece[s]!;
        // candidate post-twist rotations at s: solved, or any single-E2-fixable roll
        const targets: number[] = [ROT_ID];
        for (const a of e2Atoms) {
          if (!a.affected[s] || a.moved.length !== 1) continue;
          const rho = rotInv[a.rot]!;
          if (rho !== r && !targets.includes(rho)) targets.push(rho);
        }
        for (const target of targets) {
          const need = rotMul[target]![rotInv[r]!]!; // net w with w∘r = target
          fix = findTwistFix(s, need, setupAlphabet, maxDepth, decreasing);
          if (fix) break;
        }
        if (fix) break;
        // pair fix: jointly improve s and another dirty site of the same class
        for (const q of dirty) {
          if (q === s || siteClasses[q] !== siteClasses[s]) continue;
          fix = findPairTwistFix(s, st.rotOfPiece[s]!, q, st.rotOfPiece[q]!, setupAlphabet, 400000, potentialOf, decreasing);
          if (fix) break;
        }
        if (fix) break;
      }
      if (!fix) {
        log.push(
          `${label}: no potential-decreasing twist move; ` +
          `dirty=[${dirty.map((q) => `${q}:${siteClasses[q]}#${st.rotOfPiece[q]}`).join(' ')}]`,
        );
        return false;
      }
      emit(fix);
    }
    for (const s of sites) rotProtected[s] = 1;
    return true;
  };

  // 0: parity normalization across all site orbits (stays fixed afterwards: all later tools are commutators, even on every orbit)
  {
    let target = 0;
    for (let o = 0; o < orbitCount; o += 1) if (orbitSign(st, o)) target |= 1 << o;
    const fixers = solveParity(target);
    if (!fixers) return { ok: false, moves, note: 'orbit parity vector outside the reachable span: unreachable state' };
    if (fixers.length > 0) emit(fixers);
    for (let o = 0; o < orbitCount; o += 1) {
      if (orbitSign(st, o)) return { ok: false, moves, note: 'internal: parity normalization failed' };
    }
  }
  // 1-2: corner positions
  if (!positionPhase('CC', frameAtoms, 8)) return { ok: false, moves, note: log.join(' | ') };
  if (!positionPhase('CE', frameAtoms, 8)) return { ok: false, moves, note: log.join(' | ') };
  // 3: CC orientation (corner twisters junk edges; run before edge phases). CE deferred to E2 phase.
  if (!orientationPhase(['CC'], frameAtoms, 6, 'CC orientation')) return { ok: false, moves, note: log.join(' | ') };
  // 4-6: edge positions
  if (!positionPhase('EC', posAtoms, 8)) return { ok: false, moves, note: log.join(' | ') };
  if (!positionPhase('EEa', posAtoms, 8)) return { ok: false, moves, note: log.join(' | ') };
  if (!positionPhase('EEo', posAtoms, 8)) return { ok: false, moves, note: log.join(' | ') };
  // EC must be auto-oriented
  for (const s of classSites.get('EC')!) {
    if (st.rotOfPiece[s] !== ROT_ID) return { ok: false, moves, note: `internal: EC site ${s} twisted despite position-determined orientation` };
  }
  // 8: CE/EEa/EEo orientation
  if (!orientationPhase(['CE', 'EEa', 'EEo'], posAtoms, 6, 'edge orientation')) return { ok: false, moves, note: log.join(' | ') };

  for (let i = 0; i < N; i += 1) {
    if (st.siteOfPiece[i] !== i || st.rotOfPiece[i] !== ROT_ID) return { ok: false, moves, note: `final verify failed at ${i}` };
  }
  return { ok: true, moves, note: 'solved' };
};

// ---------- benchmark ----------
const mulberry32 = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const scramblePool: Atom[] = atoms;
for (const length of [5, 15, 40, 100, 300]) {
  let okCount = 0; let totalMoves = 0; let totalMs = 0;
  const failures: string[] = [];
  const seeds = 10;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const rng = mulberry32(seed * 1000 + length);
    const st = solvedState();
    for (let i = 0; i < length; i += 1) applyAtomToState(st, scramblePool[Math.floor(rng() * scramblePool.length)]!);
    const t0 = performance.now();
    const res = solve(st);
    totalMs += performance.now() - t0;
    if (res.ok) { okCount += 1; totalMoves += res.moves.length; }
    else failures.push(`seed${seed}: ${res.note}`);
  }
  console.log(`len=${length}: ${okCount}/${seeds} ok, avg ${(totalMoves / Math.max(okCount, 1)).toFixed(0)} moves, avg ${(totalMs / seeds).toFixed(0)}ms`);
  for (const f of failures.slice(0, 4)) console.log(`   FAIL ${f}`);
}

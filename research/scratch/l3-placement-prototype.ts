/**
 * End-to-end position-placement prototype for the full Level 3 solver.
 *
 * It consumes the fixed globally-pure tool cache, normalizes all 164 orbit
 * parities, then solves every orbit independently by setup-conjugating its one
 * pure template.  Orientation is reported but deliberately not cleaned here;
 * that is the next production-port phase.
 *
 * Run: `npx tsx research/scratch/l3-placement-prototype.ts [seed] [length]`.
 */
import { readFileSync } from 'node:fs';
import {
  ROT_ID, actionOver, atomById, atoms, commutatorWord, inverseAtom, inverseWord, N, rotInv,
  rotMul, siteClasses, supportCandidates, type Atom,
} from './l3sim';

// ---------- orbits ----------
const parent = new Int32Array(N).map((_, i) => i);
const root = (x: number): number => { let r = x; while (parent[r] !== r) r = parent[r]!; while (parent[x] !== r) { const n = parent[x]!; parent[x] = r; x = n; } return r; };
for (const atom of atoms) for (const [from, to] of atom.map) {
  if (from === to) continue;
  const a = root(from); const b = root(to); if (a !== b) parent[a] = b;
}
const orbitOfSite = new Int16Array(N).fill(-1);
const orbitSites: number[][] = [];
{
  const index = new Map<number, number>();
  for (let site = 0; site < N; site += 1) {
    const r = root(site); let orbit = index.get(r);
    if (orbit === undefined) { orbit = orbitSites.length; index.set(r, orbit); orbitSites.push([]); }
    orbitOfSite[site] = orbit; orbitSites[orbit]!.push(site);
  }
}

// ---------- integer state ----------
interface PState { siteOfPiece: Int16Array; pieceAtSite: Int16Array; rotOfPiece: Uint8Array }
const solvedState = (): PState => {
  const siteOfPiece = new Int16Array(N);
  const pieceAtSite = new Int16Array(N);
  for (let site = 0; site < N; site += 1) { siteOfPiece[site] = site; pieceAtSite[site] = site; }
  return { siteOfPiece, pieceAtSite, rotOfPiece: new Uint8Array(N).fill(ROT_ID) };
};
const applyAtom = (state: PState, atom: Atom): void => {
  const entries = [...atom.map];
  const pieces = entries.map(([site]) => state.pieceAtSite[site]!);
  for (let i = 0; i < entries.length; i += 1) {
    const piece = pieces[i]!;
    state.siteOfPiece[piece] = entries[i]![1];
    state.rotOfPiece[piece] = rotMul[atom.rot]![state.rotOfPiece[piece]!]!;
  }
  for (const piece of pieces) state.pieceAtSite[state.siteOfPiece[piece]!] = piece;
};
const applyWord = (state: PState, word: Atom[]): void => { for (const atom of word) applyAtom(state, atom); };

// ---------- seeded full scramble ----------
let randomState = Number(process.argv[2] ?? 1) >>> 0;
const scrambleLength = Number(process.argv[3] ?? 20);
const random = (n: number): number => {
  randomState = (randomState * 1664525 + 1013904223) >>> 0;
  return randomState % n;
};
const state = solvedState();
const scramble: Atom[] = [];
for (let i = 0; i < scrambleLength; i += 1) {
  const atom = atoms[random(atoms.length)]!;
  scramble.push(atom); applyAtom(state, atom);
}

// ---------- parity normalization ----------
const parityVector = (atom: Atom): bigint => {
  let vector = 0n;
  const seen = new Set<number>();
  for (const [from] of atom.map) {
    if (seen.has(from)) continue;
    let length = 0; let current = from;
    do { seen.add(current); current = atom.map.get(current) ?? current; length += 1; } while (current !== from);
    if (length % 2 === 0) vector ^= 1n << BigInt(orbitOfSite[from]!);
  }
  return vector;
};
const orbitSign = (orbit: number): 0 | 1 => {
  const seen = new Set<number>(); let odd = 0;
  for (const start of orbitSites[orbit]!) {
    if (seen.has(start)) continue;
    let current = start; let length = 0;
    do { seen.add(current); current = state.siteOfPiece[current]!; length += 1; } while (current !== start);
    if (length % 2 === 0) odd ^= 1;
  }
  return odd as 0 | 1;
};
interface Basis { vec: bigint; combo: Set<number> }
const highBit = (value: bigint): number => value.toString(2).length - 1;
const parityGenerators: Array<{ atom: Atom; vec: bigint }> = [];
const distinctParity = new Set<string>();
for (const atom of atoms) {
  const vec = parityVector(atom);
  const key = vec.toString(16);
  if (vec === 0n || distinctParity.has(key)) continue;
  distinctParity.add(key); parityGenerators.push({ atom, vec });
}
const basis: Basis[] = [];
const reduce = (vector: bigint, combination: Set<number>): Basis => {
  let vec = vector; const combo = new Set(combination);
  for (const row of basis) {
    const bit = highBit(row.vec);
    if (((vec >> BigInt(bit)) & 1n) === 0n) continue;
    vec ^= row.vec;
    for (const index of row.combo) combo.has(index) ? combo.delete(index) : combo.add(index);
  }
  return { vec, combo };
};
for (let index = 0; index < parityGenerators.length; index += 1) {
  const row = reduce(parityGenerators[index]!.vec, new Set([index]));
  if (row.vec !== 0n) { basis.push(row); basis.sort((a, b) => highBit(b.vec) - highBit(a.vec)); }
}
let parityTarget = 0n;
for (let orbit = 0; orbit < orbitSites.length; orbit += 1) if (orbitSign(orbit)) parityTarget |= 1n << BigInt(orbit);
const paritySolution = reduce(parityTarget, new Set());
if (paritySolution.vec !== 0n) throw new Error('unreachable parity vector');
const emitted: Atom[] = [];
for (const index of paritySolution.combo) {
  const atom = parityGenerators[index]!.atom;
  applyAtom(state, atom); emitted.push(atom);
}
if (orbitSites.some((_, orbit) => orbitSign(orbit))) throw new Error('parity normalization failed');

// ---------- fixed pure templates ----------
interface CacheTool { orbit: number; word: string[] }
interface CacheFile { tools: CacheTool[] }
interface Template { word: Atom[]; src: number[]; dst: number[]; rots: number[] }
const cache = JSON.parse(readFileSync(new URL('./l3-global-tool-inventory.cache.json', import.meta.url), 'utf8')) as CacheFile;
const templates: Template[] = new Array(orbitSites.length);
for (const record of cache.tools) {
  const word = record.word.map((id) => atomById.get(id)!);
  const action = actionOver(word, supportCandidates(word));
  const src: number[] = []; const dst: number[] = []; const rots: number[] = [];
  for (const [site, [to, rot]] of action.moves) {
    if (site === to) continue;
    src.push(site); dst.push(to); rots.push(rot);
  }
  templates[record.orbit] = { word, src, dst, rots };
}

const templateVariantCache = new Map<number, Template[]>();
const templateVariantsFor = (orbit: number): Template[] => {
  const cached = templateVariantCache.get(orbit);
  if (cached) return cached;
  const alphabet = setupAlphabetFor(orbit);
  const variantLimit = orbitSites[orbit]!.length >= 192 ? 768 : 192;
  const variants: Template[] = [templates[orbit]!];
  const profile = (template: Template): string => template.src
    .map((site, index) => `${site}>${template.dst[index]}#${template.rots[index]}`)
    .sort()
    .join(';');
  const seen = new Set<string>([profile(variants[0]!)]);
  for (let cursor = 0; cursor < variants.length && variants.length < variantLimit; cursor += 1) {
    const base = variants[cursor]!;
    for (const setup of alphabet) {
      const inverse = inverseAtom(setup);
      const src = base.src.map((site) => inverse.map.get(site) ?? site);
      const word = [setup, ...base.word, inverse];
      const action = actionOver(word, src);
      const candidate: Template = {
        word,
        src,
        dst: src.map((site) => action.moves.get(site)![0]),
        rots: src.map((site) => action.moves.get(site)![1]),
      };
      const key = profile(candidate);
      if (seen.has(key)) continue;
      seen.add(key); variants.push(candidate);
      if (variants.length >= variantLimit) break;
    }
  }
  const withInverses = [...variants];
  for (const template of variants) {
    const word = inverseWord(template.word);
    const action = actionOver(word, template.src);
    withInverses.push({
      word,
      src: template.dst,
      dst: template.src,
      rots: template.dst.map((site) => action.moves.get(site)![1]),
    });
  }

  // A double transposition is enough to generate Alt(n), but greedy placement
  // can cycle on the last 3 cells.  Two conjugates sharing one transposition
  // multiply to a 3-cycle; prefer that derived template when available.
  if (templates[orbit]!.src.length !== 3) {
    const bySite = new Map<number, number[]>();
    withInverses.forEach((template, index) => {
      for (const site of template.src) {
        const list = bySite.get(site) ?? []; list.push(index); bySite.set(site, list);
      }
    });
    let cycle: Template | null = null;
    const actionIndex = new Map<Template, Map<number, number>>();
    const indexFor = (template: Template): Map<number, number> => {
      let index = actionIndex.get(template);
      if (!index) { index = new Map(template.src.map((site, offset) => [site, offset])); actionIndex.set(template, index); }
      return index;
    };
    outer:
    for (let i = 0; i < withInverses.length; i += 1) {
      const partners = new Set<number>();
      for (const site of withInverses[i]!.src) for (const j of bySite.get(site) ?? []) if (j > i) partners.add(j);
      for (const j of partners) {
        const a = withInverses[i]!; const b = withInverses[j]!;
        const word = [...a.word, ...b.word];
        const candidates = new Set([...a.src, ...b.src]);
        const src: number[] = []; const dst: number[] = []; const rots: number[] = [];
        let clean = true;
        const aIndex = indexFor(a);
        const bIndex = indexFor(b);
        for (const site of candidates) {
          const ai = aIndex.get(site);
          const middle = ai === undefined ? site : a.dst[ai]!;
          const firstRotation = ai === undefined ? ROT_ID : a.rots[ai]!;
          const bi = bIndex.get(middle);
          const to = bi === undefined ? middle : b.dst[bi]!;
          const rotation = bi === undefined ? firstRotation : rotMul[b.rots[bi]!]![firstRotation]!;
          if (site === to) { if (rotation !== ROT_ID) clean = false; continue; }
          src.push(site); dst.push(to); rots.push(rotation);
        }
        if (clean && src.length === 3) { cycle = { word, src, dst, rots }; break outer; }
      }
    }
    if (cycle) {
      const cycleVariants: Template[] = [cycle];
      const cycleSeen = new Set<string>([profile(cycle)]);
      for (let cursor = 0; cursor < cycleVariants.length && cycleVariants.length < variantLimit; cursor += 1) {
        const base = cycleVariants[cursor]!;
        for (const setup of alphabet) {
          const inverse = inverseAtom(setup);
          const src = base.src.map((site) => inverse.map.get(site) ?? site);
          const word = [setup, ...base.word, inverse];
          const action = actionOver(word, src);
          const candidate: Template = {
            word,
            src,
            dst: src.map((site) => action.moves.get(site)![0]),
            rots: src.map((site) => action.moves.get(site)![1]),
          };
          const key = profile(candidate);
          if (cycleSeen.has(key)) continue;
          cycleSeen.add(key); cycleVariants.push(candidate);
          if (cycleVariants.length >= variantLimit) break;
        }
      }
      const inverseCycles = cycleVariants.map((template) => {
        const word = inverseWord(template.word);
        const action = actionOver(word, template.src);
        return {
          word,
          src: template.dst,
          dst: template.src,
          rots: template.dst.map((site) => action.moves.get(site)![1]),
        };
      });
      templateVariantCache.set(orbit, [...cycleVariants, ...inverseCycles]);
      return templateVariantCache.get(orbit)!;
    }
  }

  templateVariantCache.set(orbit, withInverses);
  return withInverses;
};

const posProtected = new Uint8Array(N);
const tracePiece = (site: number, rotation: number, word: Atom[]): [number, number] => {
  let current = site; let rot = rotation;
  for (const atom of word) {
    const destination = atom.map.get(current);
    if (destination === undefined) continue;
    current = destination; rot = rotMul[atom.rot]![rot]!;
  }
  return [current, rot];
};
const preimageUnder = (word: Atom[], site: number): number => {
  let current = site;
  for (let i = word.length - 1; i >= 0; i -= 1) {
    const inverse = inverseAtom(word[i]!);
    current = inverse.map.get(current) ?? current;
  }
  return current;
};

const setupAlphabetCache = new Map<number, Atom[]>();
const setupAlphabetFor = (orbit: number): Atom[] => {
  const cached = setupAlphabetCache.get(orbit);
  if (cached) return cached;
  const seen = new Set<string>(); const out: Atom[] = [];
  for (const atom of atoms) {
    const action: string[] = [];
    for (const site of orbitSites[orbit]!) {
      const to = atom.map.get(site) ?? site;
      if (to !== site) action.push(`${site}>${to}`);
    }
    if (action.length === 0) continue;
    const key = action.join(',');
    if (seen.has(key)) continue;
    seen.add(key); out.push(atom);
  }
  setupAlphabetCache.set(orbit, out);
  return out;
};

const orientationAlphabetCache = new Map<number, Atom[]>();
const orientationAlphabetFor = (orbit: number): Atom[] => {
  const cached = orientationAlphabetCache.get(orbit);
  if (cached) return cached;
  const seen = new Set<string>(); const out: Atom[] = [];
  for (const atom of atoms) {
    const action: string[] = [];
    for (const site of orbitSites[orbit]!) {
      const to = atom.map.get(site);
      if (to !== undefined) action.push(`${site}>${to}#${atom.rot}`);
    }
    if (action.length === 0) continue;
    const key = action.join(',');
    if (seen.has(key)) continue;
    seen.add(key); out.push(atom);
  }
  orientationAlphabetCache.set(orbit, out);
  return out;
};

interface Placement { word: Atom[]; oriented: boolean; landed: number; broken: number }
const findPlacement = (
  orbit: number,
  x: number,
  target: number,
  maxDepth: number,
  maxBroken: number,
  desiredLanded: number,
): Placement | null => {
  const variants = templateVariantsFor(orbit);
  const pairKey = (a: number, b: number) => a * N + b;
  const byPair = new Map<number, Template[]>();
  for (const variant of variants) for (let i = 0; i < variant.src.length; i += 1) {
    const key = pairKey(variant.src[i]!, variant.dst[i]!);
    const list = byPair.get(key) ?? []; list.push(variant); byPair.set(key, list);
  }
  const alphabet = setupAlphabetFor(orbit);
  const start = pairKey(x, target);
  const visited = new Map<number, { parent: number; atom: Atom | null }>([[start, { parent: -1, atom: null }]]);
  let frontier = [start];
  let best: Placement | null = null;
  const reconstruct = (key: number): Atom[] => {
    const word: Atom[] = []; let current = key;
    while (true) {
      const node = visited.get(current)!;
      if (!node.atom) break;
      word.push(node.atom); current = node.parent;
    }
    return word.reverse();
  };
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    for (const key of frontier) {
      for (const variant of byPair.get(key) ?? []) {
        const setup = reconstruct(key);
        let aimed = false; let landed = 0; let broken = 0;
        for (let i = 0; i < variant.src.length; i += 1) {
          const from = preimageUnder(setup, variant.src[i]!);
          const to = preimageUnder(setup, variant.dst[i]!);
          if (from === x && to === target) aimed = true;
          if (posProtected[from] && from !== to) broken += 1;
          if (state.pieceAtSite[from] === to) landed += 1;
        }
        if (!aimed || broken > maxBroken) continue;
        const word = [...setup, ...variant.word, ...inverseWord(setup)];
        const [end, rotation] = tracePiece(x, state.rotOfPiece[target]!, word);
        if (end !== target) continue;
        const candidate = { word, oriented: rotation === ROT_ID, landed, broken };
        if (!best || Number(candidate.oriented) > Number(best.oriented) ||
          (candidate.oriented === best.oriented && candidate.broken < best.broken) ||
          (candidate.oriented === best.oriented && candidate.broken === best.broken && candidate.landed > best.landed) ||
          (candidate.oriented === best.oriented && candidate.broken === best.broken && candidate.landed === best.landed && candidate.word.length < best.word.length)) best = candidate;
      }
    }
    if (best && best.landed > best.broken && best.landed >= desiredLanded) return best;
    if (depth === maxDepth) break;
    const next: number[] = [];
    for (const key of frontier) {
      const a = Math.floor(key / N); const b = key % N;
      for (const atom of alphabet) {
        const na = atom.map.get(a) ?? a; const nb = atom.map.get(b) ?? b;
        if (na === a && nb === b) continue;
        const nextKey = pairKey(na, nb);
        if (visited.has(nextKey)) continue;
        visited.set(nextKey, { parent: key, atom }); next.push(nextKey);
      }
    }
    frontier = next;
  }
  return best && best.landed > best.broken ? best : null;
};

const findThreeCycleWord = (
  orbit: number,
  cycle: [number, number, number],
  maxDepth: number,
): Atom[] | null => {
  const [a, b, c] = cycle;
  const keyOf = (x: number, y: number, z: number) => (x * N + y) * N + z;
  const targets = new Map<number, Template>();
  for (const template of templateVariantsFor(orbit)) {
    if (template.src.length !== 3) continue;
    const index = new Map(template.src.map((site, offset) => [site, offset]));
    const t0 = template.src[0]!;
    const t1 = template.dst[index.get(t0)!]!;
    const t2 = template.dst[index.get(t1)!]!;
    if (template.dst[index.get(t2)!] !== t0) continue;
    targets.set(keyOf(t0, t1, t2), template);
  }
  const start = keyOf(a, b, c);
  const forward = new Map<number, { parent: number; atom: Atom | null }>([[start, { parent: -1, atom: null }]]);
  const reverse = new Map<number, { next: number; atom: Atom | null; template: Template }>();
  for (const [key, template] of targets) reverse.set(key, { next: -1, atom: null, template });
  let forwardFrontier = [start];
  let reverseFrontier = [...targets.keys()];
  const reconstruct = (meet: number): { setup: Atom[]; template: Template } => {
    const prefix: Atom[] = []; let current = meet;
    while (true) {
      const node = forward.get(current)!;
      if (!node.atom) break;
      prefix.push(node.atom); current = node.parent;
    }
    prefix.reverse();
    const suffix: Atom[] = [];
    current = meet;
    while (true) {
      const node = reverse.get(current)!;
      if (!node.atom) return { setup: [...prefix, ...suffix], template: node.template };
      suffix.push(node.atom); current = node.next;
    }
  };
  const decode = (key: number): [number, number, number] => {
    let rest = key;
    const z = rest % N; rest = (rest - z) / N;
    const y = rest % N; const x = (rest - y) / N;
    return [x, y, z];
  };
  const alphabet = setupAlphabetFor(orbit);
  const inverseAlphabet = alphabet.map((atom) => inverseAtom(atom));
  const direct = reverse.get(start);
  if (direct) return [...direct.template.word];

  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (forwardFrontier.length <= reverseFrontier.length) {
      const next: number[] = [];
      for (const key of forwardFrontier) {
        const [x, y, z] = decode(key);
        for (const atom of alphabet) {
          const nx = atom.map.get(x) ?? x;
          const ny = atom.map.get(y) ?? y;
          const nz = atom.map.get(z) ?? z;
          if (nx === x && ny === y && nz === z) continue;
          const nextKey = keyOf(nx, ny, nz);
          if (forward.has(nextKey)) continue;
          forward.set(nextKey, { parent: key, atom }); next.push(nextKey);
          if (reverse.has(nextKey)) {
            const found = reconstruct(nextKey);
            return [...found.setup, ...found.template.word, ...inverseWord(found.setup)];
          }
        }
      }
      forwardFrontier = next;
    } else {
      const next: number[] = [];
      for (const key of reverseFrontier) {
        const [x, y, z] = decode(key);
        const inherited = reverse.get(key)!;
        for (let index = 0; index < alphabet.length; index += 1) {
          const inverse = inverseAlphabet[index]!;
          const px = inverse.map.get(x) ?? x;
          const py = inverse.map.get(y) ?? y;
          const pz = inverse.map.get(z) ?? z;
          if (px === x && py === y && pz === z) continue;
          const previousKey = keyOf(px, py, pz);
          if (reverse.has(previousKey)) continue;
          reverse.set(previousKey, { next: key, atom: alphabet[index]!, template: inherited.template });
          next.push(previousKey);
          if (forward.has(previousKey)) {
            const found = reconstruct(previousKey);
            return [...found.setup, ...found.template.word, ...inverseWord(found.setup)];
          }
        }
      }
      reverseFrontier = next;
    }
    if (forwardFrontier.length === 0 || reverseFrontier.length === 0) break;
    if (forward.size + reverse.size > 2_000_000) break;
  }
  return null;
};

const finishSmallEvenPermutation = (orbit: number, sites: number[]): Atom[][] | null => {
  const words: Atom[][] = [];
  let guard = 0;
  while (true) {
    if (++guard > sites.length * 2) return null;
    const seen = new Set<number>();
    const cycles: number[][] = [];
    for (const start of sites) {
      if (seen.has(start) || state.pieceAtSite[start] === start) continue;
      const cycle: number[] = [];
      let current = start;
      do { seen.add(current); cycle.push(current); current = state.pieceAtSite[current]!; } while (current !== start);
      cycles.push(cycle);
    }
    if (cycles.length === 0) return words;
    const long = cycles.find((cycle) => cycle.length >= 3);
    if (long) {
      const cycle: [number, number, number] = [long[0]!, long[1]!, long[2]!];
      const word = findThreeCycleWord(orbit, cycle, 8);
      if (!word) return null;
      applyWord(state, word); words.push(word);
      continue;
    }
    if (cycles.length < 2) return null; // an odd residual transposition is unreachable after parity normalization
    const [a, b] = cycles[0]!;
    const [c, d] = cycles[1]!;
    const first = findThreeCycleWord(orbit, [a!, c!, d!], 8);
    if (!first) return null;
    applyWord(state, first); words.push(first);
    const second = findThreeCycleWord(orbit, [a!, c!, b!], 8);
    if (!second) return null;
    applyWord(state, second); words.push(second);
  }
};

// ---------- orbit-by-orbit placement ----------
const started = performance.now();
let toolsUsed = 0;
for (let orbit = 0; orbit < orbitSites.length; orbit += 1) {
  const sites = orbitSites[orbit]!;
  let guard = 0;
  while (true) {
    const unsolved = sites.filter((site) => state.siteOfPiece[site] !== site);
    if (unsolved.length === 0) break;
    if (++guard > sites.length * 4) throw new Error(`orbit ${orbit} placement budget exhausted (${unsolved.length} left; template width ${templateVariantsFor(orbit)[0]!.src.length})`);
    for (const site of sites) posProtected[site] = state.pieceAtSite[site] === site ? 1 : 0;
    if (unsolved.length <= 32) {
      const finish = finishSmallEvenPermutation(orbit, sites);
      if (!finish) throw new Error(`orbit ${orbit} (${siteClasses[sites[0]!]}) cannot finish its ${unsolved.length}-cell even permutation`);
      for (const word of finish) { emitted.push(...word); toolsUsed += 1; }
      continue;
    }
    const target = unsolved[0]!;
    const x = state.siteOfPiece[target]!;
    const sacrificeBudget = Math.max(1, templates[orbit]!.src.length - 2);
    const placement = findPlacement(orbit, x, target, 20, sacrificeBudget, unsolved.length === 3 ? 3 : 1);
    if (!placement) throw new Error(`orbit ${orbit} (${siteClasses[sites[0]!]}) cannot place ${target} from ${x}; ${unsolved.length} unsolved`);
    applyWord(state, placement.word); emitted.push(...placement.word); toolsUsed += 1;
  }
  for (const site of sites) posProtected[site] = 1;
  if ((orbit + 1) % 20 === 0 || orbit + 1 === orbitSites.length) {
    console.log(`placed ${orbit + 1}/${orbitSites.length} orbits; tools=${toolsUsed}, atoms=${emitted.length}`);
  }
}

const misplaced = [...state.siteOfPiece].filter((site, piece) => site !== piece).length;
const twistedBefore = [...state.rotOfPiece].filter((rotation) => rotation !== ROT_ID).length;
console.log(`\nseed=${process.argv[2] ?? 1}, scramble=${scrambleLength}, parity turns=${paritySolution.combo.size}`);
console.log(`position result: misplaced=${misplaced}, twisted=${twistedBefore}`);
console.log(`placement tools=${toolsUsed}, total atoms=${emitted.length}, runtime=${((performance.now() - started) / 1000).toFixed(1)}s`);

// ---------- orientation cleanup ----------
const rollAtSite = new Map<number, Atom[]>();
for (const atom of atoms) {
  if (atom.family !== 'ext-d3' || atom.map.size !== 1) continue;
  const [[site, destination]] = [...atom.map];
  if (site !== destination) continue;
  const list = rollAtSite.get(site) ?? [];
  list.push(atom); rollAtSite.set(site, list);
}
const directRoll = (site: number, rotation: number): Atom | undefined =>
  (rollAtSite.get(site) ?? []).find((atom) => rotMul[atom.rot]![rotation] === ROT_ID);

interface Twister { word: Atom[]; sites: number[]; rots: number[] }
interface OrientationCacheFile {
  d4Orbit: number;
  examples: Array<{ word: string[] }>;
}
const orientationCache = JSON.parse(
  readFileSync(new URL('./l3-orientation-tools.cache.json', import.meta.url), 'utf8'),
) as OrientationCacheFile;
const twisterCache = new Map<number, Twister[]>();
const twistersFor = (orbit: number): Twister[] => {
  const cached = twisterCache.get(orbit);
  if (cached) return cached;
  const variants = templateVariantsFor(orbit).filter((template) => template.src.length === 3);
  const out: Twister[] = [];
  const seen = new Set<string>();
  const record = (word: Atom[], candidates: Iterable<number>): void => {
    const action = actionOver(word, candidates);
    const sites: number[] = []; const rots: number[] = [];
    for (const [site, [to, rot]] of action.moves) {
      if (to !== site) return;
      if (rot !== ROT_ID) { sites.push(site); rots.push(rot); }
    }
    if (sites.length === 0) return;
    const key = sites.map((site, index) => `${site}#${rots[index]}`).sort().join(';');
    if (seen.has(key)) return;
    seen.add(key); out.push({ word, sites, rots });
  };

  const byPositionAction = new Map<string, Template[]>();
  for (const template of variants) {
    const key = template.src.map((site, index) => `${site}>${template.dst[index]}`).sort().join(';');
    const list = byPositionAction.get(key) ?? [];
    if (list.length < 12) list.push(template);
    byPositionAction.set(key, list);
  }
  for (const group of byPositionAction.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = 0; j < group.length; j += 1) {
        if (i === j || group[i]!.rots.join(',') === group[j]!.rots.join(',')) continue;
        record([...group[i]!.word, ...inverseWord(group[j]!.word)], group[i]!.src);
      }
    }
  }
  for (const [site, rolls] of rollAtSite) {
    if (orbitOfSite[site] !== orbit) continue;
    for (const roll of rolls) record([roll], [site]);
  }
  for (const template of variants) {
    for (const site of template.src) {
      for (const roll of rollAtSite.get(site) ?? []) {
        record(commutatorWord([roll], template.word), template.src);
      }
    }
  }
  if (orbit === orientationCache.d4Orbit) {
    for (const example of orientationCache.examples) {
      const word = example.word.map((id) => atomById.get(id)!);
      record(word, supportCandidates(word));
    }
  }
  twisterCache.set(orbit, out);
  return out;
};

const orientationDistanceCache = new Map<number, Uint8Array>();
const orientationDistancesAt = (target: number): Uint8Array => {
  const cached = orientationDistanceCache.get(target);
  if (cached) return cached;
  const orbit = orbitOfSite[target]!;
  const bySite = new Map<number, Array<{ rotation: number }>>();
  for (const twister of twistersFor(orbit)) {
    for (let index = 0; index < twister.sites.length; index += 1) {
      const site = twister.sites[index]!;
      const list = bySite.get(site) ?? [];
      list.push({ rotation: twister.rots[index]! }); bySite.set(site, list);
    }
  }
  const effects = new Set<number>();
  const start = target * 24 + ROT_ID;
  const seen = new Uint8Array(N * 24);
  seen[start] = 1;
  let frontier = [start];
  while (frontier.length) {
    const next: number[] = [];
    for (const key of frontier) {
      const site = Math.floor(key / 24); const rho = key % 24;
      for (const entry of bySite.get(site) ?? []) {
        effects.add(rotMul[rotInv[rho]!]![rotMul[entry.rotation]![rho]!]!);
      }
      for (const atom of orientationAlphabetFor(orbit)) {
        const destination = atom.map.get(site);
        if (destination === undefined) continue;
        const nextKey = destination * 24 + rotMul[atom.rot]![rho]!;
        if (seen[nextKey]) continue;
        seen[nextKey] = 1; next.push(nextKey);
      }
    }
    frontier = next;
  }
  const distances = new Uint8Array(24).fill(255);
  distances[ROT_ID] = 0;
  let rotationFrontier = [ROT_ID];
  while (rotationFrontier.length) {
    const next: number[] = [];
    for (const rotation of rotationFrontier) {
      for (const effect of effects) {
        // Reverse edge: if effect * before = rotation, then before = effect^-1 * rotation.
        const before = rotMul[rotInv[effect]!]![rotation]!;
        if (distances[before] !== 255) continue;
        distances[before] = distances[rotation]! + 1; next.push(before);
      }
    }
    rotationFrontier = next;
  }
  orientationDistanceCache.set(target, distances);
  return distances;
};
const orientationPotential = (site: number, rotation: number): number =>
  orientationDistancesAt(site)[rotation]!;

const findTwistDescent = (orbit: number, target: number, maxDepth: number): Atom[] | null => {
  const twisters = twistersFor(orbit);
  const bySite = new Map<number, Twister[]>();
  for (const twister of twisters) for (const site of twister.sites) {
    const list = bySite.get(site) ?? []; list.push(twister); bySite.set(site, list);
  }
  const start = target * 24 + ROT_ID;
  const visited = new Map<number, { parent: number; atom: Atom | null }>([[start, { parent: -1, atom: null }]]);
  let frontier = [start];
  const reconstruct = (key: number): Atom[] => {
    const setup: Atom[] = []; let current = key;
    while (true) {
      const node = visited.get(current)!;
      if (!node.atom) break;
      setup.push(node.atom); current = node.parent;
    }
    return setup.reverse();
  };
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    for (const key of frontier) {
      const site = Math.floor(key / 24);
      const setup = reconstruct(key);
      for (const twister of bySite.get(site) ?? []) {
        const word = [...setup, ...twister.word, ...inverseWord(setup)];
        const support = twister.sites.map((candidate) => preimageUnder(setup, candidate));
        const action = actionOver(word, support);
        let delta = 0; let positionIdentity = true;
        for (const [affected, [to, rotation]] of action.moves) {
          if (to !== affected) { positionIdentity = false; break; }
          const before = state.rotOfPiece[affected]!;
          const after = rotMul[rotation]![before]!;
          delta += orientationPotential(affected, after) - orientationPotential(affected, before);
        }
        if (positionIdentity && delta < 0) return word;
      }
    }
    if (depth === maxDepth) break;
    const next: number[] = [];
    for (const key of frontier) {
      const site = Math.floor(key / 24); const rotation = key % 24;
      for (const atom of orientationAlphabetFor(orbit)) {
        const destination = atom.map.get(site);
        if (destination === undefined) continue;
        const nextKey = destination * 24 + rotMul[atom.rot]![rotation]!;
        if (visited.has(nextKey)) continue;
        visited.set(nextKey, { parent: key, atom }); next.push(nextKey);
      }
    }
    frontier = next;
  }
  return null;
};

const findPairTwistDescent = (
  orbit: number,
  first: number,
  second: number,
  maxNodes: number,
): Atom[] | null => {
  const pairKey = (a: number, ra: number, b: number, rb: number) => ((a * 24 + ra) * N + b) * 24 + rb;
  const byPair = new Map<number, Twister[]>();
  for (const twister of twistersFor(orbit)) {
    if (twister.sites.length !== 2) continue;
    for (const [a, b] of [[twister.sites[0]!, twister.sites[1]!], [twister.sites[1]!, twister.sites[0]!]]) {
      const key = a * N + b;
      const list = byPair.get(key) ?? []; list.push(twister); byPair.set(key, list);
    }
  }
  const start = pairKey(first, ROT_ID, second, ROT_ID);
  const visited = new Map<number, { parent: number; atom: Atom | null }>([[start, { parent: -1, atom: null }]]);
  let frontier = [start];
  const reconstruct = (key: number): Atom[] => {
    const setup: Atom[] = []; let current = key;
    while (true) {
      const node = visited.get(current)!;
      if (!node.atom) break;
      setup.push(node.atom); current = node.parent;
    }
    return setup.reverse();
  };
  while (frontier.length && visited.size < maxNodes) {
    const next: number[] = [];
    for (const key of frontier) {
      let rest = key;
      const rb = rest % 24; rest = (rest - rb) / 24;
      const b = rest % N; rest = (rest - b) / N;
      const ra = rest % 24; const a = (rest - ra) / 24;
      const entries = byPair.get(a * N + b) ?? [];
      if (entries.length) {
        const setup = reconstruct(key);
        for (const twister of entries) {
          const word = [...setup, ...twister.word, ...inverseWord(setup)];
          const support = twister.sites.map((candidate) => preimageUnder(setup, candidate));
          const action = actionOver(word, support);
          let delta = 0; let identity = true;
          for (const [site, [to, rotation]] of action.moves) {
            if (site !== to) { identity = false; break; }
            const before = state.rotOfPiece[site]!;
            const after = rotMul[rotation]![before]!;
            delta += orientationPotential(site, after) - orientationPotential(site, before);
          }
          if (identity && delta < 0) return word;
        }
      }
      for (const atom of orientationAlphabetFor(orbit)) {
        const da = atom.map.get(a); const db = atom.map.get(b);
        if (da === undefined && db === undefined) continue;
        const na = da ?? a; const nb = db ?? b;
        const nra = da === undefined ? ra : rotMul[atom.rot]![ra]!;
        const nrb = db === undefined ? rb : rotMul[atom.rot]![rb]!;
        const nextKey = pairKey(na, nra, nb, nrb);
        if (visited.has(nextKey)) continue;
        visited.set(nextKey, { parent: key, atom }); next.push(nextKey);
        if (visited.size >= maxNodes) break;
      }
      if (visited.size >= maxNodes) break;
    }
    frontier = next;
  }
  return null;
};

let orientationTools = 0;
let orientationGuard = 0;
while (true) {
  if (++orientationGuard > 2000) throw new Error('orientation potential descent exceeded its guard');
  for (let site = 0; site < N; site += 1) {
    const roll = directRoll(site, state.rotOfPiece[site]!);
    if (!roll) continue;
    applyAtom(state, roll); emitted.push(roll);
  }
  const dirty = [...state.rotOfPiece]
    .map((rotation, site) => ({ rotation, site }))
    .filter(({ rotation }) => rotation !== ROT_ID);
  if (dirty.length === 0) break;
  let fix: Atom[] | null = null;
  for (const { site } of dirty) {
    fix = findTwistDescent(orbitOfSite[site]!, site, 20);
    if (fix) break;
  }
  if (!fix) {
    for (let i = 0; i < dirty.length && !fix; i += 1) {
      for (let j = i + 1; j < dirty.length && !fix; j += 1) {
        if (orbitOfSite[dirty[i]!.site] !== orbitOfSite[dirty[j]!.site]) continue;
        fix = findPairTwistDescent(orbitOfSite[dirty[i]!.site]!, dirty[i]!.site, dirty[j]!.site, 400_000);
      }
    }
  }
  if (!fix) {
    const summary = dirty.slice(0, 20).map(({ site, rotation }) =>
      `${site}:${siteClasses[site]}#${rotation}/p${orientationPotential(site, rotation)}`).join(' ');
    const inventories = [...new Set(dirty.map(({ site }) => orbitOfSite[site]!))]
      .map((orbit) => `${orbit}:${twistersFor(orbit).length}`)
      .join(' ');
    throw new Error(`no orientation descent for ${dirty.length} cells (twisters ${inventories}): ${summary}`);
  }
  applyWord(state, fix); emitted.push(...fix); orientationTools += 1;
}

const finalMisplaced = [...state.siteOfPiece].filter((site, piece) => site !== piece).length;
const finalTwisted = [...state.rotOfPiece].filter((rotation) => rotation !== ROT_ID).length;
console.log(`orientation tools=${orientationTools}, final misplaced=${finalMisplaced}, final twisted=${finalTwisted}`);
console.log(`final atoms=${emitted.length}, total runtime=${((performance.now() - started) / 1000).toFixed(1)}s`);

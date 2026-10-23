import { actionOver, inverseAtom, inverseWord, orbitAlphabet, type SparseAction, type SparseAtom, type SparseGroup } from './mengerSparseGroup';

interface Root { tuple: number[]; word: SparseAtom[]; support: number[] }

/**
 * Exhaustive ordered-pair transport. The largest Level 4 orbit has 1,536
 * sites, so the graph has at most 2,357,760 vertices. Dense typed arrays keep
 * its complete BFS bounded in memory. No triple graph or search cutoff occurs.
 *
 * For edge transport each anchor carries at least three distinct third sites;
 * at most two forbidden sites therefore cannot block all its pure 3-cycles.
 */
export class MengerPairTransport {
  readonly alphabet: SparseAtom[];
  readonly sites: number[];
  readonly local: Map<number, number>;
  readonly m: number;
  readonly roots: Root[] = [];
  readonly alternatives = new Map<number, Root[]>();
  readonly next: Int32Array;
  readonly generator: Int16Array;
  readonly rootOf: Int16Array;
  readonly visitedStates: number;
  readonly maxDistance: number;
  searches = 0;

  constructor(readonly group: SparseGroup, orbit: number, baseTuple: number[], baseWord: SparseAtom[], readonly pairEdges: boolean) {
    this.sites = group.orbits[orbit]!;
    this.m = this.sites.length;
    if (baseTuple.length !== (pairEdges ? 3 : 2)) throw new Error('Invalid pair-tool support');
    this.local = new Map(this.sites.map((s, i) => [s, i]));
    this.alphabet = orbitAlphabet(group, orbit);
    const permutations = this.alphabet.map((a) => Int16Array.from(this.sites, (s, i) => a.map.has(s) ? this.local.get(a.map.get(s)!)! : i));
    const inverses = permutations.map((p) => { const inv = new Int16Array(this.m); p.forEach((t, s) => { inv[t] = s; }); return inv; });
    const variants = [{ tuple: baseTuple.map((s) => this.local.get(s)!), word: baseWord }];
    const keyOfCycle = (t: number[]): string => pairEdges
      ? Math.min(...t.map((_, i) => [...t.slice(i), ...t.slice(0, i)].reduce((v, s) => v * this.m + s, 0))).toString()
      : t.join(',');
    const seen = new Set([keyOfCycle(variants[0]!.tuple)]);
    const limit = this.m >= 384 ? 1024 : this.m >= 96 ? 256 : 64;
    for (let head = 0; head < variants.length && variants.length < limit; head++) {
      const from = variants[head]!;
      for (let gi = 0; gi < this.alphabet.length && variants.length < limit; gi++) {
        const tuple = from.tuple.map((s) => inverses[gi]![s]!);
        const key = keyOfCycle(tuple);
        if (seen.has(key)) continue;
        seen.add(key);
        const g = this.alphabet[gi]!;
        variants.push({ tuple, word: [g, ...from.word, inverseAtom(group, g)] });
      }
    }
    const byEdge = new Map<number, Root[]>();
    const add = (support: number[], word: SparseAtom[]): void => {
      const tuple = support.slice(0, 2);
      const key = tuple[0]! * this.m + tuple[1]!;
      const list = byEdge.get(key) ?? [];
      if (!list.length || (pairEdges && list.length < 16 && !list.some((r) => r.support[2] === support[2]))) list.push({ tuple, support, word });
      byEdge.set(key, list);
    };
    for (const v of variants) {
      if (pairEdges) for (let r = 0; r < 3; r++) {
        add([...v.tuple.slice(r), ...v.tuple.slice(0, r)], v.word);
        const inv = [v.tuple[0]!, v.tuple[2]!, v.tuple[1]!];
        add([...inv.slice(r), ...inv.slice(0, r)], inverseWord(group, v.word));
      } else {
        add(v.tuple, v.word); add([v.tuple[1]!, v.tuple[0]!], v.word);
      }
    }
    for (const list of byEdge.values()) {
      if (pairEdges && list.length < 3) continue;
      this.alternatives.set(this.roots.length, list); this.roots.push(list[0]!);
    }
    if (!this.roots.length) throw new Error(`Orbit ${orbit} has no three-alternative edge anchor`);
    if (this.roots.length >= 32768 || this.alphabet.length >= 32768) throw new Error('Pair tables exceed their certified Level 4 index width');
    const size = this.m * this.m;
    this.next = new Int32Array(size).fill(-2);
    this.generator = new Int16Array(size).fill(-1);
    this.rootOf = new Int16Array(size).fill(-1);
    const queue = new Int32Array(size);
    let tail = 0;
    this.roots.forEach((r, i) => {
      const key = r.tuple[0]! * this.m + r.tuple[1]!;
      this.next[key] = -1; this.rootOf[key] = i; queue[tail++] = key;
    });
    // Generators fixing both sites give only self-loops. Restricting each
    // expansion to their incidence union preserves every nontrivial edge.
    const at: number[][] = Array.from({ length: this.m }, () => []);
    permutations.forEach((p, gi) => { p.forEach((to, s) => { if (s !== to) at[s]!.push(gi); }); });
    const stamps = new Int32Array(this.alphabet.length);
    let stamp = 0; let head = 0; let distance = 0;
    while (head < tail) {
      const end = tail;
      for (; head < end; head++) {
        const key = queue[head]!; const x = Math.floor(key / this.m); const y = key % this.m;
        stamp++;
        for (const point of [x, y]) for (const gi of at[point]!) {
          if (stamps[gi] === stamp) continue;
          stamps[gi] = stamp;
          const p = inverses[gi]!;
          const prior = p[x]! * this.m + p[y]!;
          if (this.next[prior] !== -2) continue;
          this.next[prior] = key; this.generator[prior] = gi; this.rootOf[prior] = this.rootOf[key]!;
          queue[tail++] = prior;
        }
      }
      if (tail > end) distance++;
    }
    if (tail !== this.m * (this.m - 1)) throw new Error(`Orbit ${orbit}: ordered-pair graph is disconnected`);
    this.visitedStates = tail; this.maxDistance = distance;
  }

  private find(pair: number[], forbidden: Set<number>): { word: SparseAtom[]; support: number[] } {
    this.searches++;
    const [x, y] = pair.map((s) => this.local.get(s));
    if (x === undefined || y === undefined || x === y) throw new Error('Pair is outside its orbit or repeats a site');
    let key = x * this.m + y;
    const root = this.rootOf[key]!;
    const setup: SparseAtom[] = [];
    while (this.next[key] !== -1) {
      if (this.next[key] === -2) throw new Error('Pair table has an unreachable entry');
      setup.push(this.alphabet[this.generator[key]!]!); key = this.next[key]!;
    }
    const inverse = inverseWord(this.group, setup);
    for (const r of this.alternatives.get(root)!) {
      const support = r.support.map((s) => {
        let site = this.sites[s]!;
        for (const a of inverse) site = a.map.get(site) ?? site;
        return site;
      });
      if (support.some((s) => forbidden.has(s))) continue;
      return { word: [...setup, ...r.word, ...inverse], support };
    }
    throw new Error('Three certified alternatives were all blocked');
  }
  wordFor(pair: number[]): SparseAtom[] { return this.find(pair, new Set()).word; }
  cycleForEdge(pair: number[], forbidden: Set<number>): { word: SparseAtom[]; action: SparseAction } {
    if (!this.pairEdges || forbidden.size > 2) throw new Error('Edge transport supports at most two forbidden sites');
    const r = this.find(pair, forbidden);
    return { word: r.word, action: actionOver(r.word, r.support) };
  }
}

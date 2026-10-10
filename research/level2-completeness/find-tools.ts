/**
 * Searches the standard Level 2 atoms for the fourteen tool words the
 * completeness proof uses, and writes them to `out/tools.json`:
 *
 *   - one pure 3-cycle per site orbit (11 words),
 *   - one position-fixing two-cell twist for each C3 orbit (2 words),
 *   - one position-fixing two-cell flip for the D4 orbit (1 word).
 *
 * The search is only a search. Nothing found here is trusted: `certify.ts`
 * re-checks every word from scratch.
 *
 * Run: `node --import tsx research/level2-completeness/find-tools.ts`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildContext, siteOrbits } from './group';
import type { Elt } from './group';

console.debug = () => {};
const ctx = buildContext('standard');
const { N, atoms, mul, inv } = ctx;
const { orbitOf, orbits } = siteOrbits(N, atoms);
const comm = (a: number[], b: number[]) => [...a, ...b, ...ctx.inverseWord(a), ...ctx.inverseWord(b)];
const isPureThreeCycle = (e: Elt): number[] | null => {
  const sp = ctx.support(e);
  return sp.length === 3 && sp.every((s) => e.perm[s] !== s) ? sp : null;
};

const threeCycles = new Map<number, number[]>();

// (a) [x, y c y^-1] over frame atoms: the Rubik-style corner commutator.
const frames = atoms.filter((a) => a.move.targetKind === 'frame');
search: for (const b of frames) for (const c of frames) {
  if (c.index === b.index || c.index === b.inverse) continue;
  const Y = mul(mul(b, c), atoms[b.inverse]!);
  const Yi = inv(Y);
  for (const a of frames) {
    const sp = isPureThreeCycle(mul(mul(mul(a, Y), atoms[a.inverse]!), Yi));
    if (!sp) continue;
    const orbit = orbitOf[sp[0]!]!;
    if (!threeCycles.has(orbit)) threeCycles.set(orbit, comm([a.index], [b.index, c.index, b.inverse]));
  }
  if ([0, 2, 8, 10].every((orbit) => threeCycles.has(orbit))) break search;
}

// (b) [X, Y] for small-support commutators X, Y of atoms that share exactly one site.
const pool: Array<{ word: number[]; supp: number[]; set: Set<number> }> = [];
const seen = new Set<string>();
for (const a of atoms) for (const b of atoms) {
  if (a.index >= b.index) continue;
  const word = comm([a.index], [b.index]);
  const e = ctx.ofWord(word);
  const supp = ctx.support(e);
  if (supp.length === 0 || supp.length > 24) continue;
  const key = `${supp.join(',')}|${supp.map((i) => e.perm[i]).join(',')}`;
  if (seen.has(key)) continue;
  seen.add(key);
  pool.push({ word, supp, set: new Set(supp) });
}
outer: for (let i = 0; i < pool.length; i += 1) {
  const X = pool[i]!;
  for (let j = i + 1; j < pool.length; j += 1) {
    const Y = pool[j]!;
    let common = 0;
    for (const s of Y.supp) if (X.set.has(s) && (common += 1) > 1) break;
    if (common !== 1) continue;
    const word = comm(X.word, Y.word);
    const sp = isPureThreeCycle(ctx.ofWord(word));
    if (!sp) continue;
    const orbit = orbitOf[sp[0]!]!;
    if (!threeCycles.has(orbit)) threeCycles.set(orbit, word);
    if (threeCycles.size === orbits.length) break outer;
  }
}
if (threeCycles.size !== orbits.length) throw new Error(`3-cycles found for ${threeCycles.size}/${orbits.length} orbits`);

// (c) two-cell position-fixing tools: quotients of two conjugates of a 3-cycle with the same site action.
const actionKey = (e: Elt, sp: number[]) => sp.map((s) => `${s}>${e.perm[s]}:${e.rot[s]}`).join(' ');
const pairTool = (orbit: number): number[] => {
  const T = threeCycles.get(orbit)!;
  const conj = (g: number[]) => [...g, ...T, ...ctx.inverseWord(g)];
  const touching = atoms.filter((a) => ctx.support(a).some((s) => orbitOf[s] === orbit));
  const Te = ctx.ofWord(T);
  const known = new Set([actionKey(Te, ctx.support(Te))]);
  const byPerm = new Map<string, Array<{ g: number[]; e: Elt }>>();
  const queue: Array<{ g: number[]; e: Elt }> = [{ g: [], e: Te }];
  const consider = (item: { g: number[]; e: Elt }): number[] | null => {
    const sp = ctx.support(item.e);
    const key = sp.map((s) => `${s}>${item.e.perm[s]}`).join(' ');
    const list = byPerm.get(key) ?? [];
    byPerm.set(key, list);
    for (const other of list) {
      if (ctx.support(mul(item.e, inv(other.e))).length === 2) return [...conj(item.g), ...ctx.inverseWord(conj(other.g))];
    }
    list.push(item);
    return null;
  };
  consider(queue[0]!);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const a of touching) {
      const e = mul(mul(atoms[a.inverse]!, current.e), a);
      const key = actionKey(e, ctx.support(e));
      if (known.has(key)) continue;
      known.add(key);
      const item = { g: [a.inverse, ...current.g], e };
      const found = consider(item);
      if (found) return found;
      queue.push(item);
    }
  }
  throw new Error(`no two-cell tool found on orbit ${orbit}`);
};

const labels = (word: number[]) => word.map((index) => atoms[index]!.label);
const out = {
  note: 'Search output only. Verified independently by certify.ts.',
  orbitRepresentatives: orbits.map((orbit) => ctx.sites[orbit[0]!]),
  threeCycles: orbits.map((_, orbit) => labels(threeCycles.get(orbit)!)),
  pairTools: Object.fromEntries(
    orbits.flatMap((orbit, index) => {
      // Orbits whose cells have several admissible orientations and no single-cell roll for all of them.
      return [0, 4, 10].includes(index) ? [[String(index), labels(pairTool(index))]] : [];
    }),
  ),
};
mkdirSync('research/level2-completeness/out', { recursive: true });
writeFileSync('research/level2-completeness/out/tools.json', `${JSON.stringify(out, null, 1)}\n`);
console.log('3-cycle word lengths', out.threeCycles.map((w) => w.length).join(','), '; pair tools', Object.entries(out.pairTools).map(([k, w]) => `${k}:${w.length}`).join(' '));

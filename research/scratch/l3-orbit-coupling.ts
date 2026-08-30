/**
 * Detect position orbits whose actions are diagonally coupled.
 *
 * Two orbits are coupled when there is a bijection phi between their sites for
 * which phi(g(s)) = g(phi(s)) for every legal atom g.  Such orbits carry the
 * same permutation under every reachable word and therefore have to be solved
 * as one diagonal component rather than as independent phases.
 *
 * Run: `npx tsx research/scratch/l3-orbit-coupling.ts` from the repo root.
 */
import { atoms, N, siteClasses } from './l3sim';

// ---------- position orbits ----------
const parent = new Int32Array(N).map((_, i) => i);
const findRoot = (x: number): number => {
  let root = x;
  while (parent[root] !== root) root = parent[root]!;
  while (parent[x] !== root) { const next = parent[x]!; parent[x] = root; x = next; }
  return root;
};
for (const atom of atoms) for (const [from, to] of atom.map) {
  if (from === to) continue;
  const a = findRoot(from);
  const b = findRoot(to);
  if (a !== b) parent[a] = b;
}
const orbitOfSite = new Int16Array(N).fill(-1);
const orbitSites: number[][] = [];
{
  const index = new Map<number, number>();
  for (let site = 0; site < N; site += 1) {
    const root = findRoot(site);
    let orbit = index.get(root);
    if (orbit === undefined) {
      orbit = orbitSites.length;
      index.set(root, orbit);
      orbitSites.push([]);
    }
    orbitOfSite[site] = orbit;
    orbitSites[orbit]!.push(site);
  }
}

// A corresponding site must be moved by exactly the same labelled atoms.  The
// exact signature makes candidate bijections nearly unique before verification.
const movedBySite: number[][] = Array.from({ length: N }, () => []);
for (let atomIndex = 0; atomIndex < atoms.length; atomIndex += 1) {
  for (const [from, to] of atoms[atomIndex]!.map) {
    if (from !== to) movedBySite[from]!.push(atomIndex);
  }
}
const signature = movedBySite.map((indices) => indices.join(','));
const sitesBySignature = new Map<string, number[]>();
for (let site = 0; site < N; site += 1) {
  const list = sitesBySignature.get(signature[site]!) ?? [];
  list.push(site);
  sitesBySignature.set(signature[site]!, list);
}

const coupledBijection = (a: number, b: number): Int16Array | null => {
  if (orbitSites[a]!.length !== orbitSites[b]!.length) return null;
  const aSet = new Set(orbitSites[a]!);
  const bSet = new Set(orbitSites[b]!);
  const startA = orbitSites[a]![0]!;
  const candidates = (sitesBySignature.get(signature[startA]!) ?? []).filter((site) => bSet.has(site));

  for (const startB of candidates) {
    const forward = new Int16Array(N).fill(-1);
    const reverse = new Int16Array(N).fill(-1);
    forward[startA] = startB;
    reverse[startB] = startA;
    const queue = [startA];
    let valid = true;
    for (let cursor = 0; cursor < queue.length && valid; cursor += 1) {
      const x = queue[cursor]!;
      const y = forward[x]!;
      if (signature[x] !== signature[y]) { valid = false; break; }
      for (const atomIndex of movedBySite[x]!) {
        const atom = atoms[atomIndex]!;
        const nx = atom.map.get(x) ?? x;
        const ny = atom.map.get(y) ?? y;
        if (!aSet.has(nx) || !bSet.has(ny)) { valid = false; break; }
        if (forward[nx] === -1 && reverse[ny] === -1) {
          forward[nx] = ny;
          reverse[ny] = nx;
          queue.push(nx);
        } else if (forward[nx] !== ny || reverse[ny] !== nx) {
          valid = false;
          break;
        }
      }
    }
    if (!valid || queue.length !== orbitSites[a]!.length) continue;

    // Full verification includes atoms fixing a site, which the propagation
    // loop intentionally omitted for speed.
    outer:
    for (const x of orbitSites[a]!) {
      const y = forward[x]!;
      for (const atom of atoms) {
        const nx = atom.map.get(x) ?? x;
        const ny = atom.map.get(y) ?? y;
        if (forward[nx] !== ny) { valid = false; break outer; }
      }
    }
    if (valid) return forward;
  }
  return null;
};

const coupledParent = new Int16Array(orbitSites.length).map((_, i) => i);
const findCoupledRoot = (x: number): number => {
  while (coupledParent[x] !== x) x = coupledParent[x]!;
  return x;
};
const links: Array<[number, number]> = [];
for (let a = 0; a < orbitSites.length; a += 1) {
  for (let b = a + 1; b < orbitSites.length; b += 1) {
    if (orbitSites[a]!.length !== orbitSites[b]!.length) continue;
    if (!coupledBijection(a, b)) continue;
    links.push([a, b]);
    const ra = findCoupledRoot(a);
    const rb = findCoupledRoot(b);
    if (ra !== rb) coupledParent[ra] = rb;
  }
}

const components = new Map<number, number[]>();
for (let orbit = 0; orbit < orbitSites.length; orbit += 1) {
  const root = findCoupledRoot(orbit);
  const list = components.get(root) ?? [];
  list.push(orbit);
  components.set(root, list);
}

const nontrivial = [...components.values()].filter((component) => component.length > 1);
console.log(`diagonal links: ${links.length}`);
console.log(`nontrivial diagonal components: ${nontrivial.length}\n`);
for (const component of nontrivial) {
  console.log(component.map((orbit) => `${orbit}:${siteClasses[orbitSites[orbit]![0]!]!}(${orbitSites[orbit]!.length})`).join('  <=>  '));
}

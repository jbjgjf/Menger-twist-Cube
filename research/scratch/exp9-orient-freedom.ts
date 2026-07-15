/**
 * Experiment 9: per-class orientation freedom.
 * Single-piece automaton: states (site, rot), transitions = atoms.
 * Reachable set from (home, ID) gives the exact orientation freedom of a lone piece.
 */
import { atoms, N, ROT_ID, rotMul, siteClasses, sitePositions } from './sim';

const classes = ['CC', 'CE', 'EC', 'EEa', 'EEo'] as const;
for (const cls of classes) {
  const home = sitePositions.findIndex((_, i) => siteClasses[i] === cls);
  const S = N * 24;
  const visited = new Uint8Array(S);
  const start = home * 24 + ROT_ID;
  visited[start] = 1;
  let frontier = [start];
  while (frontier.length) {
    const next: number[] = [];
    for (const key of frontier) {
      const site = Math.floor(key / 24);
      const rot = key % 24;
      for (const a of atoms) {
        if (!a.affected[site]) continue;
        const nkey = a.perm[site]! * 24 + rotMul[a.rot]![rot]!;
        if (!visited[nkey]) { visited[nkey] = 1; next.push(nkey); }
      }
    }
    frontier = next;
  }
  const rotsPerSite = new Map<number, number>();
  for (let key = 0; key < S; key += 1) {
    if (!visited[key]) continue;
    const site = Math.floor(key / 24);
    rotsPerSite.set(site, (rotsPerSite.get(site) ?? 0) + 1);
  }
  const sites = [...rotsPerSite.keys()];
  const counts = [...new Set(rotsPerSite.values())];
  console.log(`${cls}: piece@(${sitePositions[home]}) reaches ${sites.length} sites; rots per site: ${counts.join(',')}`);
  // and at home specifically
  console.log(`   at home: ${rotsPerSite.get(home)} orientations reachable`);
}

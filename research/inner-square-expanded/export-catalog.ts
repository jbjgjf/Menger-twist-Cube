import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getCachedSparseGroup } from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import { certifyMove } from '../square-rotation/exact-sweep-certificate';
import type { TwistAngle } from '../../packages/engine/src/index';
interface Profile { level: number; pattern: number; layer: number; complete: boolean; exactCollisionWitnesses: boolean; exactWitnessChecks: number; targets: Array<{pivot: [number,number]; cells: [number,number][]; angles: TwistAngle[]}>; sha256: string }
const maxLevel = Number(process.argv[2] ?? 3);
const catalog: Record<string, unknown> = {};
const reports = [];
const signature = (pivot: number[], cells: number[][]) => `${pivot.join(',')}|${cells.map(p => p.join(',')).sort().join(';')}`;
for (const level of [2,3,4].filter(n => n <= maxLevel)) {
  const group = getCachedSparseGroup(level);
  const profiles: Profile[] = [];
  for (let pattern=0; pattern<2**level; pattern++) {
    const file = `research/inner-square-expanded/out/L${level}/profile-${pattern}.json`;
    if (!existsSync(file)) throw new Error(`Missing exhaustive profile ${file}`);
    const p = JSON.parse(readFileSync(file,'utf8')) as Profile;
    if (!p.complete || !p.exactCollisionWitnesses || p.sha256 !== createHash('sha256').update(JSON.stringify(p.targets)).digest('hex')) throw new Error('Incomplete or stale profile');
    profiles.push(p);
  }
  const additional = [];
  let exactChecks=0, judgeOnly=0;
  for (const p of profiles) {
    const standard = new Map<string, Set<number>>();
    for (const a of group.atoms) {
      const target = group.canonical.turnTargetById.get(a.move.targetId)!;
      if (target.axisName !== 'X') continue;
      const cells = [...a.map.keys()].map(s => group.sites[s]!);
      if (!cells.every(c => c[0] === p.layer)) continue;
      const sig = signature([target.pivot[1],target.pivot[2]],cells.map(c => [c[1],c[2]]));
      const angles = standard.get(sig) ?? new Set<number>(); angles.add(a.angle); standard.set(sig,angles);
    }
    const occupied = group.sites.filter(s => s[0] === p.layer);
    const targets = [];
    for (const [i,t] of p.targets.entries()) {
      const u=t.cells.map(p=>p[0]),v=t.cells.map(p=>p[1]);
      if(Math.max(...u)-Math.min(...u)!==Math.max(...v)-Math.min(...v)||Math.max(...u)+Math.min(...u)!==2*t.pivot[0]||Math.max(...v)+Math.min(...v)!==2*t.pivot[1])throw new Error('Exact square-envelope failure');
      const sig = signature(t.pivot,t.cells);
      const old = standard.get(sig);
      if (old && t.angles.every(a => old.has(a))) continue;
      if (old) throw new Error('Partial-angle duplicate requires explicit treatment');
      for (const angle of t.angles) {
        const verdict = certifyMove({id:`profile${p.pattern}:${i}`,axis:[1,0,0],pivot:[p.layer,...t.pivot],angle,support:t.cells.map(([u,v])=>[p.layer,u,v])},'additional',occupied);
        if (!verdict.endpointClosesExactly || verdict.squareEnvelopeExact === false) throw new Error('Exact geometry failure');
        exactChecks++; if (verdict.status !== 'exact-certified') judgeOnly++;
      }
      targets.push(t);
    }
    additional.push({pattern:p.pattern,targets});
  }
  // L2 must reproduce the already audited 18 targets / 54 atoms exactly.
  let totalTargets=0,totalAtoms=0;
  const extent=(3**level-1)/2;
  for(let l=-extent;l<=extent;l++) {
    let v=l+extent, pattern=0;
    for(let d=0;d<level;d++){if(v%3!==1)pattern|=1<<d;v=Math.floor(v/3);}
    const list=additional[pattern]!.targets;totalTargets+=3*list.length;totalAtoms+=3*list.reduce((n,t)=>n+t.angles.length,0);
  }
  if(level===2 && (totalTargets!==18 || totalAtoms!==54)) throw new Error(`L2 audit mismatch: ${totalTargets}/${totalAtoms}`);
  if(judgeOnly) throw new Error(`Exact swept-volume proof missing for ${judgeOnly} accepted profile atoms`);
  if(level>=3)catalog[level]={profiles:additional};
  reports.push({level,complete:true,exactCollisionWitnesses:true,exactRejectionWitnessChecks:profiles.reduce((n,p)=>n+p.exactWitnessChecks,0),additionalTargets:totalTargets,additionalAtoms:totalAtoms,exactProfileAtomChecks:exactChecks,judgeOnly});
  console.log(JSON.stringify(reports.at(-1)));
}
mkdirSync('packages/engine/src/data',{recursive:true});
writeFileSync('packages/engine/src/data/innerSquareCatalog.json',JSON.stringify(catalog)+'\n');
writeFileSync('research/inner-square-expanded/out/catalog-report.json',JSON.stringify({maxLevel,reports,catalogSha256:createHash('sha256').update(JSON.stringify(catalog)).digest('hex')},null,2)+'\n');

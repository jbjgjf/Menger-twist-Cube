import {writeFileSync} from 'node:fs';
import {getCachedSparseGroup,orientationFrames,parityBasis} from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
const level=Number(process.argv[2]??3);const old=getCachedSparseGroup(level);const group=getCachedSparseGroup(level,'inner-square');
const frames=orientationFrames(group);
const merged=group.orbits.map((sites,i)=>({orbit:i,size:sites.length,freedom:frames[i]!.freedom.length,oldOrbits:[...new Set(sites.map(s=>old.orbitOf[s]!))]}));
const sizes:Record<string,number>={};const freedoms:Record<string,number>={};for(const o of merged){sizes[o.size]=(sizes[o.size]??0)+1;freedoms[o.freedom]=(freedoms[o.freedom]??0)+1;}
const result={level,atoms:group.atoms.length,oldOrbits:old.orbits.length,newOrbits:group.orbits.length,rank:parityBasis(group).length,maxOrbit:Math.max(...group.orbits.map(o=>o.length)),sizes,freedoms,merged};
writeFileSync(`research/inner-square-expanded/out/census-L${level}.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,merged:undefined}));

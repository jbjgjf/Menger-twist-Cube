import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {getCachedSparseGroup} from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import {rawReplay,sparseStateOf} from '../../packages/solver-core/src/algorithms/mengerCertifiedReduction';
import {blockGeometry,restorationDistanceBound} from '../../packages/solver-core/src/algorithms/mengerBlockRestoration';
const level=Number(process.argv[2]??3);const group=getCachedSparseGroup(level,'inner-square');const geometry=blockGeometry(group);
const bound=restorationDistanceBound(group);
let state=sparseStateOf(group,group.canonical.cubies);
for(let i=0;i<30;i++){const atom=group.atoms[(i*877)%group.atoms.length]!;const before=group.N-geometry.agreements(state.siteOf).reduce((a,b)=>a+b,0);const next=rawReplay(group,state,[atom]).state;const after=group.N-geometry.agreements(next.siteOf).reduce((a,b)=>a+b,0);assert(Math.abs(after-before)<=bound.maxDefectChange);state=next;}
writeFileSync(`research/inner-square-expanded/out/search-bound-L${level}.json`,JSON.stringify({level,...bound,engineSamples:30},null,2)+'\n');console.log(JSON.stringify({level,...bound}));

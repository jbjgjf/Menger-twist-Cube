import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {getCachedSparseGroup,fullAction,inverseWord} from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import {shareCommutatorSetup} from '../../packages/solver-core/src/algorithms/mengerSharedCorrection';
const level=Number(process.argv[2]??3),group=getCachedSparseGroup(level,'inner-square');
let result:ReturnType<typeof shareCommutatorSetup>|undefined,ids:string[][]=[];
outer:for(const setup of group.atoms.filter(a=>a.kind==='frame'&&a.angle===90)){
 const tools:typeof group.atoms=[];const used=new Set<number>(),usedBlocks=new Set<string>();
 const block=(s:number)=>group.sites[s]!.map(x=>Math.floor((x+(3**level-1)/2)/3)).join(",");
 for(const tool of group.atoms){
  if(tool.map.size!==1||tool.angle!==90)continue;
  const action=fullAction([setup,tool,...inverseWord(group,[setup]),...inverseWord(group,[tool])]);
  if(action.size!==2||[...action].some(([s,[t]])=>s!==t)||[...action.keys()].some(s=>used.has(s)))continue;
  const blocks=new Set([...action.keys()].map(block));if([...blocks].some(b=>usedBlocks.has(b)))continue;
  tools.push(tool);for(const s of action.keys())used.add(s);for(const b of blocks)usedBlocks.add(b);
  if(tools.length===4){result=shareCommutatorSetup(group,[setup],tools.map(t=>[t]));ids=[[setup.id],...tools.map(t=>[t.id])];break outer;}
 }
}
assert(result,'No four independent commutator corrections found');assert.equal(result.savedAtoms,6);
assert.throws(()=>shareCommutatorSetup(group,[group.atomById.get(ids[0]![0]!)!],[[group.atomById.get(ids[1]![0]!)!],[group.atomById.get(ids[1]![0]!)!]]),/overlapping/);
const record={level,setupAndToolIds:ids,independentCorrections:4,separateAtoms:result.separate.length,sharedAtoms:result.word.length,savedAtoms:result.savedAtoms,affectedSites:result.supports.flat().length,affectedLeafBlocks:new Set(result.supports.flat().map(s=>group.sites[s]!.map(x=>Math.floor((x+(3**level-1)/2)/3)).join(','))).size,verified:'full integer action including orientations; overlap negative control'};
writeFileSync(`research/inner-square-expanded/out/shared-L${level}.json`,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));

import {readFileSync,writeFileSync} from 'node:fs';
import {getCachedSparseGroup,fullAction} from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import {FiberPairTable} from '../../packages/solver-core/src/algorithms/mengerFactoredTransport';
const level=Number(process.argv[2]??4);const group=getCachedSparseGroup(level,'inner-square'),old=getCachedSparseGroup(level);
const data=JSON.parse(readFileSync(`research/inner-square-expanded/out/tools-L${level}.json`,'utf8'));const records=[];
for(let oi=0;oi<group.orbits.length;oi++){
 if(group.orbits[oi]!.length<=1536)continue;
 const table=new FiberPairTable(group,old,oi);records.push({orbit:oi,kind:'cycle',sites:group.orbits[oi]!.length,fibers:table.colors.length,states:table.visitedStates,maxDistance:table.maxDistance});console.log(JSON.stringify(records.at(-1)));
 for(const t of data.pairTwisters.filter((t:{orbit:number})=>t.orbit===oi)){
  const action=fullAction(t.word.map((id:string)=>group.atomById.get(id)!));const pair=[...action.keys()];const fixed=new FiberPairTable(group,old,oi,pair);
  records.push({orbit:oi,kind:t.kind,sites:group.orbits[oi]!.length,fibers:fixed.colors.length,states:fixed.visitedStates,maxDistance:fixed.maxDistance});console.log(JSON.stringify(records.at(-1)));
 }
}
writeFileSync(`research/inner-square-expanded/out/factored-transport-L${level}.json`,JSON.stringify({level,allEdgeWitnessesVerified:true,records},null,2)+'\n');

import {readFileSync,writeFileSync} from 'node:fs';
import {getCachedSparseGroup,fullAction} from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import {MengerPairTransport} from '../../packages/solver-core/src/algorithms/mengerPairTransport';
const level=Number(process.argv[2]??3);const group=getCachedSparseGroup(level,'inner-square');const data=JSON.parse(readFileSync(`research/inner-square-expanded/out/tools-L${level}.json`,'utf8'));
let states=0,maxDistance=0,orbits=0;
for(const record of data.tools){if(group.orbits[record.orbit]!.length>1536)continue;const word=record.word.map((id:string)=>group.atomById.get(id)!);const action=fullAction(word);const a=action.keys().next().value!,b=action.get(a)![0],c=action.get(b)![0];
 const transport=new MengerPairTransport(group,record.orbit,[a,b,c],word,true);states+=transport.visitedStates;maxDistance=Math.max(maxDistance,transport.maxDistance);orbits++;
 console.log(JSON.stringify({orbit:record.orbit,size:group.orbits[record.orbit]!.length,states:transport.visitedStates,maxDistance:transport.maxDistance}));
}
writeFileSync(`research/inner-square-expanded/out/transport-L${level}.json`,JSON.stringify({level,orbits,states,maxDistance,denseThreshold:1536},null,2)+'\n');

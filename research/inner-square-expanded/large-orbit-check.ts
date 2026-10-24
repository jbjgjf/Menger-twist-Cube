import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {getCachedSparseGroup,rotMul,rotInv} from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import {getInnerSignature} from '../../packages/solver-core/src/algorithms/mengerInnerSquareReduction';
import {allBlockRotations} from '../../packages/solver-core/src/algorithms/blockRotations';
import {createInnerSquareCertifiedAlgorithm} from '../../packages/solver-core/src/algorithms/innerSquareCertifiedSolver';
import {createMengerPuzzleModel} from '../../packages/solver-core/src/model/mengerPuzzleModel';
const group=getCachedSparseGroup(4,'inner-square'),old=getCachedSparseGroup(4),sig=getInnerSignature(group),model=createMengerPuzzleModel('inner-square');
const records=[];
for(const oi of [4,41]){
 const sites=group.orbits[oi]!;const byColor=new Map<number,number>();for(const s of sites)byColor.set(old.orbitOf[s]!,s);
 const triple=[...byColor.values()].slice(0,3);const state=model.cloneState(group.canonical);
 for(let i=0;i<3;i++){const home=triple[i]!,dest=triple[(i+1)%3]!,frame=sig.frames[oi]!;
  state.cubies[home]!.currentPosition=[...group.sites[dest]!];state.cubies[home]!.orientation=allBlockRotations[rotMul[frame.ref[dest]!]![rotInv[frame.ref[home]!]!]!]!.quaternion.clone();
 }
 const result=await createInnerSquareCertifiedAlgorithm(4).solve(model,state);assert(result.success,result.notes);
 let fullEngine=false;
 if(result.move_count<1000){let endpoint=state;for(const move of result.output_moves)endpoint=model.applyMove(endpoint,move);assert(model.isSolved(endpoint));fullEngine=true;}
 const record={orbit:oi,size:sites.length,oldFibers:byColor.size,moves:result.move_count,ms:result.runtime_ms,fullEngine,phase:result.explanation[0]!.observation};records.push(record);console.log(JSON.stringify(record));
}
writeFileSync('research/inner-square-expanded/out/large-orbit-check.json',JSON.stringify(records,null,2)+'\n');

import {getInnerSignature} from '../../packages/solver-core/src/algorithms/mengerInnerSquareReduction';
import {expandWord,type WordNode} from '../../packages/solver-core/src/algorithms/mengerAbelianSignature';
import {rawReplay,type SparsePuzzleState} from '../../packages/solver-core/src/algorithms/mengerCertifiedReduction';
import {rotMul,rotInv,type SparseGroup} from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
/** Ideal uniform draws give a uniform element of the full certified group:
 * uniform ker(Psi), followed by a uniform canonical section of im(Psi).
 * Experiments use a seeded PRNG, explicitly not a proven-mixed random walk. */
export function sampleGroupState(group:SparseGroup,rng:()=>number):SparsePuzzleState{
 const sig=getInnerSignature(group);const pick=(n:number)=>Math.min(n-1,Math.floor(rng()*n));
 let state:SparsePuzzleState={siteOf:new Int32Array(group.N),pieceAt:new Int32Array(group.N),rotation:new Uint8Array(group.N)};
 for(let oi=0;oi<group.orbits.length;oi++){
  const sites=group.orbits[oi]!,permutation=sites.slice();let parity=0;
  for(let i=sites.length-1;i>0;i--){const j=pick(i+1);if(i!==j){[permutation[i],permutation[j]]=[permutation[j]!,permutation[i]!];parity^=1;}}
  if(parity)[permutation[0],permutation[1]]=[permutation[1]!,permutation[0]!];
  const frame=sig.frames[oi]!,H=frame.freedom,phase=sig.phase[oi]!,mod=sig.columns[oi]!.three.length?3:4;
  const sums=new Array(phase.get(0)!.length).fill(0);
  for(let i=0;i<sites.length;i++){
   const tau=i===sites.length-1?(()=>{const choices=H.filter(h=>phase.get(h)!.every((x,k)=>(sums[k]+x)%mod===0));return choices[pick(choices.length)]!;})():H[pick(H.length)]!;
   if(tau===undefined)throw new Error('No balanced final holonomy value');
   phase.get(tau)!.forEach((x,k)=>{sums[k]=(sums[k]+x)%mod;});
   const piece=sites[i]!,dest=permutation[i]!;
   state.siteOf[piece]=dest;state.pieceAt[dest]=piece;
   state.rotation[piece]=rotMul[frame.ref[dest]!]![rotMul[tau]![rotInv[frame.ref[piece]!]!]!]!;
  }
 }
 const initial=sig.signatureOfState(state);if(initial.four.size||initial.three.size)throw new Error('Kernel sampler failed');
 const parts:Array<{node:WordNode;power:number}>=[];
 for(const [pivot,row]of [...sig.basis4].sort((a,b)=>a[0]-b[0])){const coefficient=pick(row.vector.get(pivot)===1?4:2);if(coefficient)parts.push({node:row.word,power:coefficient});}
 for(const row of sig.basis3.values()){const coefficient=pick(3);if(coefficient)parts.push({node:row.word,power:coefficient});}
 state=rawReplay(group,state,[...expandWord(group,{parts})]).state;
 return state;
}

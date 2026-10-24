import { orientationFrames, inverseAtom, parityVector, rotMul, rotInv, type SparseGroup, type SparseAtom } from './mengerSparseGroup';
import type { SparsePuzzleState } from './mengerCertifiedReduction';
export type Vector=Map<number,number>;
export interface WordNode { atom?:SparseAtom; parts?:Array<{node:WordNode;power:number}> }
const combined=(a:WordNode,b:WordNode,power:number):WordNode=>({parts:[{node:a,power:1},{node:b,power}]});
const order=(r:number)=>{let t=r,n=1;while(t){t=rotMul[r]![t]!;n++;}return n;};

/** Joint homomorphism: orbit signs plus the abelianization of each point
 * holonomy. F2 coordinates are embedded as 0/2 in Z4, alongside genuine Z4
 * coordinates; C3 coordinates are handled separately. */
export class MengerAbelianSignature {
 readonly frames;readonly phase:Array<Map<number,number[]>>=[];
 readonly columns:Array<{four:number[];three:number[]}> = [];
 readonly basis4=new Map<number,{vector:Vector;word:WordNode}>();
 readonly basis3=new Map<number,{vector:Vector;word:WordNode}>();
 readonly atomSignatures=new Map<string,{four:Vector;three:Vector}>();
 readonly dimension4:number;readonly dimension3:number;
 constructor(readonly group:SparseGroup){
  this.frames=orientationFrames(group);let d4=group.orbits.length,d3=0;
  for(const f of this.frames){
   const phase=new Map<number,number[]>();const col={four:[] as number[],three:[] as number[]};const h=f.freedom;
   if(h.length===1)phase.set(0,[]);
   else if(h.length===3||h.length===4){
    const q=h.find(r=>order(r)===h.length)!;let r=0;
    for(let i=0;i<h.length;i++){phase.set(r,[i]);r=rotMul[q]![r]!;}
    if(h.length===3)col.three.push(d3++);else col.four.push(d4++);
   }else if(h.length===8){
    const q=h.find(r=>order(r)===4)!;const cyclic=[0,q,rotMul[q]![q]!,rotInv[q]!];const flip=h.find(r=>!cyclic.includes(r))!;
    for(let a=0;a<4;a++)for(let b=0;b<2;b++)phase.set(b?rotMul[cyclic[a]!]![flip]!:cyclic[a]!,[2*(a%2),2*b]);
    col.four.push(d4++,d4++);
   }else throw new Error(`Uncertified point holonomy order ${h.length}`);
   this.phase.push(phase);this.columns.push(col);
  }
  this.dimension4=d4;this.dimension3=d3;
  for(const atom of group.atoms){
    const sig=this.signature([...atom.map].map(([s,t])=>[s,t,atom.rot] as [number,number,number]),parityVector(group,atom.map));
    if(sig.three.size)throw new Error('An order-four atom cannot have a nonzero C3 homomorphic image');
    this.atomSignatures.set(atom.id,sig);
    this.insert(this.basis4,sig.four,{atom},4);
    // Fourth powers kill every Z4/sign coordinate and retain C3 signatures.
    this.insert(this.basis3,sig.three,{parts:[{node:{atom},power:4}]},3);
  }
 }
 private signature(entries:Iterable<[number,number,number]>,parity:bigint){
  const four:Vector=new Map(),three:Vector=new Map();
  const add=(v:Vector,c:number,x:number,m:number)=>{const n=((v.get(c)??0)+x)%m;if(n)v.set(c,n);else v.delete(c);};
  for(let oi=0;oi<this.group.orbits.length;oi++)if((parity>>BigInt(oi))&1n)four.set(oi,2);
  for(const [s,t,r] of entries){const oi=this.group.orbitOf[s]!;const f=this.frames[oi]!;
   const tau=rotMul[rotInv[f.ref[t]!]!]![rotMul[r]![f.ref[s]!]!]!;const values=this.phase[oi]!.get(tau);
   if(!values)throw new Error(`Orientation leaves point holonomy on orbit ${oi}`);
   this.columns[oi]!.four.forEach((c,i)=>add(four,c,values[i]!,4));
   this.columns[oi]!.three.forEach((c,i)=>add(three,c,values[i]!,3));
  }
  return {four,three};
 }
 signatureOfState(state:SparsePuzzleState){return this.signature([...state.siteOf.entries()].map(([s,t])=>[s,t,state.rotation[s]!] as [number,number,number]),parityVector(this.group,new Map(state.siteOf.entries())));}
 private subtract(v:Vector,row:Vector,c:number,m:number){for(const [i,x] of row){const n=(((v.get(i)??0)-c*x)%m+m)%m;if(n)v.set(i,n);else v.delete(i);}}
 private insert(basis:Map<number,{vector:Vector;word:WordNode}>,input:Vector,word:WordNode,m:number){
  const queue=[{vector:new Map(input),word}];
  while(queue.length){let {vector,word}=queue.pop()!;
   while(vector.size){const p=Math.min(...vector.keys());const value=vector.get(p)!;const row=basis.get(p);
    if(!row){
      if((m===4&&value===3)||(m===3&&value===2)){const c=m===4?3:2;vector=new Map([...vector].map(([i,x])=>[i,x*c%m]));word={parts:[{node:word,power:c}]};}
      basis.set(p,{vector,word});
      if(m===4&&vector.get(p)===2){const doubled=new Map([...vector].map(([i,x])=>[i,2*x%4] as [number,number]).filter(([,x])=>x));if(doubled.size)queue.push({vector:doubled,word:{parts:[{node:word,power:2}]}});}
      break;
    }
    const pivot=row.vector.get(p)!;
    if(m===4&&pivot===2&&value%2){basis.delete(p);queue.push(row);continue;}
    const c=pivot===2&&m===4?value/2:value;
    this.subtract(vector,row.vector,c,m);word=combined(word,row.word,-c);
   }
  }
 }
 private reduce(vector:Vector,basis:Map<number,{vector:Vector;word:WordNode}>,m:number){
  const v=new Map(vector);const parts:Array<{node:WordNode;power:number}>=[];
  while(v.size){const p=Math.min(...v.keys());const row=basis.get(p);const value=v.get(p)!;if(!row)throw new Error('Unreachable joint invariant signature');
   const pivot=row.vector.get(p)!;if(m===4&&pivot===2&&value%2)throw new Error('Unreachable Z4 invariant residue');
   const c=pivot===2&&m===4?value/2:value;this.subtract(v,row.vector,c,m);parts.push({node:row.word,power:-c});
  }
  return {parts};
 }
 signatureOfWord(word:readonly SparseAtom[]){
  const four:Vector=new Map(),three:Vector=new Map();
  for(const atom of word){const value=this.atomSignatures.get(atom.id);if(!value)throw new Error('Unknown signature atom');
   for(const [i,x] of value.four){const n=((four.get(i)??0)+x)%4;if(n)four.set(i,n);else four.delete(i);}
   for(const [i,x] of value.three){const n=((three.get(i)??0)+x)%3;if(n)three.set(i,n);else three.delete(i);}
  }return {four,three};
 }
 auditBasis(){
  const memo=new Map<WordNode,{four:Vector;three:Vector}>();
  const evaluate=(node:WordNode):{four:Vector;three:Vector}=>{
   const cached=memo.get(node);if(cached)return cached;
   if(node.atom)return this.atomSignatures.get(node.atom.id)!;
   const four:Vector=new Map(),three:Vector=new Map();
   for(const part of node.parts??[]){const value=evaluate(part.node);this.subtract(four,value.four,-part.power,4);this.subtract(three,value.three,-part.power,3);}
   const value={four,three};memo.set(node,value);return value;
  };
  const equal=(a:Vector,b:Vector)=>a.size===b.size&&[...a].every(([i,x])=>b.get(i)===x);
  let imageOrder=1n;
  for(const [pivot,row] of this.basis4){if(!equal(evaluate(row.word).four,row.vector))throw new Error('Z4 SLP/vector mismatch');
    const twice:Vector=new Map([...row.vector].map(([i,x])=>[i,2*x%4] as [number,number]).filter(([,x])=>x));this.reduce(twice,this.basis4,4);
    imageOrder*=row.vector.get(pivot)===1?4n:2n;}
  for(const row of this.basis3.values()){const value=evaluate(row.word);if(value.four.size||!equal(value.three,row.vector))throw new Error('C3 SLP/vector mismatch');imageOrder*=3n;}
  for(const sig of this.atomSignatures.values()){
   const w=this.reduce(sig.four,this.basis4,4);const v=new Map(sig.four);this.subtract(v,evaluate(w).four,-1,4);if(v.size)throw new Error('Generator signature not spanned');
  }
  return {dimension4:this.dimension4,dimension3:this.dimension3,rows4:this.basis4.size,rows3:this.basis3.size,imageOrder:imageOrder.toString(),generatorsChecked:this.atomSignatures.size};
 }
 normalization(state:SparsePuzzleState):WordNode{return this.reduce(this.signatureOfState(state).four,this.basis4,4);}
 normalization3(state:SparsePuzzleState):WordNode{return this.reduce(this.signatureOfState(state).three,this.basis3,3);}
}

export function* expandWord(group:SparseGroup,node:WordNode):Generator<SparseAtom>{
 const stack=[{node,inverse:false}];
 while(stack.length){const current=stack.pop()!;
  if(current.node.atom){yield current.inverse?inverseAtom(group,current.node.atom):current.node.atom;continue;}
  const parts=current.inverse?[...(current.node.parts??[])].reverse():current.node.parts??[];
  for(let pi=parts.length-1;pi>=0;pi--){const part=parts[pi]!;const power=current.inverse?-part.power:part.power;
   for(let i=0;i<Math.abs(power);i++)stack.push({node:part.node,inverse:power<0});
  }
 }
}

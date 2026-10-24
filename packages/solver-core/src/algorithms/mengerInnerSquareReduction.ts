import type { Cubie } from '@menger/engine';
import { actionOver,fullAction,inverseWord,rotMul,type SparseAtom,type SparseGroup } from './mengerSparseGroup';
import { rawReplay,sparseStateOf,type SparsePuzzleState } from './mengerCertifiedReduction';
import { MengerAbelianSignature,expandWord } from './mengerAbelianSignature';
import { MengerPairTransport } from './mengerPairTransport';
import { FactoredTwisterTransport,FactoredCycleTransport } from './mengerFactoredTransport';
export interface InnerSquareData { tools:Array<{orbit:number;oldOrbit:number;word:readonly string[]}>;pairTwisters:Array<{orbit:number;kind:string;word:readonly string[]}>; oldTools:Array<{orbit:number;word:readonly string[]}> }
const signatureCache=new WeakMap<SparseGroup,MengerAbelianSignature>();
export const getInnerSignature=(group:SparseGroup):MengerAbelianSignature=>{let s=signatureCache.get(group);if(!s){s=new MengerAbelianSignature(group);signatureCache.set(group,s);}return s;};

export function reduceInnerSquareState(group:SparseGroup,old:SparseGroup,data:InnerSquareData,cubies:Cubie[],progress?:(message:string)=>void){
 const original=sparseStateOf(group,cubies);let state:SparsePuzzleState={pieceAt:original.pieceAt.slice(),siteOf:original.siteOf.slice(),rotation:original.rotation.slice()};
 const sig=getInnerSignature(group);const emitted:SparseAtom[]=[];let placements=0,setupNodes=0;
 const resolve=(ids:readonly string[])=>ids.map(id=>{const a=group.atomById.get(id);if(!a)throw new Error(`Unknown certified atom ${id}`);return a;});
 const append=(word:Iterable<SparseAtom>)=>{for(const a of word){const prev=emitted.at(-1);if(prev?.refId===a.refId&&prev.kind===a.kind){emitted.pop();const angle=((prev.angle+a.angle)%360+360)%360;if(angle){const atom=group.atomById.get(`${a.kind==='frame'?'f':'e'}:${a.refId}:${angle===270?-90:angle}`);if(!atom)throw new Error('Missing merged legal atom');emitted.push(atom);}}else emitted.push(a);}};
 const raw=(word:SparseAtom[])=>{state=rawReplay(group,state,word).state;append(word);};
 const net=(word:SparseAtom[],support:number[])=>{
  const action=actionOver(word,support);const pieces=[...action.keys()].map(s=>state.pieceAt[s]!);let i=0;
  for(const [, [to,r]]of action){const piece=pieces[i++]!;state.siteOf[piece]=to;state.rotation[piece]=rotMul[r]![state.rotation[piece]!]!;state.pieceAt[to]=piece;}append(word);
 };
 const norm4=[...expandWord(group,sig.normalization(state))];raw(norm4);
 const norm3=[...expandWord(group,sig.normalization3(state))];raw(norm3);
 if(sig.signatureOfState(state).four.size||sig.signatureOfState(state).three.size)throw new Error('Joint normalization failed');
 progress?.(`Normalized joint signatures in ${emitted.length} atoms`);
 for(let oi=0;oi<group.orbits.length;oi++){
  const sites=group.orbits[oi]!;if(sites.every(s=>state.siteOf[s]===s))continue;
  const record=data.tools.find(t=>t.orbit===oi);if(!record)throw new Error(`No certified cycle orbit ${oi}`);
  const base=resolve(record.word);const action=fullAction(base);
  if(action.size!==3||[...action].some(([s,[t]])=>s===t||group.orbitOf[s]!==oi))throw new Error('Invalid cycle certificate');
  const first=action.keys().next().value!;const second=action.get(first)![0];const third=action.get(second)![0];
  const transport=sites.length<=1536 ? new MengerPairTransport(group,oi,[first,second,third],base,true) : new FactoredCycleTransport(group,old,oi,data);
  const place=(cycle:number[])=>{
   const [a,b,c]=cycle as [number,number,number];const A=transport.cycleForEdge([a,b],new Set());let word:SparseAtom[];
   if(A.action.has(c))word=A.word;
   else{const extra=[...A.action.keys()].find(s=>s!==a&&s!==b)!;const B=transport.cycleForEdge([c,b],new Set([a,extra]));word=[...A.word,...B.word,...inverseWord(group,A.word),...inverseWord(group,B.word)];}
   const actual=actionOver(word,cycle);if(cycle.some((s,i)=>actual.get(s)?.[0]!==cycle[(i+1)%3]))throw new Error('Three-cycle placement mismatch');
   net(word,cycle);placements++;
  };
  while(true){const seen=new Set<number>(),cycles:number[][]=[];
   for(const site of sites){if(seen.has(site)||state.pieceAt[site]===site)continue;const cycle:number[]=[];let s=site;do{seen.add(s);cycle.push(s);s=state.pieceAt[s]!;}while(s!==site);cycles.push(cycle);}
   if(!cycles.length)break;const long=cycles.find(c=>c.length>=3);
   if(long)place(long.slice(0,3));else{if(cycles.length<2)throw new Error('Odd residual permutation');const [a,b]=cycles[0]!,[c,d]=cycles[1]!;place([a!,c!,d!]);place([a!,c!,b!]);}
  }
  setupNodes+=transport.visitedStates;
  if(oi%20===0||sites.length>1000)progress?.(`Placed orbit ${oi}/${group.orbits.length}, size ${sites.length}, ${emitted.length} atoms`);
 }
 if(state.siteOf.some((s,p)=>s!==p))throw new Error('Position completion failed');
 const pairCache=new Map<string,MengerPairTransport|FactoredTwisterTransport>();
 const pairWord=(oi:number,pair:number[],kind:string)=>{
  const record=data.pairTwisters.find(t=>t.orbit===oi&&t.kind===kind);if(!record)throw new Error(`Missing ${kind} pair orbit ${oi}`);
  const base=resolve(record.word);const action=fullAction(base);if(action.size!==2||[...action].some(([s,[t]])=>s!==t))throw new Error('Invalid pair certificate');
  const target=[...action.keys()];
  const key=`${oi}:${kind}`;let transport=pairCache.get(key);
  if(!transport){transport=group.orbits[oi]!.length<=1536?new MengerPairTransport(group,oi,target,base,false):new FactoredTwisterTransport(group,old,oi,base,target);pairCache.set(key,transport);setupNodes+=transport.visitedStates;}
  const before=transport.visitedStates;const result=transport.wordFor(pair);setupNodes+=transport.visitedStates-before;return result;
 };
 for(let oi=0;oi<group.orbits.length;oi++){
  const sites=group.orbits[oi]!,h=sig.frames[oi]!.freedom;const order=h.length;
  if(order===1){if(sites.some(s=>state.rotation[s]))throw new Error('Impossible orientation-determined residue');continue;}
  pairCache.clear();
  const anchor=sites.at(-1)!;const kinds=order===3?['C3']:order===4?['C4']:['C4','flip'];
  for(const site of sites.slice(0,-1)){
   if(!state.rotation[site])continue;const pair=[site,anchor];const words=kinds.map(k=>pairWord(oi,pair,k));
   const deltas=words.map(w=>actionOver(w,pair).get(site)?.[1]??0);
   const start=state.rotation[site]!;const queue=[start];const links=new Map<number,{previous:number;generator:number}>([[start,{previous:-1,generator:-1}]]);
   for(let head=0;head<queue.length&&!links.has(0);head++)for(let gi=0;gi<deltas.length;gi++){
    const r=rotMul[deltas[gi]!]![queue[head]!]!;if(links.has(r))continue;links.set(r,{previous:queue[head]!,generator:gi});queue.push(r);
   }
   if(!links.has(0))throw new Error('Pair generators do not generate residual holonomy');
   const path:number[]=[];let r=0;while(r!==start){const link=links.get(r)!;path.push(link.generator);r=link.previous;}path.reverse();
   for(const gi of path)net(words[gi]!,pair);
   if(state.rotation[site])throw new Error('Pair orientation step did not clear first site');
  }
  if(state.rotation[anchor]){
   if(order!==8||sites.length<3)throw new Error('Non-zero abelian orientation residue');
   const R=pairWord(oi,[anchor,sites[0]!],'C4');const F=pairWord(oi,[anchor,sites[1]!],'flip');
   const word=[...R,...F,...inverseWord(group,R),...inverseWord(group,F)];
   net(word,[anchor,sites[0]!,sites[1]!]);
   if(state.rotation[anchor]||state.rotation[sites[0]!]||state.rotation[sites[1]!])throw new Error('D4 commutator completion failed');
  }
 }
 if(state.rotation.some(r=>r)||state.siteOf.some((s,p)=>s!==p))throw new Error('Residual state is not solved');
 const replay=rawReplay(group,original,emitted,progress);
 if(replay.state.rotation.some(r=>r)||replay.state.siteOf.some((s,p)=>s!==p))throw new Error('Independent expanded replay failed');
 return {atoms:emitted,placements,setupNodes,selectedEntries:replay.selectedEntries};
}

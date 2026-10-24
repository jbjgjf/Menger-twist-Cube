import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {getCachedSparseGroup,fullAction,rotMul,rotInv,inverseAtom,parityBasis} from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import {getInnerSignature} from '../../packages/solver-core/src/algorithms/mengerInnerSquareReduction';
import {level4CertifiedData} from '../../packages/solver-core/src/algorithms/level4CertifiedData';
import {level3PureToolWords} from '../../packages/solver-core/src/algorithms/level3SliceReductionToolData';
import {level3ThreeCycleWords} from '../../packages/solver-core/src/algorithms/level3SliceReductionCertifiedData';
import type {InnerSquareData} from '../../packages/solver-core/src/algorithms/mengerInnerSquareReduction';
const level=Number(process.argv[2]??3);const group=getCachedSparseGroup(level,'inner-square');const sig=getInnerSignature(group);
assert(group.orbits.every(o=>o.length>=5),'Two-point transport with three alternatives needs at least five sites');
const data=JSON.parse(readFileSync(`research/inner-square-expanded/out/tools-L${level}.json`,'utf8')) as InnerSquareData;
const shipped=JSON.parse(readFileSync('packages/solver-core/src/algorithms/innerSquareTools.json','utf8'));
assert.deepEqual(data,shipped[level],'Audited tools must equal the shipped solver data');
const resolve=(ids:readonly string[])=>ids.map(id=>{const a=group.atomById.get(id);if(!a)throw new Error('Unknown atom');return a;});
const connected=(orbit:number,triple:number[])=>{
 const sites=group.orbits[orbit]!;const parent=new Map(sites.map(s=>[s,s]));
 const root=(s:number):number=>{while(parent.get(s)!==s){parent.set(s,parent.get(parent.get(s)!)!);s=parent.get(s)!;}return s;};
 const queue:Array<[number,number]>=[];
 const join=(a:number,b:number)=>{const x=root(a),y=root(b);if(x===y)return;parent.set(x,y);queue.push([a,b]);};
 join(triple[0]!,triple[1]!);join(triple[0]!,triple[2]!);
 for(let head=0;head<queue.length;head++){const [a,b]=queue[head]!;for(const gi of new Set([...group.atomsAt[a]!,...group.atomsAt[b]!])){const g=group.atoms[gi]!;join(g.map.get(a)??a,g.map.get(b)??b);}}
 return queue.length===sites.length-1;
};
const order=(r:number)=>{let t=r,n=1;while(t){t=rotMul[r]![t]!;n++;}return n;};
for(const atom of group.atoms){const inverse=inverseAtom(group,atom);assert(inverse);assert.equal(inverse.map.size,atom.map.size);assert.equal(rotMul[inverse.rot]![atom.rot],0);for(const [s,t] of atom.map)assert.equal(inverse.map.get(t),s);}
for(let oi=0;oi<group.orbits.length;oi++){
 const h=sig.frames[oi]!.freedom,phase=sig.phase[oi]!,columns=sig.columns[oi]!;
 for(const a of h)for(const b of h){const p=phase.get(rotMul[a]![b]!)!;assert(p);const x=phase.get(a)!,y=phase.get(b)!;
  for(let i=0;i<p.length;i++){const mod=columns.three.length?3:4;assert.equal(p[i],(x[i]!+y[i]!)%mod);}
 }
}
const old=getCachedSparseGroup(level);
const overrides=new Map(level3ThreeCycleWords.map(t=>[t.orbit,t.word]));
const reference=level===4?level4CertifiedData.tools:level3PureToolWords.map(t=>({orbit:t.orbit,word:overrides.get(t.orbit)??t.word}));
const canonical=(tools:ReadonlyArray<{orbit:number;word:readonly string[]}>)=>JSON.stringify([...tools].sort((a,b)=>a.orbit-b.orbit));
assert.equal(canonical(data.oldTools),canonical(reference),'Old fiber-tool data must match existing certificates');
for(const record of data.oldTools){const action=fullAction(record.word.map(id=>old.atomById.get(id)!));assert.equal(action.size,3);assert([...action].every(([s,[t]])=>s!==t&&old.orbitOf[s]===record.orbit));}
const count=new Set<number>();
for(const record of data.tools){
 const word=resolve(record.word),action=fullAction(word);assert.equal(action.size,3);assert([...action].every(([s,[t]])=>s!==t&&group.orbitOf[s]===record.orbit));
 const signature=sig.signatureOfWord(word);assert(!signature.four.size&&!signature.three.size,'Position tool must preserve joint signatures');
 assert(connected(record.orbit,[...action.keys()]),`Normal closure disconnected orbit ${record.orbit}`);count.add(record.orbit);
}
assert.equal(count.size,group.orbits.length);
const kinds=new Map<number,Set<string>>();
for(const record of data.pairTwisters){
 const word=resolve(record.word),action=fullAction(word);assert.equal(action.size,2);assert([...action].every(([s,[t]])=>s===t&&group.orbitOf[s]===record.orbit));
 const signature=sig.signatureOfWord(word);assert(!signature.four.size&&!signature.three.size,'Pair tool must preserve joint signatures');
 const [s,[,r]]=action.entries().next().value!,frame=sig.frames[record.orbit]!;
 const tau=rotMul[rotInv[frame.ref[s]!]!]![rotMul[r]![frame.ref[s]!]!]!;
 if(record.kind==='C3')assert.equal(order(tau),3);else if(record.kind==='C4')assert.equal(order(tau),4);else{
  const q=frame.freedom.find(r=>order(r)===4)!;assert(![0,q,rotMul[q]![q]!,rotInv[q]!].includes(tau));
 }
 const set=kinds.get(record.orbit)??new Set<string>();set.add(record.kind);kinds.set(record.orbit,set);
}
for(let oi=0;oi<group.orbits.length;oi++){
 const h=sig.frames[oi]!.freedom.length;
 for(const kind of h===1?[]:h===3?['C3']:h===4?['C4']:['C4','flip'])assert(kinds.get(oi)?.has(kind),`Missing orientation generator ${oi}:${kind}`);
}
const basis=sig.auditBasis();let kernel=1n;
const factorial=(n:number)=>{let f=1n;for(let i=2;i<=n;i++)f*=BigInt(i);return f;};
for(let oi=0;oi<group.orbits.length;oi++){
 const m=group.orbits[oi]!.length,h=sig.frames[oi]!.freedom.length,ab=h===8?4:h;
 kernel*=factorial(m)/2n*BigInt(h)**BigInt(m)/BigInt(ab);
}
const groupOrder=kernel*BigInt(basis.imageOrder);const M=BigInt(group.atoms.length);const ball=(d:number)=>(M**BigInt(d+1)-1n)/(M-1n);
let hi=1;while(ball(hi)<groupOrder)hi*=2;let lo=0;while(lo<hi){const mid=Math.floor((lo+hi)/2);if(ball(mid)<groupOrder)lo=mid+1;else hi=mid;}
assert(ball(lo-1)<groupOrder&&ball(lo)>=groupOrder);
const integer=groupOrder.toString();
const positionalOrder=group.orbits.reduce((p,sites)=>p*(factorial(sites.length)/2n),2n**BigInt(parityBasis(group).length));
const B=group.N/20,ambient=24n**BigInt(B)*factorial(B),cosets=(positionalOrder+ambient-1n)/ambient;
let rh=1;while(ball(rh)<cosets)rh*=2;let rl=0;while(rl<rh){const mid=Math.floor((rl+rh)/2);if(ball(mid)<cosets)rl=mid+1;else rh=mid;}
assert(ball(rl-1)<cosets&&ball(rl)>=cosets);
const result={level,moveSystem:'inner-square',completeGroupOrderCertificate:true,completeSolverCertificate:true,atoms:group.atoms.length,orbits:group.orbits.length,pureCycleOrbits:count.size,pairGenerators:data.pairTwisters.length,basis,
 groupOrderDigits:integer.length,positionalOrderDigits:positionalOrder.toString().length,restorationDiameterLowerBound:rl,rigidCosetsLowerBoundDigits:cosets.toString().length,groupOrderSha256:createHash('sha256').update(integer).digest('hex'),countingDiameterLowerBound:lo,oldToolDataSha256:createHash('sha256').update(canonical(reference)).digest('hex'),oldOrbitPairStateBound:Math.max(...old.orbits.map(o=>o.length))**2,catalogFileSha256:createHash('sha256').update(readFileSync('packages/engine/src/data/innerSquareCatalog.json')).digest('hex'),toolDataSha256:createHash('sha256').update(JSON.stringify(data)).digest('hex')};
writeFileSync(`research/inner-square-expanded/out/certificate-L${level}.json`,JSON.stringify(result,null,2)+'\n');writeFileSync(`research/inner-square-expanded/out/group-order-L${level}.txt`,integer+'\n');console.log(JSON.stringify(result));

import {writeFileSync,readFileSync,existsSync} from 'node:fs';
import {getCachedSparseGroup,fullAction,orientationFrames,rotMul,rotInv,inverseWord,inverseAtom,type SparseAtom} from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import {level3PureToolWords} from '../../packages/solver-core/src/algorithms/level3SliceReductionToolData';
import {level3ThreeCycleWords,level3C3TwisterWords,level3D4FlipPairWord} from '../../packages/solver-core/src/algorithms/level3SliceReductionCertifiedData';
import {level4CertifiedData} from '../../packages/solver-core/src/algorithms/level4CertifiedData';
import {commutatorAction,conjugateAction,actionKey,permutationKey,composeActions,inverseAction} from '../level4/tools';
const level=Number(process.argv[2]??3);const old=getCachedSparseGroup(level);const group=getCachedSparseGroup(level,'inner-square');const frames=orientationFrames(group);
const resolve=(word:readonly string[])=>word.map(id=>{const a=group.atomById.get(id);if(!a)throw new Error(`Missing atom ${id}`);return a;});
const overrides=new Map(level3ThreeCycleWords.map(r=>[r.orbit,r.word]));
const oldTools=level===4?level4CertifiedData.tools:level3PureToolWords.map(r=>({orbit:r.orbit,word:overrides.get(r.orbit)??r.word}));
const oldPairs=level===4?level4CertifiedData.pairTwisters:[...level3C3TwisterWords.map(r=>({...r,kind:'C3'})),{orbit:13,kind:'D4',word:level3D4FlipPairWord}];
const order=(r:number)=>{let n=1,t=r;while(t){t=rotMul[r]![t]!;n++;}return n;};
const tools=[];const pairs=[];
for(let oi=0;oi<group.orbits.length;oi++){
 const seeds=oldTools.filter(t=>group.orbitOf[old.orbits[t.orbit]![0]!]===oi).sort((a,b)=>a.word.length-b.word.length);
 if(!seeds.length)throw new Error(`No pure positional seed for orbit ${oi}`);
 const seed=seeds[0]!;const seedWord=resolve(seed.word);const seedAction=fullAction(seedWord);
 if(seedAction.size!==3||[...seedAction].some(([s,[t]])=>s===t))throw new Error('Bad positional seed');
 tools.push({orbit:oi,oldOrbit:seed.orbit,word:seed.word});
 const h=frames[oi]!.freedom;if(h.length===1)continue;
 const q=h.find(r=>order(r)===4);const cyclic=h.length===8?new Set([0,q!,rotMul[q!]![q!]!,rotInv[q!]!]):new Set(h);
 const needed=h.length===3?['C3']:h.length===4?['C4']:['C4','flip'];
 const found=new Map<string,readonly string[]>();
 const consider=(word:SparseAtom[],action:ReturnType<typeof fullAction>)=>{
  if(action.size!==2||[...action].some(([s,[t]])=>s!==t||group.orbitOf[s]!==oi))return;
  const [site,[,r]]=action.entries().next().value!;const tau=rotMul[rotInv[frames[oi]!.ref[site]!]!]![rotMul[r]![frames[oi]!.ref[site]!]!]!;
  const kind=h.length===3&&order(tau)===3?'C3':order(tau)===4?'C4':h.length===8&&!cyclic.has(tau)?'flip':undefined;
  if(kind&&!found.has(kind))found.set(kind,word.map(a=>a.id));
 };
 for(const p of oldPairs)if(group.orbitOf[old.orbits[p.orbit]![0]!]===oi){const word=resolve(p.word);consider(word,fullAction(word));}
 const queue=seeds.map(s=>{const word=resolve(s.word);return {word,action:fullAction(word)};});
 const seen=new Set(queue.map(t=>actionKey(t.action)));
 const byPermutation=new Map(queue.map(t=>[permutationKey(t.action),t]));
 for(let head=0;head<queue.length && needed.some(k=>!found.has(k));head++){
  const tool=queue[head]!;const support=[...tool.action.keys()];
  for(const site of support)for(const gi of group.atomsAt[site]!){
   const g=group.atoms[gi]!;
   if(g.map.get(site)!==site||support.some(s=>s!==site&&g.map.has(s)))continue;
   const ga=new Map([...g.map].map(([s,t])=>[s,[t,g.rot] as [number,number]]));
   const action=commutatorAction(ga,tool.action);
   if(action.size===2)consider([g,...tool.word,inverseAtom(group,g),...inverseWord(group,tool.word)],action);
  }
  if(needed.every(k=>found.has(k)))break;
  if(queue.length>=20000)continue;
  const incident=new Set(support.flatMap(s=>group.atomsAt[s]!));
  for(const gi of incident){
   const g=group.atoms[gi]!;const action=conjugateAction(group,tool.action,g);const key=actionKey(action);if(seen.has(key))continue;seen.add(key);
   const word=[g,...tool.word,inverseAtom(group,g)];
   const pk=permutationKey(action);const previous=byPermutation.get(pk);
   if(previous){
    const twist=composeActions(action,inverseAction(previous.action));
    const twistWord=[...word,...inverseWord(group,previous.word)];
    consider(twistWord,twist);
    if(twist.size)for(const helper of queue){
     if([...helper.action.keys()].filter(s=>twist.has(s)).length!==1)continue;
     const pair=commutatorAction(twist,helper.action);
     if(pair.size===2)consider([...twistWord,...helper.word,...inverseWord(group,twistWord),...inverseWord(group,helper.word)],pair);
     if(needed.every(k=>found.has(k)))break;
    }
   }else byPermutation.set(pk,{action,word});
   queue.push({action,word});if(queue.length>=20000||needed.every(k=>found.has(k)))break;
  }
 }
 for(const kind of needed){const word=found.get(kind);if(!word)throw new Error(`Missing ${kind} pair orbit ${oi}`);const action=fullAction(resolve(word));if(action.size!==2||[...action].some(([s,[t]])=>s!==t))throw new Error('Pair full replay mismatch');pairs.push({orbit:oi,kind,word});}
 console.log(JSON.stringify({orbit:oi,size:group.orbits[oi]!.length,freedom:h.length,pairKinds:needed,variants:queue.length}));
}
writeFileSync(`research/inner-square-expanded/out/tools-L${level}.json`,JSON.stringify({tools,pairTwisters:pairs,oldTools})+'\n');
console.log(`Complete discovery: ${tools.length} cycles, ${pairs.length} pair generators`);

const file='packages/solver-core/src/algorithms/innerSquareTools.json';
const previous=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};previous[level]={tools,pairTwisters:pairs,oldTools};writeFileSync(file,JSON.stringify(previous)+'\n');

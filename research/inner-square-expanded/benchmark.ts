import {writeFileSync,mkdirSync,readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {getCachedSparseGroup} from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import {rawReplay,sparseStateOf} from '../../packages/solver-core/src/algorithms/mengerCertifiedReduction';
import {createSeededRng} from '../../packages/solver-core/src/benchmark/scramble';
import {createMengerPuzzleModel} from '../../packages/solver-core/src/model/mengerPuzzleModel';
import {createInnerSquareCertifiedAlgorithm} from '../../packages/solver-core/src/algorithms/innerSquareCertifiedSolver';
import {createHigherBlockRestorationAlgorithm} from '../../packages/solver-core/src/algorithms/higherBlockRestorationSolver';
import {level2CertifiedAlgorithm,warmLevel2CertifiedSolver} from '../../packages/solver-core/src/algorithms/level2CertifiedSolver';
import {level2BlockRestorationAlgorithm} from '../../packages/solver-core/src/algorithms/level2BlockRestorationSolver';
import {shortenLevel2Word} from '../../packages/solver-core/src/algorithms/level2BlockRestorationSolver';
const level=Number(process.argv[2]??3) as 2|3|4;
const length=Number(process.argv[3]??100);const seed=Number(process.argv[4]??1);
const variant=process.argv[5]??'all';
const sampling=process.argv[6]??'walk';
const group=getCachedSparseGroup(level,'inner-square');const model=createMengerPuzzleModel('inner-square');const rng=createSeededRng(seed);
const pools=[group.atoms.filter(a=>a.kind==='frame'),group.atoms.filter(a=>a.kind==='extension'&&a.family!=='inner-square'),group.atoms.filter(a=>a.family==='inner-square')];
assert(pools.every(p=>p.length));let state=group.canonical;const counts=[0,0,0];const inputWord=[];
for(let i=0;i<length;i++){const family=i<3?i:Math.min(2,Math.floor(rng()*3));const atom=pools[family]![Math.min(pools[family]!.length-1,Math.floor(rng()*pools[family]!.length))]!;
 state=model.applyMove(state,atom.move);inputWord.push(atom.id);counts[family]++;}
if(sampling==='direct'){
 if(level===2)throw new Error('Direct sampler currently certified for Levels3/4 only');
 const {sampleGroupState}=await import('./sample-state');const {allBlockRotations}=await import('../../packages/solver-core/src/algorithms/blockRotations');
 const sampled=sampleGroupState(group,rng);
 state={...group.canonical,cubies:group.canonical.cubies.map((c,p)=>({...c,currentPosition:[...group.sites[sampled.siteOf[p]!]!] as [number,number,number],orientation:allBlockRotations[sampled.rotation[p]!]!.quaternion.clone()}))};
}
const sparse=sparseStateOf(group,state.cubies);const moved=sparse.siteOf.filter((s,p)=>s!==p).length;
const record:{[key:string]:unknown}={generatedAt:new Date().toISOString(),level,length,seed,system:'inner-square',familyCounts:{slice:counts[0],extension:counts[1],inner:counts[2]},displaced:moved,
 inputSha256:createHash('sha256').update(JSON.stringify({sites:[...sparse.siteOf],rotations:[...sparse.rotation]})).digest('hex'),wordSha256:createHash('sha256').update(JSON.stringify(inputWord)).digest('hex'),poolSizes:pools.map(p=>p.length),sampling:sampling==='direct'?'Parametrized full-group state: uniform kernel and uniform signature section under ideal independent draws; seeded LCG in experiments. No random-walk mixing claim.':'First three guarantee all families; subsequent families uniform, then uniform legal atom within family. Not uniform group states.'};
const file=`research/inner-square-expanded/out/bench-L${level}-${sampling==='direct'?'direct':`n${length}`}-seed${seed}.json`;
mkdirSync('research/inner-square-expanded/out',{recursive:true});

record.restorationIncludesD=true;
record.runOrder=seed%2?['certified','restoration']:['restoration','certified'];
record.transportPolicy='dense through 1536 sites; old-orbit quotient and bounded old-fiber pair graphs for larger merged orbits';
const implementationHash=createHash('sha256');
for(const file of ['mengerInnerSquareReduction.ts','higherBlockRestorationSolver.ts','mengerBlockRestoration.ts','mengerFactoredTransport.ts','mengerSparsePairTransport.ts','mengerPairTransport.ts','mengerAbelianSignature.ts','mengerSparseGroup.ts','level2BlockRestorationSolver.ts','innerSquareTools.json'])implementationHash.update(readFileSync(`packages/solver-core/src/algorithms/${file}`));
implementationHash.update(readFileSync('packages/engine/src/data/innerSquareCatalog.json'));
record.implementationSha256=implementationHash.digest('hex');
if(existsSync(file)){const previous=JSON.parse(readFileSync(file,'utf8'));if(previous.inputSha256===record.inputSha256&&previous.implementationSha256===record.implementationSha256){for(const key of ['certified','restoration','D'])if(previous[key])record[key]=previous[key];}}
writeFileSync(file,JSON.stringify(record,null,2)+'\n');
const {getInnerSignature}=await import('../../packages/solver-core/src/algorithms/mengerInnerSquareReduction');
const {primeExpandedLegality}=await import('../../packages/solver-core/src/algorithms/innerSquareCertifiedSolver');primeExpandedLegality(group,state);
const {restorationDistanceBound}=await import('../../packages/solver-core/src/algorithms/mengerBlockRestoration');restorationDistanceBound(group);if(level===2)warmLevel2CertifiedSolver('inner-square');else getInnerSignature(group);record.jointLibraryPrewarmed=true;
for(const which of variant==='all'?(seed%2?['certified','restoration']:['restoration','certified']):[variant]){
 if(which==='D')continue;
 const solver=level===2?(which==='certified'?level2CertifiedAlgorithm:level2BlockRestorationAlgorithm):which==='certified'?createInnerSquareCertifiedAlgorithm(level):createHigherBlockRestorationAlgorithm(level);
 const result=await solver.solve(model,state);
 record[which]={moves:result.move_count,ms:result.runtime_ms,success:result.success,explanation:result.explanation.map(s=>s.observation),notes:result.notes};
 writeFileSync(file,JSON.stringify(record,null,2)+'\n');
 console.log(JSON.stringify({checkpoint:which,...record[which] as object}));
 assert(result.success,result.notes);
 if(which==='certified'){
  const start=performance.now();const shortened=shortenLevel2Word(group,result.output_moves);const optimizationMs=performance.now()-start;
  const atoms=shortened.map(m=>group.atomById.get(`${m.targetKind==='frame'?'f':'e'}:${m.frameId??m.extensionTargetId}:${m.angle}`)!);
  const replay=rawReplay(group,sparse,atoms);assert(replay.state.siteOf.every((s,p)=>s===p&&replay.state.rotation[p]===0));
  record.D={moves:shortened.length,optimizationMs,verifiedSelectedEntries:replay.selectedEntries};
 }
 writeFileSync(file,JSON.stringify(record,null,2)+'\n');
 console.log(JSON.stringify({...record,certified:record.certified,restoration:record.restoration}));
}

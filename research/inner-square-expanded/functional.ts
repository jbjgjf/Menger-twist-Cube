import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {getCachedSparseGroup,rotMul,rotInv,rotations} from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import {rawReplay,sparseStateOf} from '../../packages/solver-core/src/algorithms/mengerCertifiedReduction';
import {createMengerPuzzleModel} from '../../packages/solver-core/src/model/mengerPuzzleModel';
import {createInnerSquareCertifiedAlgorithm} from '../../packages/solver-core/src/algorithms/innerSquareCertifiedSolver';
import {allBlockRotations} from '../../packages/solver-core/src/algorithms/blockRotations';
const level=Number(process.argv[2]??3) as 3|4;const group=getCachedSparseGroup(level,'inner-square'),model=createMengerPuzzleModel('inner-square'),solver=createInnerSquareCertifiedAlgorithm(level);
const data=JSON.parse(readFileSync(`research/inner-square-expanded/out/tools-L${level}.json`,'utf8'));
const records=[];const fullKinds=new Set<string>();
for(const record of data.pairTwisters){
 const atoms=record.word.map((id:string)=>group.atomById.get(id)!);
 const sparse=rawReplay(group,sparseStateOf(group,group.canonical.cubies),atoms).state;
 const state={...group.canonical,cubies:group.canonical.cubies.map((c,p)=>({...c,currentPosition:[...group.sites[sparse.siteOf[p]!]!] as [number,number,number],orientation:allBlockRotations[sparse.rotation[p]!]!.quaternion.clone()}))};
 const result=await solver.solve(model,state);assert(result.success,result.notes);
 let verified='sparse independent replay';
 if(result.move_count<2000&&(level===3||!fullKinds.has(record.kind))){fullKinds.add(record.kind);let endpoint=state;for(const move of result.output_moves)endpoint=model.applyMove(endpoint,move);assert(model.isSolved(endpoint));verified='full engine endpoint';}
 records.push({orbit:record.orbit,kind:record.kind,moves:result.move_count,ms:result.runtime_ms,verified});console.log(JSON.stringify(records.at(-1)));
}
// Exercise the final non-abelian commutator subgroup: one isolated r² in D4.
const oi=data.pairTwisters.find((p:{kind:string})=>p.kind==='flip').orbit;
const first=data.pairTwisters.find((p:{orbit:number;kind:string})=>p.orbit===oi&&p.kind==='C4');
const {fullAction}=await import('../../packages/solver-core/src/algorithms/mengerSparseGroup');
const action=fullAction(first.word.map((id:string)=>group.atomById.get(id)!));const [site,[,r]]=action.entries().next().value!;
const state=model.cloneState(group.canonical);state.cubies[site]!.orientation=allBlockRotations[rotMul[r]![r]!]!.quaternion.clone();
const result=await solver.solve(model,state);assert(result.success,result.notes);records.push({orbit:oi,kind:'single D4 commutator',moves:result.move_count,ms:result.runtime_ms});
// Non-unit and non-grid input must fail; an isolated C3 twist is unreachable.
const bad=model.cloneState(group.canonical);bad.cubies[0]!.orientation.set(0,0,0,0);assert(!(await solver.solve(model,bad)).success);
const {getInnerSignature}=await import('../../packages/solver-core/src/algorithms/mengerInnerSquareReduction');const frames=getInnerSignature(group).frames;
const c3=frames.findIndex(f=>f.freedom.length===3),s=group.orbits[c3]![0]!,q=frames[c3]!.freedom.find(r=>r!==0)!;
const physical=rotMul[frames[c3]!.ref[s]!]![rotMul[q]![rotInv[frames[c3]!.ref[s]!]!]!]!;
const lone=model.cloneState(group.canonical);lone.cubies[s]!.orientation=allBlockRotations[physical]!.quaternion.clone();assert(!(await solver.solve(model,lone)).success);
writeFileSync(`research/inner-square-expanded/out/functional-L${level}.json`,JSON.stringify({records,rejectedNonUnit:true,rejectedLoneC3:true,rotationAlphabet:rotations.length},null,2)+'\n');

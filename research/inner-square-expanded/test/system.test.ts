import test from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion} from 'three';
import {getCachedSparseGroup,rotationOfCubie} from '../../../packages/solver-core/src/algorithms/mengerSparseGroup';
import {sparseStateOf} from '../../../packages/solver-core/src/algorithms/mengerCertifiedReduction';
import {createMengerPuzzleModel} from '../../../packages/solver-core/src/model/mengerPuzzleModel';
import {createInnerSquareCertifiedAlgorithm} from '../../../packages/solver-core/src/algorithms/innerSquareCertifiedSolver';
import {rotatePositionAroundPivot,rotateQuaternion} from '../../../packages/engine/src/index';
import {blockGeometry,restorationDistanceBound,searchMengerBlockRestoration} from '../../../packages/solver-core/src/algorithms/mengerBlockRestoration';
console.debug=()=>{};
const group=getCachedSparseGroup(3,'inner-square'),old=getCachedSparseGroup(3),model=createMengerPuzzleModel('inner-square');
test('expanded L3 merges old orbits and includes half-turn-only inner targets',()=>{
 assert.equal(group.atoms.length,5565);assert.equal(group.orbits.length,116);assert.equal(old.orbits.length,164);
 assert(group.atoms.some(a=>a.family==='inner-square'&&a.angle===180&&!group.atomById.has(`e:${a.refId}:90`)));
});
test('every added inner atom agrees with engine positions and orientation deltas',()=>{
 let entries=0;
 for(const atom of group.atoms.filter(a=>a.family==='inner-square')){
  const target=group.canonical.turnTargetById.get(atom.refId)!;
  for(const [s,t]of atom.map){assert.deepEqual(rotatePositionAroundPivot(group.sites[s]!,target.axis,atom.angle,target.pivot),group.sites[t]);entries++;}
  const c={...group.canonical.cubies[0]!,orientation:rotateQuaternion(new Quaternion(),target.axis,atom.angle)};
  assert.equal(rotationOfCubie(c),atom.rot);
 }
 assert(entries>0);
});
test('an inner move outside the old orbit partition is solved by the complete expanded solver',async()=>{
 const atom=group.atoms.find(a=>a.family==='inner-square'&&[...a.map].some(([s,t])=>old.orbitOf[s]!==old.orbitOf[t]))!;assert(atom);
 const state=model.applyMove(group.canonical,atom.move);assert.throws(()=>sparseStateOf(old,state.cubies));
 const result=await createInnerSquareCertifiedAlgorithm(3).solve(model,state);assert(result.success,result.notes);
 let endpoint=state;for(const move of result.output_moves)endpoint=model.applyMove(endpoint,move);assert(model.isSolved(endpoint));
});
test('depth rejection has a certified Lipschitz bound and does not eliminate a one-move repair',()=>{
 const geometry=blockGeometry(group),bound=restorationDistanceBound(group);assert.equal(bound.maxDefectChange,512);
 const atom=group.atoms.find(a=>a.family==='frame-s1')!;const state=model.applyMove(group.canonical,atom.move),input=sparseStateOf(group,state.cubies);
 const result=searchMengerBlockRestoration(group,input,{depth:1});assert(result.restored);assert.equal(result.atoms.length,1);
 const rejected=searchMengerBlockRestoration(group,input,{depth:0});assert(rejected.certifiedDepthRejection);assert.equal(rejected.expanded,0);
 assert.equal(geometry.placements(input.siteOf),undefined);
});
test('worker transports the selected system and refuses historical-only algorithms',async()=>{
 let receive:(value:{data:unknown})=>void=()=>{};let deliver:(message:unknown)=>void=()=>{};
 (globalThis as unknown as {self:unknown}).self={postMessage:(message:unknown)=>deliver(message),set onmessage(handler:(value:{data:unknown})=>void){receive=handler;}};
 await import('../../../apps/lab/src/solverWorker');
 const atom=group.atoms.find(a=>a.family==='inner-square'&&[...a.map].some(([s,t])=>old.orbitOf[s]!==old.orbitOf[t]))!;
 const state=model.applyMove(group.canonical,atom.move);
 const request=(algorithmId:string)=>new Promise<{kind:string;result?:{success:boolean};message?:string}>((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Worker test timeout')),30000);timer.unref();
  deliver=(message:unknown)=>{const m=message as {kind:string};if(m.kind==='debug')return;clearTimeout(timer);resolve(message as never);};
  receive({data:{kind:'solve',algorithmId,moveSystem:'inner-square',level:3,cubies:state.cubies.map(c=>({id:c.id,currentPosition:c.currentPosition,orientation:[c.orientation.x,c.orientation.y,c.orientation.z,c.orientation.w]}))}});
 });
 const valid=await request('level3-inner-square-certified');assert.equal(valid.kind,'solve-result');assert(valid.result?.success);
 const invalid=await request('level3-slice-reduction');assert.equal(invalid.kind,'error');assert.match(invalid.message!,/does not support/);
});

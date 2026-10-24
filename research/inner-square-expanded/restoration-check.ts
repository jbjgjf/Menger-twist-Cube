import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {getCachedSparseGroup} from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import {liftAndCheckMacroAtoms,createHigherBlockRestorationAlgorithm} from '../../packages/solver-core/src/algorithms/higherBlockRestorationSolver';
import {createMengerPuzzleModel} from '../../packages/solver-core/src/model/mengerPuzzleModel';
const level=Number(process.argv[2]??3) as 3|4;const group=getCachedSparseGroup(level,'inner-square'),macro=getCachedSparseGroup(level-1,'inner-square');
const inner=macro.atoms.filter(a=>a.family==='inner-square');
const records=[];
for(const atom of inner){
 const lifted=liftAndCheckMacroAtoms(group,macro,atom);assert(lifted.length>0&&lifted.length<=3);records.push({macroAtom:atom.id,liftLength:lifted.length});
}
const atom=inner.find(a=>a.angle===90)!;const word=liftAndCheckMacroAtoms(group,macro,atom);
const model=createMengerPuzzleModel('inner-square');let state=group.canonical;
for(const a of word)state=model.applyMove(state,a.move);
const fine=group.atoms.find(a=>a.family==='frame-s1')!;state=model.applyMove(state,fine.move);
const result=await createHigherBlockRestorationAlgorithm(level).solve(model,state);assert(result.success,result.notes);
assert.equal(JSON.parse(result.explanation[0]!.observation).quotient,true);
let endpoint=state;for(const move of result.output_moves)endpoint=model.applyMove(endpoint,move);assert(model.isSolved(endpoint));
writeFileSync(`research/inner-square-expanded/out/restoration-L${level}.json`,JSON.stringify({level,liftsChecked:records.length,records,fullEngineVerified:true,outputMoves:result.move_count,phase:JSON.parse(result.explanation[0]!.observation)},null,2)+'\n');
console.log(JSON.stringify({level,liftsChecked:records.length,outputMoves:result.move_count,success:result.success}));

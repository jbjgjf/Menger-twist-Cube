import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {getCachedSparseGroup} from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import {createMengerPuzzleModel} from '../../packages/solver-core/src/model/mengerPuzzleModel';
import {createInnerSquareCertifiedAlgorithm} from '../../packages/solver-core/src/algorithms/innerSquareCertifiedSolver';
const level=Number(process.argv[2]??3) as 3|4;
const group=getCachedSparseGroup(level,'inner-square');const model=createMengerPuzzleModel('inner-square');
const solver=createInnerSquareCertifiedAlgorithm(level);
const atom=group.atoms.find(a=>a.family==='inner-square' && (level!==3||[...a.map.keys()].some(s=>group.orbitOf[s]===91)))!;
const state=model.applyMove(group.canonical,atom.move);
console.log(`Input ${atom.id}, ${atom.map.size} selected sites`);
const result=await solver.solve(model,state);console.log(JSON.stringify({success:result.success,moves:result.move_count,ms:result.runtime_ms,notes:result.notes,phases:result.explanation.map(s=>s.observation)}));
writeFileSync(`research/inner-square-expanded/out/trial-L${level}.json`,JSON.stringify({input:atom.id,success:result.success,moves:result.move_count,ms:result.runtime_ms,notes:result.notes},null,2)+'\n');
assert(result.success,result.notes);
if(result.move_count<10000){let endpoint=state;for(const move of result.output_moves){assert(model.isMoveLegal(endpoint,move));endpoint=model.applyMove(endpoint,move);}assert(model.isSolved(endpoint));console.log('Full engine endpoint passed');}

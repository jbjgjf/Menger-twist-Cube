import test from 'node:test';
import assert from 'node:assert/strict';
import {getCachedSparseGroup} from '../../../packages/solver-core/src/algorithms/mengerSparseGroup';
import {shareCommutatorSetup} from '../../../packages/solver-core/src/algorithms/mengerSharedCorrection';
test('shared correction validates original and conjugate support and rejects overlap',()=>{
 const group=getCachedSparseGroup(2,'inner-square');
 const tool=group.atoms.find(a=>a.map.size===1)!;
 const result=shareCommutatorSetup(group,[],[[tool]]);assert.equal(result.savedAtoms,0);
 assert.throws(()=>shareCommutatorSetup(group,[],[[tool],[tool]]),/overlapping/);
});

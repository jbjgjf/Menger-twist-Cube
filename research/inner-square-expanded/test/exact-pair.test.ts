import test from 'node:test';
import assert from 'node:assert/strict';
import {exactPairOverlap} from '../exact-pair';
import {collisionAngleForPair} from '../../../packages/engine/src/rotationLegality';
test('rational witnesses reject contact, separation and angles outside a quarter turn',()=>{
 assert.equal(exactPairOverlap([0,0],[1,0],0),false);
 assert.equal(exactPairOverlap([0,0],[3,0],Math.PI/4),false);
 assert.equal(exactPairOverlap([2,0],[0,2],Math.PI/2,90),true);
 assert.equal(exactPairOverlap([2,0],[0,2],Math.PI/2,-90),false);
 assert.equal(exactPairOverlap([2,0],[0,2],2*Math.PI/3,90),false);
});
test('every CCD positive on a finite integer pair grid has an exact witness in the swept arc',()=>{
 let count=0;
 for(let x=-2;x<=2;x++)for(let y=-2;y<=2;y++)for(let bx=-2;bx<=2;bx++)for(let by=-2;by<=2;by++)for(const angle of [90,-90,180]){
  if(x===bx&&y===by)continue;
  const theta=collisionAngleForPair([x,y],[bx,by],angle*Math.PI/180);
  if(theta===null)continue;assert(exactPairOverlap([x,y],[bx,by],theta,angle));count++;
 }
 assert(count>100);
});

import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {getCachedSparseGroup,orientationFrames,parityBasis} from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
const level=Number(process.argv[2]??3),old=getCachedSparseGroup(level),frames=orientationFrames(old);
const factorial=(n:number)=>{let f=1n;for(let i=2;i<=n;i++)f*=BigInt(i);return f;};
let oldOrder=2n**BigInt(parityBasis(old).length);
for(let oi=0;oi<old.orbits.length;oi++){
 const m=old.orbits[oi]!.length,h=frames[oi]!.freedom.length;oldOrder*=factorial(m)/2n;
 oldOrder*=h===1?1n:h===3?3n**BigInt(m-1):h===4?4n**BigInt(m):8n**BigInt(m)/2n;
}
const expandedOrder=BigInt(readFileSync(`research/inner-square-expanded/out/group-order-L${level}.txt`,'utf8').trim());assert.equal(expandedOrder%oldOrder,0n);
const index=expandedOrder/oldOrder;
const record={level,oldOrderDigits:oldOrder.toString().length,expandedOrderDigits:expandedOrder.toString().length,indexDigits:index.toString().length,indexApproxScientific:`${index.toString().slice(0,1)}.${index.toString().slice(1,12)}e${index.toString().length-1}`,strictExtension:index>1n,oldOrderFormulaDependency:`docs/proofs/level${level}-completeness.${level===3?'tex':'md'}`};
writeFileSync(`research/inner-square-expanded/out/index-L${level}.json`,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));

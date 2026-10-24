import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {getCachedSparseGroup} from '../../packages/solver-core/src/algorithms/mengerSparseGroup';
import {getInnerSignature} from '../../packages/solver-core/src/algorithms/mengerInnerSquareReduction';
const level=Number(process.argv[2]??3);const sig=getInnerSignature(getCachedSparseGroup(level,'inner-square'));
const units=new Map<number,{lo:bigint;hi:bigint}>(),even=new Map<number,bigint>();
const high=(v:bigint)=>v.toString(2).length-1;
const addEven=(input:bigint)=>{let v=input;while(v){const p=high(v),row=even.get(p);if(row===undefined){even.set(p,v);return;}v^=row;}};
for(const record of sig.atomSignatures.values()){
 assert.equal(record.three.size,0,'Order-four atoms cannot have a nonzero C3 homomorphic image');
 let lo=0n,hi=0n;for(const [i,x]of record.four){if(x&1)lo|=1n<<BigInt(i);if(x&2)hi|=1n<<BigInt(i);}
 while(lo){const p=high(lo),row=units.get(p);if(!row){units.set(p,{lo,hi});addEven(lo);lo=0n;hi=0n;break;}
  // Subtract a Z4 row using two bitplanes, including binary carries.
  hi=hi^row.hi^row.lo^(lo&row.lo);lo^=row.lo;
 }
 addEven(hi);
}
const image=2n**BigInt(units.size+even.size);assert.equal(image.toString(),sig.auditBasis().imageOrder);
const report={level,independentZ4UnitRank:units.size,independentEvenRank:even.size,imageOrder:image.toString(),agreesWithHowellSLP:true};
writeFileSync(`research/inner-square-expanded/out/independent-image-L${level}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

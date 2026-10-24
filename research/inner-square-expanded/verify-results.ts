import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='research/inner-square-expanded/out/';
const read=(file:string)=>JSON.parse(readFileSync(root+file,'utf8'));
const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const shipped=JSON.parse(readFileSync('packages/solver-core/src/algorithms/innerSquareTools.json','utf8'));
const catalog=read('catalog-report.json');assert.equal(catalog.maxLevel,4);
for(const level of [2,3,4]){
 const report=catalog.reports.find((r:{level:number})=>r.level===level);assert(report.complete&&report.exactCollisionWitnesses);assert.equal(report.judgeOnly,0);
 for(let i=0;i<2**level;i++){const p=read(`L${level}/profile-${i}.json`);assert(p.complete&&p.exactCollisionWitnesses);assert.equal(p.stats.cappedPivots.length,0);assert.equal(hash(JSON.stringify(p.targets)),p.sha256);}
 if(level===2)continue;
 const c=read(`certificate-L${level}.json`),tools=read(`tools-L${level}.json`),census=read(`census-L${level}.json`),image=read(`independent-image-L${level}.json`),small=read(`transport-L${level}.json`),functional=read(`functional-L${level}.json`),restore=read(`restoration-L${level}.json`),shared=read(`shared-L${level}.json`);
 assert.deepEqual(tools,shipped[level]);assert.equal(hash(JSON.stringify(tools)),c.toolDataSha256);assert.equal(c.catalogFileSha256,hash(readFileSync('packages/engine/src/data/innerSquareCatalog.json')));
 const integer=readFileSync(root+`group-order-L${level}.txt`,'utf8').trim();assert.equal(hash(integer),c.groupOrderSha256);assert.equal(integer.length,c.groupOrderDigits);
 assert.equal(census.newOrbits,c.orbits);assert.equal(census.atoms,c.atoms);assert.equal(image.imageOrder,c.basis.imageOrder);assert(image.agreesWithHowellSLP);
 const large=level===4?read('factored-transport-L4.json'):{allEdgeWitnessesVerified:true,records:[]};assert(large.allEdgeWitnessesVerified);
 assert.equal(small.orbits+large.records.filter((r:{kind:string})=>r.kind==='cycle').length,c.orbits);
 assert.equal(functional.records.length,c.pairGenerators+1);assert(functional.rejectedNonUnit&&functional.rejectedLoneC3);
 assert(restore.fullEngineVerified);assert.equal(restore.liftsChecked,level===3?54:1974);
 assert.equal(shared.independentCorrections,4);assert.equal(shared.affectedLeafBlocks,8);assert.equal(shared.sharedAtoms,10);assert.equal(shared.separateAtoms,16);
}
writeFileSync(root+'result-consistency.json',JSON.stringify({complete:true,geometryLevels:[2,3,4],groupLevels:[3,4],checked:['production tools','catalog hash','group-order integer hash','orbit census','independent image','complete cycle transport coverage','all orientation tools and negative controls','all macro inner lifts','shared setup examples']},null,2)+'\n');
console.log('All fixed-level result artifacts match the shipped implementation.');

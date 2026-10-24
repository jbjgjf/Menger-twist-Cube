import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {cpus,platform,arch,totalmem} from 'node:os';
const paths:string[]=[];
function visit(path:string){for(const e of readdirSync(path,{withFileTypes:true})){const p=`${path}/${e.name}`;if(e.isDirectory())visit(p);else if(/\.(ts|json)$/.test(p))paths.push(p);}}
for(const p of ['packages/engine/src','packages/solver-core/src/algorithms','research/inner-square-expanded/test'])visit(p);
for(const p of ['research/inner-square-expanded/benchmark.ts','research/inner-square-expanded/enumerate.ts','research/inner-square-expanded/exact-pair.ts','research/inner-square-expanded/certify.ts','research/inner-square-expanded/sample-state.ts'])paths.push(p);
const files=paths.sort().map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}));
const record={generatedAt:new Date().toISOString(),environment:{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,totalMemoryBytes:totalmem()},note:'Final source inventory. Primary benchmark implementationSha256 hashes its declared solver files and catalog; this manifest additionally records the supporting source. Runtime trials shared a machine.',sourceManifestSha256:createHash('sha256').update(JSON.stringify(files)).digest('hex'),files};
writeFileSync('research/inner-square-expanded/out/source-manifest.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({...record,files:files.length}));

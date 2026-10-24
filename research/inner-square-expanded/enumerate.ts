import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { exactPairOverlap } from './exact-pair';
import { createHash } from 'node:crypto';
import { createMengerPuzzleState, validateTurnTargetRotation } from '../../packages/engine/src/index';
import { collisionAngleForPair } from '../../packages/engine/src/rotationLegality';
import { enumerateSubsetCandidates, perpIndicesFor, targetForCells, allAngles, type AxisIndex } from '../square-rotation/model';
import type { Vector3Tuple } from 'three';
import type { TwistAngle } from '../../packages/engine/src/index';

const pairCache = new Map<string, boolean>();
let exactWitnessChecks=0;
// Exact squared radial bounds in doubled integer coordinates. Excluding pairs
// whose annuli do not overlap cannot hide any swept collision.
const radialCache = new Map<number, [number,number]>();
const radial = (x:number,y:number):[number,number] => {
  const a=Math.abs(2*x),b=Math.abs(2*y),key=a*1024+b;
  let value=radialCache.get(key);if(!value){value=[Math.max(a-1,0)**2+Math.max(b-1,0)**2,(a+1)**2+(b+1)**2];radialCache.set(key,value);}return value;
};
const oracle = (moving: Vector3Tuple[], blockers: Vector3Tuple[], axis: AxisIndex, pivot: Vector3Tuple, angle: TwistAngle): boolean => {
  const [u, v] = perpIndicesFor[axis];
  for (const m of moving) for (const b of blockers) {
    const x = m[u]! - pivot[u]!; const y = m[v]! - pivot[v]!;
    const bx = b[u]! - pivot[u]!; const by = b[v]! - pivot[v]!;
    const rm=radial(x,y),rb=radial(bx,by);
    if(rm[0]>=rb[1]||rb[0]>=rm[1])continue;
    const k = `${x},${y},${bx},${by},${angle}`;
    let hit = pairCache.get(k);
    if (hit === undefined) {
      const witness = collisionAngleForPair([x,y], [bx,by], angle * Math.PI / 180);
      hit = witness !== null;
      if(witness!==null){if(!exactPairOverlap([x,y],[bx,by],witness,angle))throw new Error('CCD collision has no exact rational SAT witness');exactWitnessChecks++;}
      if (pairCache.size > 300000) pairCache.clear();
      pairCache.set(k, hit);
    }
    if (hit) return true;
  }
  return false;
};
const level = Number(process.argv[2] ?? 3);
const onlyArg=process.argv.slice(3).find(a=>!a.startsWith('--'));
const only=onlyArg===undefined?undefined:Number(onlyArg);
const state = createMengerPuzzleState(level, { materializeCubies: true });
const dir = `research/inner-square-expanded/out/L${level}`;
mkdirSync(dir, {recursive: true});
for (let pattern = 0; pattern < 2 ** level; pattern++) {
  if (only !== undefined && pattern !== only) continue;
  const file = `${dir}/profile-${pattern}.json`;
  if (existsSync(file) && JSON.parse(readFileSync(file,'utf8')).complete === true && JSON.parse(readFileSync(file,'utf8')).exactCollisionWitnesses === true && !process.argv.includes('--force')) { console.log(`cached ${file}`); continue; }
  let layer = 0; for (let d = 0; d < level; d++) if ((pattern >> d) & 1) layer += 3 ** d;
  const plane = state.cubies.filter(c => c.currentPosition[0] === layer);
  exactWitnessChecks=0;
  const start = performance.now();
  const result = enumerateSubsetCandidates(plane, level, { planeFilter: (axis, l) => axis === 0 && l === layer, collisionOracle: oracle });
  if (result.stats.cappedPivots.length) throw new Error(`Incomplete profile ${pattern}: closed-set cap reached`);
  const targets = [];
  for (const candidate of result.candidates) {
    const target = targetForCells(candidate);
    let quarterWitness=false;
    const angles = allAngles.filter(a => {
      const verdict=validateTurnTargetRotation(plane,target,a);
      if(!verdict.legal&&verdict.code==='sweep-collision'){
        if(verdict.movingCubieId&&verdict.blockingCubieId&&verdict.collisionAngleDeg!==undefined){
          const m=plane.find(c=>c.id===verdict.movingCubieId)!.currentPosition,b=plane.find(c=>c.id===verdict.blockingCubieId)!.currentPosition;
          if(!exactPairOverlap([m[1]-target.pivot[1],m[2]-target.pivot[2]],[b[1]-target.pivot[1],b[2]-target.pivot[2]],verdict.collisionAngleDeg*Math.PI/180,a))throw new Error('Final engine rejection lacks exact witness');
          exactWitnessChecks++;if(Math.abs(a)===90)quarterWitness=true;
        }else if(!quarterWitness)throw new Error('Unexplained cached geometric rejection');
      }
      return verdict.legal;
    });
    if (!angles.length) continue;
    targets.push({ pivot: candidate.pivotInPlane, cells: candidate.cells.map(p => [p[1], p[2]]), angles });
  }
  targets.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const record = {level, pattern, layer, planeCells: plane.length, complete: true, ms: performance.now()-start,
    targets, exactCollisionWitnesses:true,exactWitnessChecks, stats: result.stats, sha256: createHash('sha256').update(JSON.stringify(targets)).digest('hex')};
  writeFileSync(file, JSON.stringify(record)+'\n'); pairCache.clear();
  console.log(JSON.stringify({level, pattern, layer, ms: record.ms, targets: targets.length, closedSets: result.stats.closedSets,exactWitnessChecks}));
}

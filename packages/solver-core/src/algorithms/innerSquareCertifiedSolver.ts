import type {MengerPuzzleState} from '@menger/engine';
import type {SolverAlgorithm,SolverMove,SolverRunResult} from '../algorithm/types';
import {getCachedSparseGroup,localLegalityCubies,type SparseGroup} from './mengerSparseGroup';
import {getInnerSignature,reduceInnerSquareState,type InnerSquareData} from './mengerInnerSquareReduction';
import {progressForCubies,stateKey} from './level1State';
import data from './innerSquareTools.json';
import {emitSolverDebug} from '../debug';
const primed=new WeakSet<object>();
export const primeExpandedLegality=(group:SparseGroup,state:MengerPuzzleState)=>{
 if(primed.has(state.turnTargets))return;
 // Canonical occupied geometry and complete cylinder neighborhood, identical
 // to the original legality rule. The model still validates each chosen atom.
 const cubieAt=(p:[number,number,number])=>group.canonical.cubies[group.siteAt(p)];
 const extent=(3**group.level-1)/2;
 for(const target of state.turnTargets){if(target.kind!=='extension')continue;
  // Prime only certified legal atoms; invalid angles remain invalid.
  const atoms=[90,-90,180].map(a=>group.atomById.get(`e:${target.id}:${a}`)).filter(a=>a!==undefined);
  if(!atoms.length)continue;
  const local=localLegalityCubies(target,cubieAt,extent);
  // Trigger through a local temporary state to retain the original engine cache.
  for(const atom of atoms) {
   // Imported lazily at module scope below; no alternative geometry test.
   if(!validateTurnTargetRotation(local,target,atom.angle).legal)throw new Error('Expanded target legality disagrees');
  }
 }
 primed.add(state.turnTargets);
};
import {validateTurnTargetRotation} from '@menger/engine';
const pools=new WeakMap<SparseGroup,SolverMove[]>();
export const createInnerSquareCertifiedAlgorithm=(level:3|4):SolverAlgorithm<MengerPuzzleState,SolverMove>=>({
 moveSystemsSupported:['inner-square'],
 id:`level${level}-inner-square-certified`,name:`Level ${level} complete inner-square reduction`,version:'0.1.0',levelsSupported:[level],
 async solve(model,state):Promise<SolverRunResult>{
  const start=performance.now();const input_state={level:state.level,cubieCount:state.cubies.length,stateKey:stateKey(state.cubies,false),progress:progressForCubies(state.cubies)};
  const failure=(notes:string):SolverRunResult=>({name:this.name,version:this.version,level_supported:[level],input_state,output_moves:[],move_count:0,runtime_ms:performance.now()-start,success:false,explanation:[],final_strategy:'Expanded certified reduction rejected the input.',complexity_estimate:'Joint abelian signature and finite pair transport.',notes});
  if(state.level!==level||state.moveSystem!=='inner-square')return failure('Requires the explicitly selected inner-square move system.');
  try{
   const group=getCachedSparseGroup(level,'inner-square');const old=getCachedSparseGroup(level);
   const tools=(data as unknown as Record<number,InnerSquareData>)[level];if(!tools)throw new Error('No complete tool certificate for this level');
   getInnerSignature(group);
   const result=reduceInnerSquareState(group,old,tools,state.cubies,s=>emitSolverDebug(this.id,s));
   primeExpandedLegality(group,state);const checked=new Set<string>();
   for(const a of result.atoms)if(!checked.has(a.id)){if(!model.isMoveLegal(state,a.move))throw new Error(`Model rejected ${a.id}`);checked.add(a.id);}
   return {name:this.name,version:this.version,level_supported:[level],input_state,success:true,output_moves:result.atoms.map(a=>a.move),move_count:result.atoms.length,runtime_ms:performance.now()-start,
    explanation:[{phase:'expanded certified reduction',objective:'Normalize all joint signatures; place expanded orbits; complete balanced orientation generators; independently replay.',observation:JSON.stringify({placements:result.placements,setupNodes:result.setupNodes,selectedEntries:result.selectedEntries}),progress:progressForCubies(group.canonical.cubies)}],
    final_strategy:'Joint Z4/Z3 signature normalization, pure cycles on merged orbits, paired holonomy generators and final D4 commutator.',complexity_estimate:'Finite bidirectional pair searches; sparse integer replay. No heuristic search cutoff.',notes:'Exactly solved with the full square-subset move system; solution length is not optimal.'};
  }catch(error){return failure(error instanceof Error?error.message:String(error));}
 },
 scrambleMovePool(_model,state){
  const g=getCachedSparseGroup(level,'inner-square');primeExpandedLegality(g,state);
  let pool=pools.get(g);if(!pool){
   const families=[g.atoms.filter(a=>a.kind==='frame'),g.atoms.filter(a=>a.kind==='extension'&&a.family!=='inner-square'),g.atoms.filter(a=>a.family==='inner-square')];
   const maximum=Math.max(...families.map(f=>f.length));
   pool=families.flatMap(f=>f.flatMap(a=>Array.from({length:Math.max(1,Math.round(maximum/f.length))},()=>a.move)));pools.set(g,pool);
  }return pool;
 },
});
export const level3InnerSquareCertifiedAlgorithm=createInnerSquareCertifiedAlgorithm(3);
export const level4InnerSquareCertifiedAlgorithm=createInnerSquareCertifiedAlgorithm(4);

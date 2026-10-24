import {fullAction,inverseAtom,inverseWord,actionOver,type SparseAtom,type SparseGroup,type SparseAction} from './mengerSparseGroup';
import {MengerPairTransport} from './mengerPairTransport';
import {pairSetup} from './mengerSparsePairTransport';
import type {InnerSquareData} from './mengerInnerSquareReduction';
interface Fiber {color:number;points:number[]}
interface Migration {atom:number;fibers:Map<number,Fiber[]>}
const migrationCache=new WeakMap<SparseGroup,{records:Migration[];at:number[][];inverse:Int32Array}>();
function migrations(group:SparseGroup,old:SparseGroup){
 let cached=migrationCache.get(group);if(cached)return cached;
 const records:Migration[]=[],at:number[][]=Array.from({length:old.orbits.length},()=>[]);
 const index=new Map(group.atoms.map((a,i)=>[a.id,i]));const inverse=Int32Array.from(group.atoms,a=>index.get(inverseAtom(group,a).id)!);
 for(let gi=0;gi<group.atoms.length;gi++){
  const atom=group.atoms[gi]!;const moved=new Map<number,{out:number;dest:Map<number,number[]>}>();
  for(const [s,t]of atom.map){const a=old.orbitOf[s]!,b=old.orbitOf[t]!;if(a===b)continue;
   let row=moved.get(a);if(!row){row={out:0,dest:new Map()};moved.set(a,row);}row.out++;
   const points=row.dest.get(b)??[];if(points.length<2)points.push(s);row.dest.set(b,points);
  }
  if(!moved.size)continue;const fibers=new Map<number,Fiber[]>();
  for(const [color,row]of moved){
   if(row.out<old.orbits[color]!.length){const stable:number[]=[];for(const s of old.orbits[color]!){if(old.orbitOf[atom.map.get(s)??s]===color)stable.push(s);if(stable.length===2)break;}row.dest.set(color,stable);}
   fibers.set(color,[...row.dest].map(([color,points])=>({color,points})));
  }
  const ri=records.length;records.push({atom:gi,fibers});for(const color of fibers.keys())at[color]!.push(ri);
 }
 cached={records,at,inverse};migrationCache.set(group,cached);return cached;
}

/** Quotient graph on OLD orbit labels, not on all position pairs. Within two
 * old fibers, independent old alternating factors provide exact pair transport.
 * A merged 25,248-site orbit has only 407 old fibers (165,649 quotient states). */
export class FiberPairTable {
 readonly colors:number[];readonly local:Map<number,number>;readonly next:Int32Array;readonly atom:Int32Array;readonly a:Int32Array;readonly b:Int32Array;
 readonly visitedStates:number;
 readonly maxDistance:number;
 constructor(readonly group:SparseGroup,readonly old:SparseGroup,orbit:number,target?:readonly number[]){
  this.colors=[...new Set(group.orbits[orbit]!.map(s=>old.orbitOf[s]!))];this.local=new Map(this.colors.map((c,i)=>[c,i]));const c=this.colors.length;
  this.next=new Int32Array(c*c).fill(-2);this.atom=new Int32Array(c*c).fill(-1);this.a=new Int32Array(c*c);this.b=new Int32Array(c*c);
  const queue=new Int32Array(c*c),distance=new Int32Array(c*c);let head=0,tail=0;
  if(target){const k=this.local.get(old.orbitOf[target[0]!]!)!*c+this.local.get(old.orbitOf[target[1]!]!)!;queue[tail++]=k;this.next[k]=-1;}
  else for(let i=0;i<c;i++){const k=i*c+i;queue[tail++]=k;this.next[k]=-1;}
  const m=migrations(group,old);
  while(head<tail){const key=queue[head++]!,A=this.colors[Math.floor(key/c)]!,B=this.colors[key%c]!;
   for(const ri of new Set([...m.at[A]!,...m.at[B]!])){
    const row=m.records[ri]!,g=group.atoms[row.atom]!;
    const left=row.fibers.get(A)??[{color:A,points:old.orbits[A]!.slice(0,2)}];
    const right=row.fibers.get(B)??[{color:B,points:old.orbits[B]!.slice(0,2)}];
    for(const x of left)for(const y of right){
     const C=this.local.get(x.color),D=this.local.get(y.color);if(C===undefined||D===undefined)throw new Error('Migration leaves expanded orbit');
     const dest=C*c+D;if(this.next[dest]!==-2)continue;
     const p=x.points[0]!,q=y.points[0]===p?y.points[1]:y.points[0];if(q===undefined)continue;
     this.next[dest]=key;distance[dest]=distance[key]!+1;this.atom[dest]=m.inverse[row.atom]!;this.a[dest]=g.map.get(p)??p;this.b[dest]=g.map.get(q)??q;queue[tail++]=dest;
    }
   }
  }
  if(tail!==c*c)throw new Error(`Incomplete old-fiber pair graph: ${tail}/${c*c}`);this.visitedStates=tail;
  let max=0;
  for(let key=0;key<c*c;key++){max=Math.max(max,distance[key]!);const next=this.next[key]!;if(next===-1)continue;
   const g=group.atoms[this.atom[key]!]!,a=this.a[key]!,b=this.b[key]!;
   if(a===b||this.local.get(old.orbitOf[a]!)!==Math.floor(key/c)||this.local.get(old.orbitOf[b]!)!==key%c||this.local.get(old.orbitOf[g.map.get(a)??a]!)!==Math.floor(next/c)||this.local.get(old.orbitOf[g.map.get(b)??b]!)!==next%c||distance[next]!+1!==distance[key])throw new Error('Invalid quotient-edge witness');
  }
  this.maxDistance=max;
 }
 route(pair:readonly number[]):{word:SparseAtom[];pair:number[];visited:number}{
  const c=this.colors.length;let current=[...pair];const word:SparseAtom[]=[];let visited=0;
  while(true){const A=this.local.get(this.old.orbitOf[current[0]!]!)!,B=this.local.get(this.old.orbitOf[current[1]!]!)!,key=A*c+B;if(this.next[key]===-1)break;
   const setup=pairSetup(this.old,current,[this.a[key]!,this.b[key]!]);visited+=setup.visited;
   for(const g of setup.word)word.push(g);
   const g=this.group.atoms[this.atom[key]!]!;word.push(g);current=[g.map.get(this.a[key]!)??this.a[key]!,g.map.get(this.b[key]!)??this.b[key]!];
   const next=this.next[key]!,actual=this.local.get(this.old.orbitOf[current[0]!]!)!*c+this.local.get(this.old.orbitOf[current[1]!]!)!;
   if(actual!==next)throw new Error('Fiber transport witness mismatch');
  }
  return {word,pair:current,visited};
 }
}

export class FactoredCycleTransport {
 readonly table:FiberPairTable;visitedStates=0;
 private readonly cache=new Map<number,MengerPairTransport>();
 constructor(readonly group:SparseGroup,readonly old:SparseGroup,orbit:number,readonly data:InnerSquareData){this.table=new FiberPairTable(group,old,orbit);this.visitedStates=this.table.visitedStates;}
 cycleForEdge(pair:number[],forbidden:Set<number>):{word:SparseAtom[];action:SparseAction}{
  const route=this.table.route(pair);this.visitedStates+=route.visited;const oi=this.old.orbitOf[route.pair[0]!]!;
  let transport=this.cache.get(oi);
  if(!transport){
   const record=this.data.oldTools.find(t=>t.orbit===oi);if(!record)throw new Error(`Missing old fiber tool ${oi}`);
   const word=record.word.map(id=>this.old.atomById.get(id)!);const action=fullAction(word);const a=action.keys().next().value!,b=action.get(a)![0],c=action.get(b)![0];
   transport=new MengerPairTransport(this.old,oi,[a,b,c],word,true);this.cache.set(oi,transport);this.visitedStates+=transport.visitedStates;
  }
  const transformed=new Set([...forbidden].map(s=>{for(const g of route.word)s=g.map.get(s)??s;return s;}));
  const tool=transport.cycleForEdge(route.pair,transformed);const inverse=inverseWord(this.group,route.word);
  const support=[...tool.action.keys()].map(s=>{for(const g of inverse)s=g.map.get(s)??s;return s;});
  const word=[...route.word,...tool.word,...inverse];return {word,action:actionOver(word,support)};
 }
}

export class FactoredTwisterTransport {
 readonly table:FiberPairTable;visitedStates=0;
 constructor(readonly group:SparseGroup,readonly old:SparseGroup,orbit:number,readonly word:SparseAtom[],readonly target:number[]){this.table=new FiberPairTable(group,old,orbit,target);this.visitedStates=this.table.visitedStates;}
 wordFor(pair:number[]):SparseAtom[]{
  const route=this.table.route(pair),final=pairSetup(this.old,route.pair,this.target);this.visitedStates+=route.visited+final.visited;
  const setup=[...route.word,...final.word];return [...setup,...this.word,...inverseWord(this.group,setup)];
 }
}

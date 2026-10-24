import { actionOver, inverseAtom, inverseWord, type SparseAtom, type SparseGroup, type SparseAction } from './mengerSparseGroup';
import { MengerPairTransport } from './mengerPairTransport';

/** On-demand bidirectional BFS. No m² dense table and no empirical depth/node
 * cutoff. Exhausting either finite frontier is an explicit connectivity error. */
export function pairSetup(group: SparseGroup, from: readonly number[], to: readonly number[] | readonly (readonly number[])[], compiledGoals?:ReadonlySet<number>): { word: SparseAtom[]; visited: number; target: number[] } {
  const N=group.N;const encode=(p:readonly number[])=>p[0]!*N+p[1]!;
  const targets=(typeof to[0]==='number'?[to]:to) as readonly (readonly number[])[];
  const goals=compiledGoals??new Set(targets.map(encode));
  const start=encode(from);
  if(goals.has(start))return {word:[],visited:1,target:[...from]};
  type Link={parent:number;atom:number};
  const forward=new Map<number,Link>([[start,{parent:-1,atom:-1}]]);
  // Root membership is shared, not copied once per placement.
  const backward=new Map<number,Link>();
  let f=[start],b=[...goals],meet:number|undefined;
  while(f.length&&b.length&&meet===undefined){
    const goForward=f.length<=b.length;const own=goForward?forward:backward;
    const next:number[]=[];
    outer:for(const key of goForward?f:b){
      const x=Math.floor(key/N),y=key%N;
      const incident=new Set([...group.atomsAt[x]!,...group.atomsAt[y]!]);
      for(const gi of incident){const a=group.atoms[gi]!;const nx=a.map.get(x)??x,ny=a.map.get(y)??y;const k=nx*N+ny;
        if(own.has(k)||(!goForward&&goals.has(k)))continue;own.set(k,{parent:key,atom:gi});next.push(k);
        if(goForward?(backward.has(k)||goals.has(k)):forward.has(k)){meet=k;break outer;}
      }
    }
    if(goForward)f=next;else b=next;
  }
  if(meet===undefined)throw new Error('Ordered-pair transport graph is disconnected');
  const left:SparseAtom[]=[];let k=meet;
  while(forward.get(k)!.parent!==-1){const link=forward.get(k)!;left.push(group.atoms[link.atom]!);k=link.parent;}
  left.reverse();const right:SparseAtom[]=[];k=meet;
  while(!goals.has(k)){const link=backward.get(k)!;right.push(inverseAtom(group,group.atoms[link.atom]!));k=link.parent;}
  return {word:[...left,...right],visited:forward.size+backward.size,target:[Math.floor(k/N),k%N]};
}

/** O(m) single-point transport tree supplies a certified pair anchor at every
 * possible first endpoint. It avoids restricting large merged orbits to one
 * small old suborbit. All conjugation words are reconstructed only on demand. */
class AnchorTree {
  readonly parent:Int32Array;readonly generator:Int32Array;readonly second:Int32Array;
  readonly supportAt=new Map<number,number[][]>();readonly goals=new Set<number>();readonly targets:number[][]=[];
  readonly root:number;
  constructor(readonly group:SparseGroup,readonly bases:Array<{support:number[];word:SparseAtom[]}>){
    this.root=bases[0]!.support[0]!;this.parent=new Int32Array(group.N).fill(-2);this.generator=new Int32Array(group.N).fill(-1);this.second=new Int32Array(group.N);
    this.parent[this.root]=-1;this.supportAt.set(this.root,bases.map(b=>b.support));const queue=[this.root];
    for(let head=0;head<queue.length;head++){
      const s=queue[head]!,supports=this.supportAt.get(s)!;
      const pair=supports[0]!.slice(0,2);this.targets.push(pair);this.goals.add(pair[0]!*group.N+pair[1]!);this.second[s]=pair[1]!;
      for(const gi of group.atomsAt[s]!){const atom=group.atoms[gi]!,to=atom.map.get(s)??s;if(this.parent[to]!==-2)continue;
        this.parent[to]=s;this.generator[to]=gi;this.supportAt.set(to,supports.map(p=>p.map(t=>atom.map.get(t)??t)));queue.push(to);
      }
    }
    if(queue.length!==group.orbits[group.orbitOf[this.root]!]!.length)throw new Error('Single-point anchor tree is incomplete');
  }
  wordAt(first:number,index:number):SparseAtom[]{
    const path:SparseAtom[]=[];let s=first;
    while(s!==this.root){path.push(this.group.atoms[this.generator[s]!]!);s=this.parent[s]!;}path.reverse();
    return [...inverseWord(this.group,path),...this.bases[index]!.word,...path];
  }
}

export class SparseTwisterTransport {
 readonly tree:AnchorTree;visitedStates=0;
 constructor(readonly group:SparseGroup,baseWord:SparseAtom[],basePair:number[]){this.tree=new AnchorTree(group,[{word:baseWord,support:basePair}]);this.visitedStates=this.tree.goals.size;}
 wordFor(pair:number[]):SparseAtom[]{const setup=pairSetup(this.group,pair,this.tree.targets,this.tree.goals);this.visitedStates+=setup.visited;return [...setup.word,...this.tree.wordAt(setup.target[0]!,0),...inverseWord(this.group,setup.word)];}
}

/** Use three already certified old-group anchor cycles on one directed edge.
 * Expanded generators transport that edge; distinct third sites avoid any two
 * forbidden sites. This retains the old finite anchor certificate. */
export class SparseCycleTransport {
  visitedStates=0;
  private readonly tree:AnchorTree;
  constructor(readonly group:SparseGroup,old:SparseGroup,oldOrbit:number,baseWord:SparseAtom[],baseTuple:number[]){
    const certified=new MengerPairTransport(old,oldOrbit,baseTuple,baseWord,true);
    const roots=certified.alternatives.values().next().value;
    if(!roots||roots.length<3)throw new Error('No certified three-alternative anchor');
    const bases=roots.slice(0,3).map(r=>({support:r.support.map(s=>certified.sites[s]!),word:r.word}));
    this.tree=new AnchorTree(group,bases);this.visitedStates=this.tree.goals.size;
  }
  cycleForEdge(pair:number[],forbidden:Set<number>):{word:SparseAtom[];action:SparseAction}{
    const setup=pairSetup(this.group,pair,this.tree.targets,this.tree.goals);this.visitedStates+=setup.visited;
    const inverse=inverseWord(this.group,setup.word);
    for(const [i,points]of this.tree.supportAt.get(setup.target[0]!)!.entries()){
      const support=points.map(s=>{for(const a of inverse)s=a.map.get(s)??s;return s;});
      if(support.some(s=>forbidden.has(s)))continue;
      const word=[...setup.word,...this.tree.wordAt(setup.target[0]!,i),...inverse];
      return {word,action:actionOver(word,support)};
    }
    throw new Error('Three distinct anchor alternatives were all forbidden');
  }
}

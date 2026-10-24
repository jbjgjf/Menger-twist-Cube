import {fullAction,inverseWord,type SparseAtom,type SparseGroup} from './mengerSparseGroup';
/** Certify independent commutators [S,T_i] can share S. Words act left to
 * right. Check actual conjugate support to avoid a convention-dependent image.
 * The sufficient condition is disjoint (supp(T_i) union supp(S T_i S^-1)). */
export function shareCommutatorSetup(group:SparseGroup,setup:readonly SparseAtom[],tools:ReadonlyArray<readonly SparseAtom[]>){
 const inverse=inverseWord(group,setup),supports:number[][]=[];
 for(const tool of tools){
  const support=new Set([...fullAction(tool).keys(),...fullAction([...setup,...tool,...inverse]).keys()]);
  if(supports.some(other=>other.some(s=>support.has(s))))throw new Error('Corrections have overlapping original or conjugate support');
  supports.push([...support]);
 }
 const batch:SparseAtom[]=[];for(const tool of tools)for(const atom of tool)batch.push(atom);
 const word=[...setup,...batch,...inverse,...inverseWord(group,batch)];
 const separate:SparseAtom[]=[];
 for(const tool of tools)for(const atom of [...setup,...tool,...inverse,...inverseWord(group,tool)])separate.push(atom);
 // Independent exact action check, including orientations and all other sites.
 const canonical=(atoms:readonly SparseAtom[])=>JSON.stringify([...fullAction(atoms)].sort((a,b)=>a[0]-b[0]));
 if(canonical(word)!==canonical(separate))throw new Error('Shared commutator disagrees with separate corrections');
 return {word,separate,supports,savedAtoms:separate.length-word.length};
}

// @ts-nocheck
/*
 * Ported verbatim from the standalone page "八面体パズル Level 1.html" (八面体パズル).
 * The algorithm below is the original code, unchanged; only the module
 * wrapper (this header and the export at the end) was added. Type checking is
 * off so the original text can stay byte-for-byte. The typed API lives in
 * ../solve.ts.
 */
// ---- ソルバー ----
// 外側24個（4×4×4キューブのセンターに相当する部分）と内側8個（Level 0）に分けて解く。
// 外側：シスルスウェイト法（許す90°回転を段階的に減らした部分群の列。各段は剰余類空間の幅優先探索の表で最短手）。表はページ読み込み後に順次作る。
// 内側：Level 0 の最短手ソルバー。内側は外側を動かさない手（中心の小八面体の半分）だけで解ける。
const SOLVER=(()=>{
// ===== レベル1の幾何（32スロット：0..7 中心、8..31 外側）=====
const AXD=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const slotG=[],slotS=[];
for(const sx of[1,-1])for(const sy of[1,-1])for(const sz of[1,-1]){slotG.push([sx,sy,sz]);slotS.push([sx,sy,sz]);}
AXD.forEach((d,ai)=>{const k=ai>>1;for(const p of[1,-1])for(const q of[1,-1]){
  const s=[0,0,0];s[k]=d[k];s[(k+1)%3]=p;s[(k+2)%3]=q;
  slotG.push(s.map((x,i)=>x+4*d[i]));slotS.push(s);}});
const slotIdx=new Map(slotG.map((g,i)=>[g.join(),i]));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
// dir：1＝反時計回り90°、−1＝時計回り90°、2＝180°
const rot=(v,d,dir)=>{const t=dot(d,v);if(dir===2)return v.map((x,i)=>2*d[i]*t-x+0);const c=cross(d,v);return [0,1,2].map(i=>dir*c[i]+d[i]*t+0);};
const inReg=(g,d,k)=>{const t=dot(g,d);return k===0?(t>0&&t<4):k===1?(t>0&&Math.max(Math.abs(g[0]),Math.abs(g[1]),Math.abs(g[2]))===1):t>4;};
const DIRS=[1,-1,2],DI=d=>d===1?0:d===-1?1:2,invDir=d=>d===2?2:-d;
// 手 id = (軸*3+範囲k)*3 + 向き番号（0:+90° 1:−90° 2:180°）
const GM=[];for(let ai=0;ai<6;ai++)for(let k=0;k<3;k++)for(const dir of DIRS)GM.push({ai,k,dir});
const NO=72;              // 外側24ピースのステッカー数（スロット8..31 → 0..71）
const IDO=Uint8Array.from({length:NO},(_,i)=>i);
const compO=(a,b)=>{const r=new Uint8Array(NO);for(let i=0;i<NO;i++)r[i]=b[a[i]];return r;};
const invO=a=>{const r=new Uint8Array(NO);for(let i=0;i<NO;i++)r[a[i]]=i;return r;};
const isIdO=a=>{for(let i=0;i<NO;i++)if(a[i]!==i)return false;return true;};
function outerMove(ai,k,dir){
  const d=AXD[ai],p=Array.from(IDO);
  for(let u=8;u<32;u++){
    const g=slotG[u];if(!inReg(g,d,k))continue;
    const u2=slotIdx.get(rot(g,d,dir).join());
    for(let i=0;i<3;i++){const v=[0,0,0];v[i]=slotS[u][i];const w=rot(v,d,dir);p[(u-8)*3+i]=(u2-8)*3+w.findIndex(x=>x!==0);}
  }
  return Uint8Array.from(p);
}
// 外側だけの手（k=0 と k=2）。外側用 id = ((軸*2+(k==2))*3 + 向き番号)
const OM=[],OMAP=[];
for(let ai=0;ai<6;ai++)for(const k of[0,2])for(const dir of DIRS){OM.push(outerMove(ai,k,dir));OMAP.push((ai*3+k)*3+DI(dir));}
const DATA={"base":[24,0,27,12,6,36,48,3,60,9,15,21,30,33,39,42,45,57,63,66,54,51,18],"tables":[[[2,[25,4]],[4,[25,5]],[7,[25]],[11,[25,3]],[13,[24]],[17,[24,9]],[20,[24,10]],[22,[25,20]],[29,[16]],[32,[15]],[33,[17]],[38,[16,26]],[39,[26]],[42,[2]],[47,[16,8]],[49,[24,12]],[51,[0]],[54,[17,7]],[58,[25,18]],[60,[1]],[64,[25,19]],[67,[24,13]],[69,[17,6]]],[[3,[4]],[6,[3]],[9,[5]],[12,[4,14]],[15,[14]],[18,[5,20]],[21,[4,32]],[28,[2,24,2]],[31,[5,31]],[34,[4,31]],[37,[15,25,16]],[40,[13,7]],[43,[4,30]],[46,[5,30]],[50,[4,13]],[53,[5,18]],[56,[13]],[59,[3,18]],[62,[12]],[65,[3,19]],[68,[4,12]],[71,[5,19]]],[[5,[16,30,15]],[8,[7,19]],[10,[8,31]],[14,[8,30,10]],[16,[8,30]],[19,[8,30,11]],[23,[7,18]],[30,[8,32]],[35,[2,16,2]],[36,[8,23]],[41,[8,22]],[44,[8,21]],[45,[8]],[48,[7,29]],[52,[7,27]],[55,[7,28]],[57,[7]],[61,[6,33]],[63,[7,20]],[66,[6]],[70,[6,34]]],[[3,[11,32]],[6,[11,20]],[9,[9,32]],[15,[9]],[18,[10]],[21,[11]],[31,[9,30]],[34,[11,30]],[37,[9,31,23]],[40,[11,31,23]],[43,[11,31]],[46,[9,31]],[50,[3,12,4]],[53,[10,19]],[56,[11,19,28]],[59,[11,19]],[62,[11,18,34]],[65,[11,18]],[68,[3,13,4]],[71,[10,18]]],[[3,[20,32]],[9,[13,3,12]],[15,[3,32,4]],[18,[18,27,18]],[21,[20]],[31,[1,19,0]],[34,[20,30]],[37,[20,31,21]],[40,[20,31,23]],[43,[20,31]],[46,[3,30,4]],[50,[18,29]],[53,[18,27]],[56,[18,28]],[59,[18]],[62,[19,34]],[65,[19]],[68,[19,35]],[71,[19,33]]],[[5,[22,31]],[10,[23,31]],[16,[23,30]],[19,[10,22,30,9]],[23,[22,30]],[30,[23,32]],[35,[22,32]],[41,[21]],[44,[22]],[45,[23]],[48,[16,1,15]],[52,[19,23,31,18]],[55,[1,27,0]],[57,[1,29,0]],[61,[12,23,30,13]],[63,[16,0,15]],[66,[0,35,1]],[70,[0,33,1]]],[[5,[2,13,2,12]],[10,[1,30,0]],[16,[1,31,0]],[19,[13,10,12]],[23,[13,11,12]],[30,[15,27,6,16]],[35,[12,31,13]],[41,[0,21,1]],[44,[12,30,13]],[45,[0,23,1]],[52,[28]],[55,[27]],[57,[29]],[61,[1,32,21,0]],[63,[14,35,14]],[66,[2,35,2]],[70,[2,33,2]]],[[9,[26,4,26,9]],[15,[21,30,22,30]],[18,[4,20,3]],[21,[32]],[31,[32,10,30,9]],[34,[31]],[40,[1,30,23,31,0]],[43,[30]],[46,[21,30,22]],[53,[0,30,1]],[56,[6,31,7]],[59,[18,32,19]],[62,[4,19,35,3]],[65,[19,32,18]],[68,[12,8,13,8]],[71,[4,19,3]]],[[11,[12,32,14,11,12]],[17,[9,12,9,13,10]],[20,[12,11,13]],[22,[12,9,13]],[32,[35,15,7,16]],[33,[15,34,7,16]],[39,[1,23,0]],[42,[34,13,30,12]],[47,[1,22,0]],[51,[14,29,14]],[54,[2,29,2]],[58,[2,28,2]],[64,[33]],[67,[34]],[69,[35]]],[[15,[26,3,32,4,26,10]],[18,[14,4,20,3,14,9]],[21,[24,3,32,4,25]],[31,[13,31,12]],[34,[6,19,7,18]],[40,[15,19,6,16,18]],[43,[1,18,0,19]],[46,[13,30,12]],[53,[18,1,19,0]],[56,[13,32,12]],[59,[7,30,6,31]],[65,[0,31,1,30]],[68,[6,30,7,31]],[71,[19,6,18,7]]],[[18,[31,10,21,30,22,9]],[21,[25,16,24,9]],[31,[10,31,9,30]],[34,[11,31,10,30,11]],[40,[21,31,22,30]],[43,[11,30,10,31,11]],[46,[10,30,9,31]],[53,[25,18,11,19,24]],[56,[7,21,31,22,30,6]],[59,[12,27,13,10]],[65,[13,33,12,10]],[68,[8,12,27,13,10,8]],[71,[25,19,11,18,24]]],[[18,[13,9,12,28]],[31,[0,13,11,12,1]],[34,[9,31,10,30,10]],[40,[6,27,13,10,12,7]],[43,[0,12,10,13,1]],[46,[9,30,11,31,10]],[53,[2,12,10,13,2]],[56,[27,13,10,12]],[59,[11,18,11,19,11]],[65,[12,10,13,33]],[68,[2,12,11,13,2]],[71,[11,13,34,12,11]]],[[19,[12,31,11,30,13]],[35,[26,15,26,22]],[41,[15,8,16]],[44,[23,26,16,26,23]],[45,[0,32,1,32]],[52,[15,20,6,16,20]],[55,[15,7,16]],[57,[7,32,6,32]],[63,[1,20,0,20]],[66,[6,32,7,32]],[70,[15,6,16]]],[[20,[31,13,9,12,28,30]],[39,[2,15,2,22,8,22]],[42,[8,22,32,21,8,22,32]],[47,[0,15,8,16,1]],[51,[20,6,20,7]],[54,[7,20,7,20,6]],[58,[0,15,1,34,7]],[64,[31,4,18,3,30]],[67,[0,15,6,16,1]],[69,[6,20,7,20]]],[[20,[18,22,0,33,1,19]],[42,[1,28,21,0,21,34]],[47,[0,34,1,21]],[51,[14,0,23,1,14]],[54,[0,22,1,27]],[58,[23,1,28,0,23]],[64,[33,1,22,0]],[67,[14,0,22,1,14]],[69,[22,0,33,1]]],[[20,[24,1,27,0,25]],[47,[12,30,10,31,13]],[51,[22,28,0,21,1,21]],[54,[24,1,29,0,25]],[58,[1,28,2,33,1]],[64,[30,12,10,13,31,33]],[67,[24,0,34,1,25]],[69,[24,0,35,1,25]]],[[19,[21,24,1,27,0,25,22]],[52,[12,30,12,29,13,31,13]],[55,[0,21,1,29,0,22,1]],[57,[21,1,28,2,33,1,22]],[63,[12,30,13,33,12,31,13]],[66,[21,0,34,2,27,0,22]],[70,[12,30,13,35,12,31,13]]],[[19,[12,9,12,29,13,10,13]],[52,[2,34,2,27]],[55,[14,33,14,28]],[63,[14,28,14,33]],[66,[2,27,2,34]],[70,[28,14,35,14,27]]],[[19,[12,9,13,35,12,10,13]],[52,[28,14,34,14,29,14,34,14]],[55,[14,34,14,2,34,2]],[66,[12,9,13,34,12,10,13]],[70,[8,27,14,34,14,8]]],[[19,[0,24,0,35,1,25,1]],[52,[0,24,0,33,1,25,1]],[55,[27,2,33,2,29,2,33,2]],[70,[34,2,27,2,14,27,14]]],[[20,[8,13,11,12,8,13,11,12]],[51,[1,19,0,29,1,18,0,13,11,12]],[69,[13,11,12,8,13,11,12,8]]],[[20,[8,12,9,13,8,14,27,13,10,13]],[69,[29,13,11,12,8,13,11,12,8,29]]],[[71,[19,8,12,9,13,8,14,27,13,10,13,18]]]]};
const BASE=DATA.base;
const wpermO=w=>{let p=IDO;for(const c of w)p=compO(p,OM[c]);return p;};
const TABO=DATA.tables.map(l=>new Map(l.map(([y,w])=>[y,{p:wpermO(w),w}])));
const toGM=w=>w.map(c=>OMAP[c]);
function wordFor(h){
  const parts=[];
  for(let i=0;i<BASE.length;i++){
    const y=h[BASE[i]];if(y===BASE[i])continue;
    const t=TABO[i].get(y);if(!t)return null;
    h=compO(h,invO(t.p));parts.push(t.w);
  }
  if(!isIdO(h))return null;
  let w=[];for(let i=parts.length-1;i>=0;i--)w=w.concat(parts[i]);
  return w;
}
// ===== 回転（八面体群24通り）=====
const ROT=[],ROTIDX=new Map();
(function(){
  const det=m=>m[0]*(m[4]*m[8]-m[5]*m[7])-m[1]*(m[3]*m[8]-m[5]*m[6])+m[2]*(m[3]*m[7]-m[4]*m[6]);
  for(const p of[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]])
    for(let s=0;s<8;s++){
      const m=new Array(9).fill(0);
      for(let r=0;r<3;r++)m[r*3+p[r]]=(s>>r&1)?-1:1;
      if(det(m)===1){ROTIDX.set(m.join(),ROT.length);ROT.push(m);}
    }
})();
const mm=(A,B)=>{const C=new Array(9).fill(0);for(let r=0;r<3;r++)for(let c=0;c<3;c++)for(let k=0;k<3;k++)C[r*3+c]+=A[r*3+k]*B[k*3+c];return C;};
const tp=A=>[A[0],A[3],A[6],A[1],A[4],A[7],A[2],A[5],A[8]];
const MUL=ROT.map(A=>ROT.map(B=>ROTIDX.get(mm(A,B).join())));
const INV=ROT.map(A=>ROTIDX.get(tp(A).join()));
const IDENT=ROTIDX.get('1,0,0,0,1,0,0,0,1');
const QROT=[];
for(let ai=0;ai<6;ai++)for(const dir of DIRS){
  const d=AXD[ai],cols=[0,1,2].map(c=>{const e=[0,0,0];e[c]=1;return rot(e,d,dir);});
  const m=[];for(let r=0;r<3;r++)for(let c=0;c<3;c++)m.push(cols[c][r]);
  QROT[ai*3+DI(dir)]=ROTIDX.get(m.join());
}
const qr=(ai,dir)=>QROT[ai*3+DI(dir)];
// ===== 内側8ピース（Level 0 のソルバー：全体の回転を同一視して最短手。180°も1手）=====
const HV=slotG.slice(0,8);
const SIGN=new Int8Array(24*24);
for(let r=0;r<24;r++)for(let i=0;i<8;i++)for(let a=0;a<3;a++){
  let s=0;for(let j=0;j<3;j++)s+=ROT[r][a*3+j]*HV[i][j];
  SIGN[r*24+i*3+a]=s>0?1:0;
}
const Q3=[[1,0,0,0,0,-1,0,1,0],[0,0,1,0,1,0,-1,0,0],[0,-1,0,1,0,0,0,0,1]];
const MVROT=[];   // 手 m = 軸a*3 + 向き番号（各軸の＋側の頂点を回す）
for(let a=0;a<3;a++){const q=ROTIDX.get(Q3[a].join());MVROT.push(q,ROTIDX.get(tp(Q3[a]).join()),MUL[q][q]);}
const applyMove0=(st,m)=>{
  const a=(m/3)|0,M=MVROT[m],o=new Uint8Array(8);
  for(let i=0;i<8;i++){const r=st[i];o[i]=SIGN[r*24+i*3+a]?MUL[M][r]:r;}
  return o;
};
const keyOf=st=>{const iv=INV[st[0]];let k='';for(let i=1;i<8;i++)k+=String.fromCharCode(65+MUL[iv][st[i]]);return k;};
let TAB=null;
function buildTab(){
  const root=new Uint8Array(8).fill(IDENT),e0={st:root,path:[]};
  TAB=new Map([[keyOf(root),e0]]);
  let fr=[e0];
  for(let d=0;d<6;d++){
    const nx=[];
    for(const n of fr)for(let m=0;m<9;m++){
      const s=applyMove0(n.st,m),k=keyOf(s);
      if(TAB.has(k))continue;
      const e={st:s,path:n.path.concat(m)};TAB.set(k,e);nx.push(e);
    }
    fr=nx;
  }
}
// 内側の最短手（全体の回転は問わない。最大11手）：[[軸番号, 向き], …]
function innerSolution(st){
  if(!TAB)buildTab();
  let best=null;
  const chk=n=>{const t=TAB.get(keyOf(n.st));if(t){const len=n.path.length+t.path.length;if(!best||len<best.len)best={len,f:n,t};}};
  const root={st,path:[]};chk(root);
  const seen=new Set([keyOf(st)]);let fr=[root];
  for(let d=0;d<5&&!(best&&best.len<=d+1);d++){
    const nx=[];
    for(const n of fr)for(let m=0;m<9;m++){
      const s=applyMove0(n.st,m),k=keyOf(s);
      if(seen.has(k))continue;seen.add(k);
      const e={st:s,path:n.path.concat(m)};chk(e);nx.push(e);
    }
    fr=nx;
  }
  if(!best)return null;
  const seq=best.f.path.map(m=>[((m/3)|0)*2,DIRS[m%3]]);
  const G=mm(ROT[best.f.st[0]],tp(ROT[best.t.st[0]]));
  for(let j=best.t.path.length-1;j>=0;j--){
    const m=best.t.path[j],a=(m/3)|0,di=m%3;
    const dir=di===0?-1:di===1?1:2;   // 表側の手の逆手
    const d=[G[a],G[3+a],G[6+a]];
    const ai=AXD.findIndex(x=>x[0]===d[0]&&x[1]===d[1]&&x[2]===d[2]);
    seq.push([ai,dir]);
  }
  return seq;
}
function innerTurn(st,ai,dir){
  const d=AXD[ai],Q=qr(ai,dir),o=Uint8Array.from(st);
  for(let i=0;i<8;i++){
    const pos=[0,1,2].map(r=>ROT[st[i]][r*3]*HV[i][0]+ROT[st[i]][r*3+1]*HV[i][1]+ROT[st[i]][r*3+2]*HV[i][2]);
    if(dot(pos,d)>0)o[i]=MUL[Q][st[i]];
  }
  return o;
}
// ===== 全体の解法 =====
const permOfRot=M=>{
  const p=new Uint8Array(NO);
  for(let pi=8;pi<32;pi++){
    const gm=[0,1,2].map(r=>M[r*3]*slotG[pi][0]+M[r*3+1]*slotG[pi][1]+M[r*3+2]*slotG[pi][2]);
    const u=slotIdx.get(gm.join());
    for(let i=0;i<3;i++){
      const w=[0,1,2].map(r=>M[r*3+i]*slotS[pi][i]);
      p[(pi-8)*3+i]=(u-8)*3+w.findIndex(x=>x!==0);
    }
  }
  return p;
};
const TARGET=ROT.map(permOfRot);
// ===== 外側24個：シスルスウェイト法（180°も1手）=====
// 許す90°回転を段階的に減らした部分群の列 G0 ⊃ G1 ⊃ … ⊃ G4（全部180°のみ）⊃ {e} をたどる。
// 各段では、その段で使える手だけで、剰余類空間を幅優先探索した表（または両側探索）を使って最短手で次の部分群へ下りる。
const TW=(()=>{
  const N=24;
  const comp=(a,b)=>{const r=new Uint8Array(N);for(let i=0;i<N;i++)r[i]=a[b[i]];return r;};
  const inv=a=>{const r=new Uint8Array(N);for(let i=0;i<N;i++)r[a[i]]=i;return r;};
  const isId=a=>{for(let i=0;i<N;i++)if(a[i]!==i)return false;return true;};
  const ID=()=>Uint8Array.from({length:N},(_,i)=>i);
  // 12種類の手（軸6×{先端以外の12個, 先端4個}）。外側の駒の位置の置換（+90°）。型番号 t = 軸*2 + (先端なら1)
  const T=[];
  for(let ai=0;ai<6;ai++)for(const k of[0,2]){const sp=outerMove(ai,k,1),p=new Uint8Array(N);for(let i=0;i<N;i++)p[i]=(sp[i*3]/3)|0;T.push(p);}
  // 段ごとに「90°を許す型」。最後は全部180°のみ
  const CH=[[0,1,2,3,4,5,6,7,8,9,10,11],[0,1,5],[0,1],[0],[]];
  const moves=S=>{const v=[];for(let t=0;t<12;t++){if(S.includes(t)){v.push({p:T[t],t,di:0});v.push({p:inv(T[t]),t,di:1});}v.push({p:comp(T[t],T[t]),t,di:2});}return v;};
  const MV=CH.map(moves);
  const hash=a=>{let h1=2166136261,h2=5381;for(let i=0;i<N;i++){h1=Math.imul(h1^a[i],16777619);h2=Math.imul(h2^(a[i]+31),2246822519)^(h2>>>13);}return (h1>>>0)*2097152+((h2>>>0)&2097151);};
  // ---- 置換群の基底と強生成系（Schreier-Sims）：剰余類 g·H の正準な代表元を求めるのに使う ----
  function BSGS(gens){
    const L=[];
    const rebuild=l=>{
      l.in=new Uint8Array(N);l.orb=[l.b];l.in[l.b]=1;l.u=[];l.ui=[];l.u[l.b]=ID();l.ui[l.b]=ID();
      for(let q=0;q<l.orb.length;q++){const x=l.orb[q];
        for(const s of l.S){const y=s[x];if(!l.in[y]){l.in[y]=1;l.u[y]=comp(s,l.u[x]);l.ui[y]=inv(l.u[y]);l.orb.push(y);}}}
    };
    const sift=(h,from)=>{
      for(let i=from;i<L.length;i++){const y=h[L[i].b];if(!L[i].in[y])return [i,h];h=comp(L[i].ui[y],h);}
      return [L.length,h];
    };
    const addGen=(h,upto)=>{
      if(upto===L.length){let b=0;while(h[b]===b)b++;L.push({b,S:[]});}
      for(let j=0;j<=upto;j++){L[j].S.push(h);rebuild(L[j]);}
    };
    for(const g of gens){const [lv,h]=sift(g,0);if(lv===L.length&&isId(h))continue;addGen(h,lv);}
    let i=L.length-1;
    while(i>=0){
      let bad=false;
      for(const y of L[i].orb.slice()){
        for(const s of L[i].S.slice()){
          const sg=comp(L[i].ui[s[y]],comp(s,L[i].u[y]));
          if(isId(sg))continue;
          const [lv,h]=sift(sg,i+1);
          if(lv===L.length&&isId(h))continue;
          addGen(h,lv);bad=true;i=Math.min(lv,L.length-1);break;
        }
        if(bad)break;
      }
      if(!bad)i--;
    }
    // 軌道・横断集合を平坦な配列にして高速化
    const lv=L.map(l=>({orb:Int8Array.from(l.orb),u:l.orb.map(y=>l.u[y]),ys:l.orb}));
    const A=new Uint8Array(N),B=new Uint8Array(N);
    return {
      key(g){ // g·H の正準代表元 g∘h*（辞書順最小の基底像）のハッシュ
        let cur=A,nxt=B;for(let i=0;i<N;i++)cur[i]=g[i];
        for(const l of lv){
          let best=255,bi=0;const o=l.orb;
          for(let q=0;q<o.length;q++){const v=cur[o[q]];if(v<best){best=v;bi=q;}}
          const u=l.u[bi];
          for(let i=0;i<N;i++)nxt[i]=cur[u[i]];
          const t=cur;cur=nxt;nxt=t;
        }
        return hash(cur);
      }
    };
  }
  const gensOf=S=>{const v=[];for(let t=0;t<12;t++){if(S.includes(t))v.push(T[t]);v.push(comp(T[t],T[t]));}return v;};
  // ---- 第0段：H1 の軌道（8個の駒の集合）が占める位置の24ビットマスクが剰余類の座標 ----
  let D0=null,dist0=null,maskTab=null,mask0=0;
  const orbitsOf=gens=>{
    const par=Array.from({length:N},(_,i)=>i),f=x=>{while(par[x]!==x){par[x]=par[par[x]];x=par[x];}return x;};
    for(const g of gens)for(let i=0;i<N;i++){const a=f(i),b=f(g[i]);if(a!==b)par[a]=b;}
    const m=new Map();for(let i=0;i<N;i++){const r=f(i);if(!m.has(r))m.set(r,[]);m.get(r).push(i);}
    return [...m.values()];
  };
  const maskOf=g=>{let m=0;for(const p of D0)m|=1<<g[p];return m>>>0;};
  const applyMask=(mi,m)=>{const t=maskTab[mi];return (t[m&255]|t[256+((m>>8)&255)]|t[512+((m>>16)&255)])>>>0;};
  function build0(){
    D0=orbitsOf(gensOf(CH[1])).find(o=>o.length===8);
    mask0=maskOf(ID());
    maskTab=MV[0].map(m=>{const t=new Int32Array(768);
      for(let b=0;b<3;b++)for(let v=0;v<256;v++){let r=0;for(let i=0;i<8;i++)if(v>>i&1)r|=1<<m.p[b*8+i];t[b*256+v]=r;}return t;});
    dist0=new Uint8Array(1<<24).fill(255);
    const q=new Int32Array(800000);let h=0,tl=0;q[tl++]=mask0;dist0[mask0]=0;
    const nm=MV[0].length;
    while(h<tl){const m=q[h++],d=dist0[m]+1;
      for(let mi=0;mi<nm;mi++){const x=applyMask(mi,m);if(dist0[x]===255){dist0[x]=d;q[tl++]=x;}}}
  }
  // ---- 第1〜3段：BSGS による正準キーで剰余類空間を幅優先探索して表を作る ----
  const ST=[null,null,null,null];
  function buildSt(j){
    const H=BSGS(gensOf(CH[j+1])),mv=MV[j],D=new Map();
    const id=ID();D.set(H.key(id),0);
    let fr=[id],d=0;
    while(fr.length){
      const nx=[];
      for(const g of fr)for(const m of mv){
        const g2=comp(m.p,g),k=H.key(g2);
        if(!D.has(k)){D.set(k,d+1);nx.push(g2);}
      }
      d++;fr=nx;
    }
    ST[j]={H,D};
  }
  // ---- 第4段：全部180°のみの群の中を、両側探索（表は6手まで、探索は5手まで）----
  let tab4=null;
  function build4(){
    tab4=new Map();const mv=MV[4],id=ID();tab4.set(hash(id),0);
    let fr=[id];
    for(let d=0;d<6;d++){
      const nx=[];
      for(const g of fr)for(const m of mv){const g2=comp(m.p,g),k=hash(g2);if(!tab4.has(k)){tab4.set(k,d+1);nx.push(g2);}}
      fr=nx;
    }
  }
  const ready=()=>dist0&&ST[0]&&ST[1]&&ST[2]&&tab4;
  const steps=[()=>build0(),()=>buildSt(1),()=>buildSt(2),()=>buildSt(3),()=>build4()];
  let stepIdx=0;
  function ensure(){while(stepIdx<steps.length){steps[stepIdx++]();}}
  function buildNext(){if(stepIdx<steps.length){steps[stepIdx++]();return true;}return false;}
  // ---- 実行 ----
  function run(g0){
    ensure();
    let g=Uint8Array.from(g0);const out=[];
    // 第0段
    let m=maskOf(g),d=dist0[m];
    while(d>0){
      let ok=false;
      for(let mi=0;mi<MV[0].length;mi++){const x=applyMask(mi,m);if(dist0[x]===d-1){m=x;g=comp(MV[0][mi].p,g);out.push(MV[0][mi]);d--;ok=true;break;}}
      if(!ok)throw new Error('tw0');
    }
    // 第1〜3段
    for(let j=1;j<=3;j++){
      const {H,D}=ST[j];const mv=MV[j];
      let dd=D.get(H.key(g));
      while(dd>0){
        let ok=false;
        for(const mo of mv){const g2=comp(mo.p,g);if(D.get(H.key(g2))===dd-1){g=g2;out.push(mo);dd--;ok=true;break;}}
        if(!ok)throw new Error('tw'+j);
      }
    }
    // 第4段（Gh の中）
    const mv=MV[4];
    const down=(gg,dd)=>{
      while(dd>0){
        let ok=false;
        for(const mo of mv){const g2=comp(mo.p,gg);if(tab4.get(hash(g2))===dd-1){gg=g2;out.push(mo);dd--;ok=true;break;}}
        if(!ok)throw new Error('tw4');
      }
      return gg;
    };
    const t0=tab4.get(hash(g));
    if(t0!==undefined){g=down(g,t0);}
    else{
      // 探索側：4手までのノードを保持し、5手目の子は保持せずに表と照合
      const nodes=[{g,par:-1,mo:null,d:0}];let lvStart=0,lvEnd=1;
      const seen=new Set([hash(g)]);
      let best=1e9,bestNode=-1,bestMo=null,bestT=0;
      for(let d=0;d<5;d++){
        const s=lvStart,e=lvEnd;
        for(let ni=s;ni<e;ni++){
          for(const mo of mv){
            const g2=comp(mo.p,nodes[ni].g),k=hash(g2);
            const t=tab4.get(k);
            if(t!==undefined&&d+1+t<best){best=d+1+t;bestNode=ni;bestMo=mo;bestT=t;}
            if(d<4&&!seen.has(k)){seen.add(k);nodes.push({g:g2,par:ni,mo,d:d+1});}
          }
        }
        lvStart=e;lvEnd=nodes.length;
      }
      if(bestNode<0)throw new Error('tw4 none');
      const path=[];for(let ni=bestNode;nodes[ni].par>=0;ni=nodes[ni].par)path.push(nodes[ni].mo);
      path.reverse();
      let gg=g;for(const mo of path){gg=comp(mo.p,gg);out.push(mo);}
      gg=comp(bestMo.p,gg);out.push(bestMo);
      g=down(gg,bestT);
    }
    if(!isId(g))throw new Error('tw end');
    return out.map(mo=>({t:mo.t,di:mo.di}));
  }
  return {run,ensure,buildNext,ready,comp,inv,T};
})();

// 外側のステッカー置換 perm（元→現在）と、目標の向き R（全体を回した24通りのひとつ）から、外側を揃える手順（GM の id）を返す
const RTP=TARGET.map(tg=>{const p=new Uint8Array(24);for(let i=0;i<24;i++)p[i]=(tg[i*3]/3)|0;return p;});
function outerWord(perm,R){
  const g0=new Uint8Array(24);for(let p=0;p<24;p++)g0[p]=(perm[p*3]/3)|0;
  const mv=TW.run(TW.comp(TW.inv(RTP[R]),g0));
  const M=ROT[R];
  return mv.map(({t,di})=>{
    const ai=t>>1,k=(t&1)?2:0,d=AXD[ai];
    const v=[0,1,2].map(r=>M[r*3]*d[0]+M[r*3+1]*d[1]+M[r*3+2]*d[2]);
    const a2=AXD.findIndex(x=>x[0]===v[0]&&x[1]===v[1]&&x[2]===v[2]);
    return (a2*3+k)*3+di;
  });
}
// 同じ範囲の連続した手は、向きの指数（mod 4）で合成して数え直す（逆手の相殺、90°×2＝180°、90°×3＝逆90° など）
const EXPO=[1,3,2],DIOF=[0,0,2,1];
function simplify(w){
  const s=[];
  for(const x of w){
    const g=(x/3)|0;
    if(s.length&&((s[s.length-1]/3)|0)===g){
      const e=(EXPO[s[s.length-1]%3]+EXPO[x%3])&3;s.pop();
      if(e)s.push(g*3+DIOF[e]);
    }else s.push(x);
  }
  return s;
}
// 回転 from → to にする、軸まわり回転（90°・−90°・180°を各1手）の最短列
const WHOLE=[];
(function(){
  for(let a=0;a<ROT.length;a++){
    const dist=new Array(24).fill(-1),prev=new Array(24).fill(null);dist[a]=0;const q=[a];
    for(let qi=0;qi<q.length;qi++){
      const r=q[qi];
      for(const ai of[0,2,4])for(const dir of DIRS){
        const n=MUL[qr(ai,dir)][r];
        if(dist[n]<0){dist[n]=dist[r]+1;prev[n]=[r,ai,dir];q.push(n);}
      }
    }
    WHOLE.push({dist,prev});
  }
})();
function wholeTurns(from,to){
  const {prev}=WHOLE[from],seq=[];let r=to;
  while(r!==from){const [p,ai,dir]=prev[r];seq.unshift([ai,dir]);r=p;}
  return seq;
}
function solve(st,onlyR){
  const cands=[];
  for(let R=0;R<24;R++){
    if(onlyR!==undefined&&R!==onlyR)continue;
    cands.push({R,w:simplify(outerWord(st.perm,R))});
  }
  cands.sort((a,b)=>a.w.length-b.w.length);
  let best=null;
  for(const c of cands){
    if(best&&c.w.length>=best.total.length)break;
    let ins=Uint8Array.from(st.inner);
    for(const id of c.w){const m=GM[id];if(m.k===0)ins=innerTurn(ins,m.ai,m.dir);}
    const isol=innerSolution(ins);if(!isol)throw new Error('inner unsolvable');
    const mv=[];
    for(const [ai,dir] of isol){ins=innerTurn(ins,ai,dir);mv.push((ai*3+1)*3+DI(dir));}
    // 内側全体を R まで回す（軸 a まわり：＋側と−側を同じ向きに）
    for(const [ai,dir] of wholeTurns(ins[0],c.R)){
      mv.push((ai*3+1)*3+DI(dir));
      mv.push(((ai+1)*3+1)*3+DI(invDir(dir)));
    }
    const total=simplify(c.w.concat(mv));
    if(!best||total.length<best.total.length)best={total};
  }
  return best.total;
}
return {solve,GM,DI,invDir,slotIdx,slotG,slotS,ROT,ROTIDX,MUL,IDENT,TARGET,compO,invO,isIdO,qr,wordFor,toGM,simplify,wholeTurns,outerWord,TW,warm:()=>{if(!TAB)buildTab();},warmStep:()=>{if(!TAB){buildTab();return true;}return TW.buildNext();}};
})();

export const level1Solver = SOLVER;

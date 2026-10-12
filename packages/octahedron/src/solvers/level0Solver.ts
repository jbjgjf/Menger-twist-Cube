// @ts-nocheck
/*
 * Ported verbatim from the standalone page "八面体パズル Level 0.html" (八面体パズル).
 * The algorithm below is the original code, unchanged; only the module
 * wrapper (this header and the export at the end) was added. Type checking is
 * off so the original text can stay byte-for-byte. The typed API lives in
 * ../solve.ts.
 */
// The page's solver reads two globals from its scene code: the axis list `AX`
// (only `d` is used) and the solved centroids `homes` of the 8 pieces, in the
// order the page creates them. Both are reproduced here as plain data.
const AX=[{d:[1,0,0]},{d:[-1,0,0]},{d:[0,1,0]},{d:[0,-1,0]},{d:[0,0,1]},{d:[0,0,-1]}];
const homes=[];
for(const sx of[1,-1])for(const sy of[1,-1])for(const sz of[1,-1])homes.push({x:sx,y:sy,z:sz});

// ---- ソルバー（Level 0）----
// 状態＝8ピースそれぞれの回転（八面体群24通りのうちの番号）。全体の回転は同一視し、
// 手は「90°・−90°・180°」を各1手として数える。「揃った状態から6手」と「現在の状態から5手」の幅優先探索を突き合わせて最短手（最大11手）を求める。
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
const HV=homes.map(v=>[v.x,v.y,v.z]);
const SIGN=new Int8Array(24*24);   // 回転rのときピースiが軸aの正側にあるか
for(let r=0;r<24;r++)for(let i=0;i<8;i++)for(let a=0;a<3;a++){
  let s=0;for(let j=0;j<3;j++)s+=ROT[r][a*3+j]*HV[i][j];
  SIGN[r*24+i*3+a]=s>0?1:0;
}
const Q=[[1,0,0,0,0,-1,0,1,0],[0,0,1,0,1,0,-1,0,0],[0,-1,0,1,0,0,0,0,1]];
const MVROT=[];   // 手番号 m = 軸a*3 + 向き番号（0:反時計回り90° 1:時計回り90° 2:180°）。各軸の＋側の頂点を回す
for(let a=0;a<3;a++){const q=ROTIDX.get(Q[a].join());MVROT.push(q,ROTIDX.get(tp(Q[a]).join()),MUL[q][q]);}
const applyMove=(st,m)=>{
  const a=(m/3)|0,M=MVROT[m],o=new Uint8Array(8);
  for(let i=0;i<8;i++){const r=st[i];o[i]=SIGN[r*24+i*3+a]?MUL[M][r]:r;}
  return o;
};
const keyOf=st=>{const iv=INV[st[0]];let k='';for(let i=1;i<8;i++)k+=String.fromCharCode(65+MUL[iv][st[i]]);return k;};
const IDENT=ROTIDX.get('1,0,0,0,1,0,0,0,1');
let TAB=null;
function buildTab(){
  const root=new Uint8Array(8).fill(IDENT),e0={st:root,path:[]};
  TAB=new Map([[keyOf(root),e0]]);
  let fr=[e0];
  for(let d=0;d<6;d++){
    const nx=[];
    for(const n of fr)for(let m=0;m<9;m++){
      const s=applyMove(n.st,m),k=keyOf(s);
      if(TAB.has(k))continue;
      const e={st:s,path:n.path.concat(m)};TAB.set(k,e);nx.push(e);
    }
    fr=nx;
  }
}
// 戻り値：[[頂点番号, 向き(+1=反時計回り90°, −1=時計回り90°, 2=180°)], …]（最短手）。向きはその頂点から見た向き
function findSolution(st){
  if(!TAB)buildTab();
  let best=null;
  const chk=n=>{const t=TAB.get(keyOf(n.st));if(t){const len=n.path.length+t.path.length;if(!best||len<best.len)best={len,f:n,t};}};
  const root={st,path:[]};chk(root);
  const seen=new Set([keyOf(st)]);let fr=[root];
  for(let d=0;d<5&&!(best&&best.len<=d+1);d++){
    const nx=[];
    for(const n of fr)for(let m=0;m<9;m++){
      const s=applyMove(n.st,m),k=keyOf(s);
      if(seen.has(k))continue;seen.add(k);
      const e={st:s,path:n.path.concat(m)};chk(e);nx.push(e);
    }
    fr=nx;
  }
  if(!best)return null;
  const seq=best.f.path.map(m=>[((m/3)|0)*2,[1,-1,2][m%3]]);
  // 揃った状態から作った表の盤面Yと、現在側の盤面Xは X = G·Y の関係。Yでの逆手順を G で読み替える
  const G=mm(ROT[best.f.st[0]],tp(ROT[best.t.st[0]]));
  for(let j=best.t.path.length-1;j>=0;j--){
    const m=best.t.path[j],a=(m/3)|0,dir=[-1,1,2][m%3];   // 表側の手の逆手
    const d=[G[a],G[3+a],G[6+a]];
    const ai=AX.findIndex(x=>x.d[0]===d[0]&&x.d[1]===d[1]&&x.d[2]===d[2]);
    seq.push([ai,dir]);
  }
  return seq;
}

export const level0Solver = { findSolution, ROT, ROTIDX };

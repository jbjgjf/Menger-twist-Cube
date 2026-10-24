/** Rational unit-complex SAT witness. No floating-point overlap inequality is
 * trusted: theta only proposes t=tan(theta/2), then all four separating-axis
 * inequalities are checked with BigInt after clearing denominators. */
export function exactPairOverlap(moving:readonly number[],stationary:readonly number[],theta:number,turnAngle:number=theta<0?-180:180):boolean{
 const abs=(x:bigint)=>x<0n?-x:x;
 const x=BigInt(2*moving[0]!),y=BigInt(2*moving[1]!),bx=BigInt(2*stationary[0]!),by=BigInt(2*stationary[1]!);
 for(const bits of [20,30,40]){
  const d=1n<<BigInt(bits),approx=Math.round(Math.tan(theta/2)*Number(d));if(!Number.isFinite(approx))continue;
  const n=BigInt(approx);
  // Check the witness lies on the requested swept arc without trigonometry.
  if(n===0n||(n>0n)!==(turnAngle>0)||(Math.abs(turnAngle)===90&&abs(n)>d))continue;
  const D=d*d+n*n,C=d*d-n*n,S=2n*d*n;
  const X=bx*D-C*x+S*y,Y=by*D-S*x-C*y,R=D+abs(C)+abs(S);
  if(abs(X)<R&&abs(Y)<R&&abs(X*C+Y*S)<R*D&&abs(-X*S+Y*C)<R*D)return true;
 }
 return false;
}

/** Authored image poses of one ear. Runtime never deforms an ear texture:
 * it selects one aligned drawing, with an anchored root already in the atlas. */
export const EAR_TURN_ASSET='teach-avatars/star-fox/ear-turn-v0.1/poses.png';
export const EAR_TURN={columns:4,frames:12,width:256,height:320,x:64,y:48} as const;
export function earTurnFrame(value:number):number {
  const amount=Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
  return Math.round(amount*(EAR_TURN.frames-1));
}
/** The same scalar drives the image-pose and old mesh comparison. */
export function earTurnDemoValue(timeMs:number):number {
  const t=Math.max(0,Number.isFinite(timeMs)?timeMs:0)%4400;
  const smooth=(x:number)=>x*x*(3-2*x);
  if(t<500)return 0;
  if(t<1800)return smooth((t-500)/1300);
  if(t<2400)return 1;
  if(t<3700)return 1-smooth((t-2400)/1300);
  return 0;
}
export function drawEarTurn(ctx:CanvasRenderingContext2D,atlas:CanvasImageSource,value:number){
  const frame=earTurnFrame(value),{columns,width,height,x,y}=EAR_TURN;
  ctx.drawImage(atlas,(frame%columns)*width,Math.floor(frame/columns)*height,width,height,x,y,width,height);
}

/** Whole-ear drawings behind a hair-only occluder. No fixed original-ear
 * collar: that retained white inner fur when the pinna turned to its back. */
export const EAR_TURN_ASSET='teach-avatars/star-fox/ear-turn-v0.2/poses.png';
export const EAR_TURN_FOREGROUND_ASSET='teach-avatars/star-fox/ear-turn-v0.2/foreground.png';
/** Trace the actual hair silhouette, not a diagonal through the inner ear.
 * The small curl at y260 has a hooked return and must not include its gap. */
export const EAR_TURN_HAIR_PATH='M340 145 L310 145 C280 157 260 179 242 193 C222 210 211 229 202 246 C196 257 184 266 174 260 C180 265 190 266 198 261 C188 279 179 295 175 312 C169 331 161 341 151 345 L340 345 Z';
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

type Point=[number,number];
const clamp=(n:number,min=-1,max=1)=>Number.isFinite(n)?Math.max(min,Math.min(max,n)):0;
const smooth=(n:number)=>{n=clamp(n,0,1);return n*n*(3-2*n);};

export interface EarLook {
  start:number;
  turn:number;
  hold:number;
  return:number;
  angle:number;
}
export interface PaintedMotionProfile {
  ears:readonly[{root:Point;tip:Point;width:number},{root:Point;tip:Point;width:number}];
  /** Authored small-angle ear-plane projection, not measured animal anatomy. */
  restYaw:number;
  looks:readonly[EarLook,EarLook];
  period:number;
  earGain:number;
  hairGain:number;
  phase:number;
}
export const FOX_MOTION:PaintedMotionProfile={ears:[
  {root:[114,35],tip:[36,-105],width:118},
  {root:[405,35],tip:[475,-105],width:118},
],restYaw:.25,looks:[
  {start:1.2,turn:.22,hold:1.1,return:.65,angle:.5},
  {start:7.8,turn:.18,hold:.75,return:.5,angle:.38},
],period:16,earGain:1,hairGain:1,phase:0};
export interface PaintedSecondaryPose { leftEar:number;rightEar:number;hair:number;forelock:number; }
const targetPose=(pitch:number,yaw:number):PaintedSecondaryPose=>{
  const turn=clamp(yaw/.45),nod=clamp(pitch/.35);
  // Ears actively orient relative to the head; they do not flop with its roll.
  return {leftEar:(turn*.2+nod*.025)||0,rightEar:(-turn*.2+nod*.025)||0,hair:0,forelock:0};
};
/** Turn towards one direction, listen without moving, then return without a
 * sign reversal or spring overshoot. Durations are authored animation choices.
 */
export function paintedEarLook(local:number,look:EarLook):number {
  if(local<=look.start)return 0;
  const time=local-look.start;
  if(time<look.turn)return look.angle*smooth(time/look.turn);
  if(time<look.turn+look.hold)return look.angle;
  if(time<look.turn+look.hold+look.return)return look.angle*(1-smooth((time-look.turn-look.hold)/look.return));
  return 0;
}
/** Different ear shapes get their own look/hold/return timing, with long quiet
 * intervals. No detected or recorded environmental sound is implied.
 */
export function paintedIdlePose(timeMs:number,profile:PaintedMotionProfile=FOX_MOTION):PaintedSecondaryPose {
  const time=Math.max(0,Number.isFinite(timeMs)?timeMs:0)/1000+profile.phase;
  const local=time%profile.period;
  const leftEar=paintedEarLook(local,profile.looks[0]),rightEar=paintedEarLook(local,profile.looks[1]);
  // A tiny, occasional settling of the painted fringe. No continuous wind wave.
  const drift=smooth((local-11)/.9)*(1-smooth((local-12.1)/1.4));
  return {leftEar,rightEar,hair:drift*.9,forelock:drift*.45};
}

/** Ears use monotone active orientation. Only hair uses an underdamped spring.
 * Repeated timestamps freeze; rewinds/long interruptions reset. Untimed stills
 * use equilibrium, independently of the previous draw call.
 */
export function createPaintedSecondaryMotion(){
  let previous:number|undefined,position:PaintedSecondaryPose|undefined;
  const velocity={hair:0,forelock:0};
  return {sample(pitch:number,yaw:number,roll:number,timeMs?:number):PaintedSecondaryPose {
    const target=targetPose(pitch,yaw),turn=clamp(yaw/.45),tilt=clamp(roll/.1);
    target.hair=(-turn*4-tilt*5)||0;target.forelock=(-turn*2-tilt*3)||0;
    const time=Number.isFinite(timeMs)?timeMs:undefined;
    if(time===undefined||previous===undefined||!position||time<previous||time-previous>250){
      previous=time;position={...target};velocity.hair=0;velocity.forelock=0;return {...position};
    }
    const dt=(time-previous)/1000;previous=time;
    const follow=1-Math.exp(-dt/.065);
    position.leftEar+=(target.leftEar-position.leftEar)*follow;
    position.rightEar+=(target.rightEar-position.rightEar)*follow;
    const steps=Math.ceil(dt/(1/120));
    for(let step=0;step<steps;step++)for(const key of ['hair','forelock']as const){
      const h=dt/steps,omega=12;
      velocity[key]+=((target[key]-position[key])*omega*omega-2*.72*omega*velocity[key])*h;
      position[key]+=velocity[key]*h;
      position[key]=clamp(position[key],-12,12);
    }
    return {...position};
  }};
}

/** Orthographic projection of one tilted ear plane. Interior points share the
 * same affine map: it foreshortens the pinna instead of curling its tip. The
 * unseen back surface is deliberately not fabricated for these small turns.
 */
export function paintedEarProjection(point:Point,root:Point,angle:number,restYaw:number,side:-1|1):Point {
  const yaw=clamp(angle,-.2,.65),rest=clamp(restYaw,0,.5),x=point[0]-root[0],y=point[1]-root[1];
  const width=Math.cos(rest+yaw)/Math.cos(rest);
  const lean=side*Math.sin(yaw)*.1;
  return [root[0]+x*width-y*lean,point[1]+y*(Math.cos(yaw*.12)-1)];
}

export function paintedSecondaryPoint([x,y]:Point,pose:PaintedSecondaryPose,profile:PaintedMotionProfile=FOX_MOTION):Point {
  let dx=0,dy=0;
  for(const[index,ear]of profile.ears.entries()){
    const vx=ear.tip[0]-ear.root[0],vy=ear.tip[1]-ear.root[1],length=Math.hypot(vx,vy);
    const px=x-ear.root[0],py=y-ear.root[1];
    const along=(px*vx+py*vy)/(length*length),across=Math.abs(px*vy-py*vx)/length;
    const side: -1|1=ear.root[0]<256?-1:1;
    const half=side===-1?1-smooth((x-205)/45):smooth((x-267)/45);
    // Most of the visible pinna receives one projection. Feather only its
    // attachment and the surrounding paper, rather than bending every row.
    const weight=smooth(along/.23)*(1-smooth((along-1.2)/1.1))*(1-smooth((across/ear.width-.6)/.6))*half*(1-smooth((y-130)/30));
    const angle=clamp((index===0?pose.leftEar:pose.rightEar)*profile.earGain,-.2,.65);
    const projected=paintedEarProjection([x,y],ear.root,angle,profile.restYaw,side);
    dx+=(projected[0]-x)*weight;dy+=(projected[1]-y)*weight;
  }
  const sideHair=smooth((Math.abs(x-256)-145)/65)*smooth((y+35)/90)*(1-smooth((y-305)/45));
  const forelock=(1-smooth(Math.abs(x-256)/150))*smooth((y+90)/70)*(1-smooth((y-100)/45));
  dx+=(sideHair*pose.hair+forelock*pose.forelock)*profile.hairGain;
  dy+=sideHair*pose.hair*.15*profile.hairGain;
  return [x+dx,y+dy];
}

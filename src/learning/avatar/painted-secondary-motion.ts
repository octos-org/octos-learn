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
/** leftEar/rightEar: ear-plane turn (positive = more edge-on, splaying outward).
 * leftTilt/rightTilt: in-plane trailing of the ear about its root (positive = tip to the right).
 * hair/forelock/hairLift: painted-hair offsets in face pixels relative to the head.
 */
export interface PaintedSecondaryPose { leftEar:number;rightEar:number;leftTilt:number;rightTilt:number;hair:number;forelock:number;hairLift:number; }
export const restingPose=():PaintedSecondaryPose=>({leftEar:0,rightEar:0,leftTilt:0,rightTilt:0,hair:0,forelock:0,hairLift:0});
/** Head displacement the painter applies (paintedHeadPoint), so hair inertia acts on the same motion. */
export const HEAD_SHIFT={yaw:24,pitch:18} as const;
const targetPose=(pitch:number,yaw:number,roll:number):PaintedSecondaryPose=>{
  const turn=clamp(yaw/.45),nod=clamp(pitch/.35),tilt=clamp(roll/.1);
  // Turning the head carries the ear on that side towards the back (more
  // edge-on) and brings the other one round to face the viewer.
  return {leftEar:(-turn*.32+nod*.06)||0,rightEar:(turn*.32+nod*.06)||0,leftTilt:0,rightTilt:0,
    // Hair moves with the head. A head tilt swings the strand ends sideways
    // with the skull; gravity keeps them hanging a little nearer vertical.
    hair:(tilt*4)||0,forelock:(tilt*2)||0,hairLift:0};
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
  return {...restingPose(),leftEar,rightEar,hair:drift*.9,forelock:drift*.45};
}

/** Ears and hair follow the head with their own timing:
 * - ear orientation eases to its target without overshoot;
 * - ears trail head turns/tilts in the image plane through a first-order lag,
 *   so they catch up monotonically (no spring flapping);
 * - hair is a damped spring in world space that the head pulls along, so it
 *   lags when the head moves and settles with one small swing.
 * Repeated timestamps freeze; rewinds/long interruptions reset. Untimed stills
 * use equilibrium, independently of the previous draw call.
 */
export function createPaintedSecondaryMotion(){
  let previous:number|undefined,position:PaintedSecondaryPose|undefined,moving=false;
  const lag={pitch:0,yaw:0,roll:0},hair={x:0,y:0,vx:0,vy:0,fx:0,fvx:0};
  return {sample(pitch:number,yaw:number,roll:number,timeMs?:number):PaintedSecondaryPose {
    pitch=clamp(pitch,-.35,.35);yaw=clamp(yaw,-.45,.45);roll=clamp(roll,-.1,.1);
    const target=targetPose(pitch,yaw,roll),headX=yaw*HEAD_SHIFT.yaw,headY=pitch*HEAD_SHIFT.pitch;
    const time=Number.isFinite(timeMs)?timeMs:undefined;
    if(time===undefined||previous===undefined||!position||time<previous||time-previous>250){
      previous=time;position={...target};moving=false;Object.assign(lag,{pitch,yaw,roll});
      Object.assign(hair,{x:headX+target.hair,y:headY,vx:0,vy:0,fx:headX+target.forelock,fvx:0});
      return {...position};
    }
    const dt=(time-previous)/1000;previous=time;
    const follow=1-Math.exp(-dt/.065),trail=1-Math.exp(-dt/.16);
    position.leftEar+=(target.leftEar-position.leftEar)*follow;
    position.rightEar+=(target.rightEar-position.rightEar)*follow;
    lag.pitch+=(pitch-lag.pitch)*trail;lag.yaw+=(yaw-lag.yaw)*trail;lag.roll+=(roll-lag.roll)*trail;
    // The ear tips stay behind while the head moves: a head moving right leaves them leaning left.
    const behind=clamp(-(yaw-lag.yaw)*.55-(roll-lag.roll)*.9,-.2,.2);
    position.leftTilt=behind;position.rightTilt=behind;
    const nodLag=clamp((pitch-lag.pitch)*.5,-.12,.12);
    const steps=Math.ceil(dt/(1/120)),h=dt/steps,omega=8,damping=.58;
    for(let step=0;step<steps;step++){
      hair.vx+=((headX+target.hair-hair.x)*omega*omega-2*damping*omega*hair.vx)*h;hair.x+=hair.vx*h;
      hair.vy+=((headY-hair.y)*omega*omega-2*damping*omega*hair.vy)*h;hair.y+=hair.vy*h;
      const fo=omega*1.25;hair.fvx+=((headX+target.forelock-hair.fx)*fo*fo-2*damping*fo*hair.fvx)*h;hair.fx+=hair.fvx*h;
    }
    position.hair=clamp(hair.x-headX,-14,14);position.forelock=clamp(hair.fx-headX,-9,9);position.hairLift=clamp(hair.y-headY,-8,8);
    const result={...position};result.leftEar+=nodLag;result.rightEar+=nodLag;
    moving=Math.abs(position.leftTilt)>1e-3||Math.abs(nodLag)>1e-3||Math.abs(position.leftEar-target.leftEar)>1e-3||Math.abs(position.rightEar-target.rightEar)>1e-3
      ||Math.hypot(hair.vx,hair.vy,hair.fvx)>.05||Math.abs(position.hair-target.hair)>.05||Math.abs(position.forelock-target.forelock)>.05||Math.abs(position.hairLift)>.05;
    return result;
  },
  /** Ears or hair are still catching up with the head; keep drawing until they rest. */
  settling(){return moving;}};
}

/** Orthographic projection of one tilted ear plane. Interior points share the
 * same affine map: it foreshortens the pinna instead of curling its tip. The
 * unseen back surface is deliberately not fabricated for these small turns.
 */
export function paintedEarProjection(point:Point,root:Point,angle:number,restYaw:number,side:-1|1):Point {
  const yaw=clamp(angle,-.2,.65),rest=clamp(restYaw,0,.5),x=point[0]-root[0],y=point[1]-root[1];
  const width=Math.cos(rest+yaw)/Math.cos(rest);
  // Only an ear turning away leans its tip; one turning to face the viewer just opens up.
  const lean=side*Math.sin(Math.max(0,yaw))*.1;
  return [root[0]+x*width-y*lean,point[1]+y*(Math.cos(yaw*.12)-1)];
}

/** One ear's full transform: plane turn (foreshortening), the outward splay that
 * accompanies a turn towards the back, and in-plane trailing about the root.
 */
export function paintedEarTransform(point:Point,root:Point,angle:number,tilt:number,restYaw:number,side:-1|1,length=160):Point {
  const yaw=clamp(angle,-.2,.65),projected=paintedEarProjection(point,root,yaw,restYaw,side);
  // Capped by the ear's length, so a long rabbit ear swings its tip no further
  // than a short fox ear does and the blended attachment never folds.
  const limit=Math.min(.24,30/Math.max(1,length));
  const theta=clamp(side*Math.max(0,yaw)*.45+tilt,-limit,limit);
  if(theta===0)return projected;
  const x=projected[0]-root[0],y=projected[1]-root[1],cos=Math.cos(theta),sin=Math.sin(theta);
  return [root[0]+x*cos-y*sin,root[1]+x*sin+y*cos];
}

export function paintedSecondaryPoint([x,y]:Point,pose:PaintedSecondaryPose,profile:PaintedMotionProfile=FOX_MOTION):Point {
  let dx=0,dy=0,earHairExclusion=0;
  for(const[index,ear]of profile.ears.entries()){
    const vx=ear.tip[0]-ear.root[0],vy=ear.tip[1]-ear.root[1],length=Math.hypot(vx,vy);
    const px=x-ear.root[0],py=y-ear.root[1];
    const along=(px*vx+py*vy)/(length*length),across=Math.abs(px*vy-py*vx)/length;
    const side: -1|1=ear.root[0]<256?-1:1;
    const half=side===-1?1-smooth((x-205)/45):smooth((x-267)/45);
    // Hair motion must not drag the pinna or its mesh neighbours. Padding is
    // wider than one head-mesh cell, so interpolation cannot leak idle hair
    // drift back into an otherwise stationary ear (panda/cat in particular).
    earHairExclusion=Math.max(earHairExclusion,smooth((along+.15)/.2)*(1-smooth((along-1.5)/.5))*(1-smooth((across/ear.width-1)/.5))*half);
    // Most of the visible pinna receives one transform. Feather only its
    // attachment and the surrounding paper, rather than bending every row.
    const weight=smooth(along/.23)*(1-smooth((along-1.2)/1.1))*(1-smooth((across/ear.width-.6)/.6))*half*(1-smooth((y-130)/30));
    if(weight===0)continue;
    const angle=clamp((index===0?pose.leftEar:pose.rightEar)*profile.earGain,-.2,.65);
    const tilt=(index===0?pose.leftTilt:pose.rightTilt)*profile.earGain;
    const moved=paintedEarTransform([x,y],ear.root,angle,tilt,profile.restYaw,side,length);
    dx+=(moved[0]-x)*weight;dy+=(moved[1]-y)*weight;
  }
  const sideHair=smooth((Math.abs(x-256)-145)/65)*smooth((y+35)/90)*(1-smooth((y-305)/45));
  const forelock=(1-smooth(Math.abs(x-256)/150))*smooth((y+90)/70)*(1-smooth((y-100)/45));
  // Hair ends move most; the roots at the scalp stay with the head.
  const ends=smooth((y-20)/160);
  dx+=(sideHair*pose.hair*(.35+.65*ends)+forelock*pose.forelock)*profile.hairGain*(1-earHairExclusion);
  dy+=(sideHair*(pose.hair*.15+pose.hairLift*ends)+forelock*pose.hairLift*.5)*profile.hairGain*(1-earHairExclusion);
  return [x+dx,y+dy];
}

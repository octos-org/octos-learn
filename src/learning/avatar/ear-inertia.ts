/** Small passive follow-through only. A held head pose has zero ear offset. */
export const MAX_EAR_SWAY=.025; // 1.43 degrees; about 5px at a 200px ear tip.
export interface EarInertiaProfile {maxAngle:number;frequency:readonly[number,number];damping:number;gain:number}
export const FOX_EAR_INERTIA:EarInertiaProfile={maxAngle:MAX_EAR_SWAY,frequency:[18,17],damping:.7,gain:1};
/** Art-directed differences, not measured animal biomechanical constants. */
export const RABBIT_EAR_INERTIA:EarInertiaProfile={maxAngle:.07,frequency:[11.5,10.8],damping:.66,gain:1.55};
export const PANDA_EAR_INERTIA:EarInertiaProfile={maxAngle:.018,frequency:[22,21],damping:.82,gain:.75};
export const CAT_EAR_INERTIA:EarInertiaProfile={maxAngle:.032,frequency:[20,18.5],damping:.74,gain:1.05};
const clamp=(n:number,limit:number)=>Number.isFinite(n)?Math.max(-limit,Math.min(limit,n)):0;
export function createEarInertia(profile:EarInertiaProfile=FOX_EAR_INERTIA){
  let previous:number|undefined;
  const ears=[{x:0,v:0},{x:0,v:0}];
  let result={leftTilt:0,rightTilt:0},moving=false;
  return {
    sample(pitch:number,yaw:number,roll:number,timeMs?:number){
      pitch=clamp(pitch,.35);yaw=clamp(yaw,.45);roll=clamp(roll,.1);
      const drive=[(yaw*.11+roll*.75+pitch*.035)*profile.gain,(yaw*.11+roll*.75-pitch*.035)*profile.gain];
      const time=Number.isFinite(timeMs)?timeMs:undefined;
      if(time===undefined||previous===undefined||time<previous||time-previous>250){
        previous=time;ears.forEach((ear,i)=>{ear.x=drive[i];ear.v=0;});moving=false;
        result={leftTilt:0,rightTilt:0};return {...result};
      }
      if(time===previous)return {...result};
      const dt=(time-previous)/1000;previous=time;
      const steps=Math.ceil(dt*240),h=dt/steps;
      ears.forEach((ear,i)=>{
        const omega=profile.frequency[i];
        for(let step=0;step<steps;step++){
          ear.v+=((drive[i]-ear.x)*omega*omega-2*profile.damping*omega*ear.v)*h;ear.x+=ear.v*h;
        }
        if(Math.abs(ear.x-drive[i])<.00002&&Math.abs(ear.v)<.0003){ear.x=drive[i];ear.v=0;}
      });
      const sway=(n:number)=>profile.maxAngle*Math.tanh(n/profile.maxAngle);
      result={leftTilt:sway(ears[0].x-drive[0]),rightTilt:sway(ears[1].x-drive[1])};
      moving=ears.some((ear,i)=>ear.x!==drive[i]||ear.v!==0);return {...result};
    },
    settling(){return moving;},
  };
}

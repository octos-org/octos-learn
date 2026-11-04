/** Small passive follow-through only. A held head pose has zero ear offset. */
export const MAX_EAR_SWAY=.025; // 1.43 degrees; about 5px at a 200px ear tip.
const clamp=(n:number,limit:number)=>Number.isFinite(n)?Math.max(-limit,Math.min(limit,n)):0;
export function createEarInertia(){
  let previous:number|undefined;
  const ears=[{x:0,v:0},{x:0,v:0}];
  let result={leftTilt:0,rightTilt:0},moving=false;
  return {
    sample(pitch:number,yaw:number,roll:number,timeMs?:number){
      pitch=clamp(pitch,.35);yaw=clamp(yaw,.45);roll=clamp(roll,.1);
      const drive=[yaw*.11+roll*.75+pitch*.035,yaw*.11+roll*.75-pitch*.035];
      const time=Number.isFinite(timeMs)?timeMs:undefined;
      if(time===undefined||previous===undefined||time<previous||time-previous>250){
        previous=time;ears.forEach((ear,i)=>{ear.x=drive[i];ear.v=0;});moving=false;
        result={leftTilt:0,rightTilt:0};return {...result};
      }
      if(time===previous)return {...result};
      const dt=(time-previous)/1000;previous=time;
      const steps=Math.ceil(dt*240),h=dt/steps;
      ears.forEach((ear,i)=>{
        const omega=i===0?18:17;
        for(let step=0;step<steps;step++){
          ear.v+=((drive[i]-ear.x)*omega*omega-2*.7*omega*ear.v)*h;ear.x+=ear.v*h;
        }
        if(Math.abs(ear.x-drive[i])<.00002&&Math.abs(ear.v)<.0003){ear.x=drive[i];ear.v=0;}
      });
      const sway=(n:number)=>MAX_EAR_SWAY*Math.tanh(n/MAX_EAR_SWAY);
      result={leftTilt:sway(ears[0].x-drive[0]),rightTilt:sway(ears[1].x-drive[1])};
      moving=ears.some((ear,i)=>ear.x!==drive[i]||ear.v!==0);return {...result};
    },
    settling(){return moving;},
  };
}

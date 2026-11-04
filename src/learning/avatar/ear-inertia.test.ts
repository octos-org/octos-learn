import {expect,it} from 'vitest';
import {createEarInertia,MAX_EAR_SWAY} from './ear-inertia';
import {localEarSwayPoint,LOCAL_EAR_ATTACHMENT} from './painted-local-rig';
import {STAR_FOX_RIGHT_EAR} from './star-fox-parts';
import {PAINTED_CHARACTERS} from './painted-characters';
import {FOX_MOTION,paintedSecondaryPoint,restingPose} from './painted-secondary-motion';

it('has no autonomous motion at rest or at a held turned-head pose',()=>{
  for(const yaw of[0,.4,-.4]){const motion=createEarInertia();for(let t=0;t<=30000;t+=100){expect(motion.sample(0,yaw,0,t)).toEqual({leftTilt:0,rightTilt:0});expect(motion.settling()).toBe(false);}}
});
it('trails a rightward head turn, rebounds slightly and settles without holding a turn',()=>{
  const motion=createEarInertia();motion.sample(0,0,0,0);
  const first=motion.sample(0,.4,0,33);expect(first.leftTilt).toBeLessThan(0);expect(first.rightTilt).toBeLessThan(0);
  let rebound=false;for(let t=66;t<3000;t+=33){const p=motion.sample(0,.4,0,t);rebound||=p.leftTilt>0;for(const n of Object.values(p))expect(Math.abs(n)).toBeLessThanOrEqual(MAX_EAR_SWAY);}
  expect(rebound).toBe(true);expect(motion.sample(0,.4,0,3000)).toEqual({leftTilt:0,rightTilt:0});expect(motion.settling()).toBe(false);
});
it('resets after a seek, interruption or missing clock and freezes repeated timestamps',()=>{
  const m=createEarInertia();m.sample(0,0,0,0);const p=m.sample(0,.4,0,33);
  expect(m.sample(0,-.4,0,33)).toEqual(p);
  expect(m.sample(0,-.4,0,1000)).toEqual({leftTilt:0,rightTilt:0});
  expect(m.sample(0,.4,0,20)).toEqual({leftTilt:0,rightTilt:0});
  expect(m.sample(NaN,Infinity,-Infinity)).toEqual({leftTilt:0,rightTilt:0});
});
it('keeps the ear attachment fixed and preserves upper-pinna dimensions',()=>{
  const distance=(a:number[],b:number[])=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  for(const right of[false,true])for(const angle of[-MAX_EAR_SWAY,0,MAX_EAR_SWAY]){
    for(const point of right?STAR_FOX_RIGHT_EAR.attachment:LOCAL_EAR_ATTACHMENT)expect(localEarSwayPoint(point,angle,right)).toEqual(point);
    const a:[number,number]=right?[574,85]:[130,85],b:[number,number]=right?[584,120]:[120,120];
    expect(distance(localEarSwayPoint(a,angle,right),localEarSwayPoint(b,angle,right))).toBeCloseTo(distance(a,b),9);
    expect(distance(localEarSwayPoint(a,angle,right),a)).toBeLessThan(6);
  }
});
it('does not let idle hair deformation move any character ear or its adjacent mesh vertices',()=>{
  for(const character of PAINTED_CHARACTERS){const profile=character.rig?.motion??FOX_MOTION;
    for(const ear of profile.ears)for(const dx of[-24,0,24])for(const dy of[-24,0,24]){
      const p:[number,number]=[ear.root[0]*.2+ear.tip[0]*.8+dx,ear.root[1]*.2+ear.tip[1]*.8+dy];
      const q=paintedSecondaryPoint(p,{...restingPose(),hair:1,forelock:.5,hairLift:.5},profile);
      expect(q[0]).toBeCloseTo(p[0],10);expect(q[1]).toBeCloseTo(p[1],10);
    }
  }
});

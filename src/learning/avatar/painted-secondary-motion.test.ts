import{expect,it}from'vitest';
import{createPaintedSecondaryMotion,paintedIdlePose,paintedSecondaryPoint,paintedEarProjection,paintedEarLook,restingPose,FOX_MOTION}from'./painted-secondary-motion';

it('projects the pinna as a single plane, keeps its base fixed and foreshortens the opening',()=>{
  const root:[number,number]=[114,35];
  expect(paintedEarProjection(root,root,.5,.25,-1)).toEqual(root);
  const a=paintedEarProjection([50,-50],root,.5,.25,-1),b=paintedEarProjection([100,-50],root,.5,.25,-1);
  expect((b[0]-a[0])/50).toBeCloseTo(Math.cos(.75)/Math.cos(.25),10);
  expect(b[1]-a[1]).toBe(0);
  const p=paintedEarProjection([70,-90],root,.5,.25,-1),q=paintedEarProjection([90,-30],root,.5,.25,-1),middle=paintedEarProjection([80,-60],root,.5,.25,-1);
  expect(middle[0]).toBeCloseTo((p[0]+q[0])/2,10);expect(middle[1]).toBeCloseTo((p[1]+q[1])/2,10);
});

it('holds one listening direction and returns without reversal or rebound',()=>{
  const look=FOX_MOTION.looks[0];
  expect(paintedEarLook(look.start,look)).toBe(0);
  expect(paintedEarLook(look.start+look.turn+.1,look)).toBe(look.angle);
  expect(paintedEarLook(look.start+look.turn+look.hold-.1,look)).toBe(look.angle);
  let previous=look.angle;
  for(let t=0;t<=look.return+.5;t+=.01){
    const value=paintedEarLook(look.start+look.turn+look.hold+t,look);
    expect(value).toBeGreaterThanOrEqual(0);expect(value).toBeLessThanOrEqual(previous+1e-10);previous=value;
  }
  expect(previous).toBe(0);
});

it('leaves facial geometry and clothing in place during an independent ear look',()=>{
  const pose={...restingPose(),leftEar:.5};
  for(const point of [[198,210],[328,210],[261,248],[260,276],[256,420]]as Array<[number,number]>)expect(paintedSecondaryPoint(point,pose)).toEqual(point);
  const left=FOX_MOTION.ears[0].tip,right=FOX_MOTION.ears[1].tip;
  expect(paintedSecondaryPoint(right,pose)).toEqual(right);
  expect(Math.hypot(...paintedSecondaryPoint(left,pose).map((n,i)=>n-left[i]))).toBeGreaterThan(5);
});

it('turns the ear on the turning side edge-on and opens the other one',()=>{
  const still=createPaintedSecondaryMotion().sample(0,.4,0);
  expect(still.rightEar).toBeGreaterThan(.2);expect(still.leftEar).toBeLessThan(-.2);
  const left=FOX_MOTION.ears[0],right=FOX_MOTION.ears[1],width=(ear:typeof left,pose:typeof still)=>{
    const a=paintedSecondaryPoint([ear.root[0]-30,ear.root[1]-60],pose),b=paintedSecondaryPoint([ear.root[0]+30,ear.root[1]-60],pose);return b[0]-a[0];};
  expect(width(right,still)).toBeLessThan(width(right,restingPose())*.95);
  expect(width(left,still)).toBeGreaterThan(width(left,restingPose()));
});

it('lets ears trail a head turn and catch up without swinging back, while hair lags and settles',()=>{
  const motion=createPaintedSecondaryMotion();
  for(let t=0;t<=1000;t+=16)motion.sample(0,0,0,t);
  let minTilt=0,minHair=0,maxHairAfter=-Infinity,last=restingPose();
  for(let t=1016;t<=1250;t+=16){const k=(t-1000)/250;last=motion.sample(0,.4*k,0,t);minTilt=Math.min(minTilt,last.leftTilt);minHair=Math.min(minHair,last.hair);}
  // The head moved right: ear tips and hair ends are left behind.
  expect(minTilt).toBeLessThan(-.08);expect(minHair).toBeLessThan(-3);
  let previous=last.leftTilt;
  for(let t=1266;t<=3000;t+=16){const pose=motion.sample(0,.4,0,t);
    expect(pose.leftTilt).toBeLessThanOrEqual(0);expect(pose.leftTilt).toBeGreaterThanOrEqual(previous-1e-9);previous=pose.leftTilt;
    expect(pose.rightTilt).toBe(pose.leftTilt);maxHairAfter=Math.max(maxHairAfter,pose.hair);last=pose;}
  expect(Math.abs(last.leftTilt)).toBeLessThan(.001);
  // One small swing past the resting place, then settled.
  expect(maxHairAfter).toBeLessThan(-minHair*.6);expect(Math.abs(last.hair)).toBeLessThan(.05);
  // The painter keeps drawing only while something is still catching up.
  expect(motion.settling()).toBe(false);motion.sample(0,0,0,3016);expect(motion.settling()).toBe(true);
});

it('freezes repeated timestamps and resets on seeks and long interruptions',()=>{
  const spring=createPaintedSecondaryMotion();spring.sample(0,0,0,0);const first=spring.sample(0,.4,.1,33);
  expect(spring.sample(0,.4,.1,33)).toEqual(first);
  expect(spring.sample(0,0,0,0)).toEqual(restingPose());
  spring.sample(0,.4,.1,30);expect(spring.sample(0,0,0,1000)).toEqual(restingPose());
  expect(spring.sample(NaN,Infinity,-Infinity)).toEqual(restingPose());
});

it('spends most time still, with independent looks and no continuous hair waving',()=>{
  let quiet=0,leftOnly=0,rightOnly=0;
  for(let t=0;t<32000;t+=50){const pose=paintedIdlePose(t);expect(paintedIdlePose(t)).toEqual(pose);
    expect(pose.leftEar).toBeGreaterThanOrEqual(0);expect(pose.rightEar).toBeGreaterThanOrEqual(0);
    if(pose.leftEar===0&&pose.rightEar===0)quiet++;
    if(pose.leftEar>.02&&pose.rightEar===0)leftOnly++;
    if(pose.rightEar>.02&&pose.leftEar===0)rightOnly++;
  }
  expect(quiet).toBeGreaterThan(450);expect(leftOnly).toBeGreaterThan(10);expect(rightOnly).toBeGreaterThan(10);
  expect(paintedIdlePose(500)).toEqual(restingPose());
});

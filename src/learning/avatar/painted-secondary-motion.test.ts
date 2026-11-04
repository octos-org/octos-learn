import{expect,it}from'vitest';
import{createPaintedSecondaryMotion,paintedIdlePose,paintedSecondaryPoint,paintedEarProjection,paintedEarLook,FOX_MOTION}from'./painted-secondary-motion';

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
  const pose={leftEar:.5,rightEar:0,hair:0,forelock:0};
  for(const point of [[198,210],[328,210],[261,248],[260,276],[256,420]]as Array<[number,number]>)expect(paintedSecondaryPoint(point,pose)).toEqual(point);
  const left=FOX_MOTION.ears[0].tip,right=FOX_MOTION.ears[1].tip;
  expect(paintedSecondaryPoint(right,pose)).toEqual(right);
  expect(Math.hypot(...paintedSecondaryPoint(left,pose).map((n,i)=>n-left[i]))).toBeGreaterThan(5);
});

it('lets hair lag and settle while active ear orientation remains monotone',()=>{
  const spring=createPaintedSecondaryMotion();spring.sample(0,0,0,0);
  const target=createPaintedSecondaryMotion().sample(0,.4,.1),first=spring.sample(0,.4,.1,33);
  expect(Math.abs(first.hair)).toBeLessThan(Math.abs(target.hair)/2);
  let previous=first.leftEar;
  for(let t=66;t<=600;t+=33){const value=spring.sample(0,.4,.1,t);expect(value.leftEar).toBeGreaterThanOrEqual(previous);expect(value.leftEar).toBeLessThanOrEqual(target.leftEar);previous=value.leftEar;}
  const released=spring.sample(0,0,0,627);expect(Math.abs(released.hair)).toBeGreaterThan(2);
  let settled=released;for(let t=660;t<2300;t+=33)settled=spring.sample(0,0,0,t);
  expect(Math.abs(settled.hair)).toBeLessThan(.01);expect(Math.abs(settled.leftEar)).toBeLessThan(.001);
});

it('freezes repeated timestamps and resets on seeks and long interruptions',()=>{
  const spring=createPaintedSecondaryMotion();spring.sample(0,0,0,0);const first=spring.sample(0,.4,.1,33);
  expect(spring.sample(0,.4,.1,33)).toEqual(first);
  expect(spring.sample(0,0,0,0)).toEqual({leftEar:0,rightEar:0,hair:0,forelock:0});
  spring.sample(0,.4,.1,30);expect(spring.sample(0,0,0,1000)).toEqual({leftEar:0,rightEar:0,hair:0,forelock:0});
  expect(spring.sample(NaN,Infinity,-Infinity)).toEqual({leftEar:0,rightEar:0,hair:0,forelock:0});
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
  expect(paintedIdlePose(500)).toEqual({leftEar:0,rightEar:0,hair:0,forelock:0});
});

import {expect,it} from 'vitest';
import {localRightEarPoint,starFoxHairPoint,starFoxNaturalPose,starFoxFollowingPose} from './painted-local-rig';
import {STAR_FOX_HAIR,STAR_FOX_RIGHT_EAR} from './star-fox-parts';
import {createPaintedSecondaryMotion} from './painted-secondary-motion';
import {paintedMouthControls} from './painted-fox';
import {neutralFrame} from './face-frame';
const distance=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[1]-b[1]);

it('attaches the second ear along its own visible seam while leaving its tip movable',()=>{
  for(const value of[-.4,0,.4,.8,1])for(const p of STAR_FOX_RIGHT_EAR.attachment)for(const dx of[-8,0,8])for(const dy of[-8,0,8]){
    const point:[number,number]=[p[0]+dx,p[1]+dy];expect(localRightEarPoint(point,value)).toEqual(point);
  }
  expect(distance(localRightEarPoint([574,85],1),[574,85])).toBeGreaterThan(10);
});
it('keeps the roots and authored bone lengths of every major hair group',()=>{
  for(const spec of STAR_FOX_HAIR)for(const value of[-1,-.5,0,.5,1]){
    const p=spec.chain.map(point=>starFoxHairPoint(point,value,spec));expect(p[0]).toEqual(spec.chain[0]);
    for(let i=0;i<2;i++)expect(distance(p[i],p[i+1])).toBeCloseTo(distance(spec.chain[i],spec.chain[i+1]),9);
    if(value===0)for(let i=0;i<3;i++)expect(p[i]).toEqual(spec.chain[i]);
  }
});
it('gives idle ears separate quiet events with changing timing across cycles',()=>{
  const poses=Array.from({length:880},(_,i)=>starFoxNaturalPose(i*100));
  expect(poses.filter(p=>p.ear>.001).length).toBeGreaterThan(10);
  expect(poses.filter(p=>(p.rightEar??0)>.001).length).toBeGreaterThan(10);
  expect(poses.filter(p=>p.ear>.001&&(p.rightEar??0)>.001)).toHaveLength(0);
  expect(poses.filter(p=>p.ear===0&&p.rightEar===0).length).toBeGreaterThan(poses.length*.7);
  expect(Array.from({length:220},(_,i)=>starFoxNaturalPose(i*100))).not.toEqual(Array.from({length:220},(_,i)=>starFoxNaturalPose(22000+i*100)));
  expect(starFoxNaturalPose(NaN)).toEqual(starFoxNaturalPose(0));
});
it('moves hair behind a rightward head movement and settles after it stops',()=>{
  const physics=createPaintedSecondaryMotion();physics.sample(0,0,0,0);
  const pose=starFoxFollowingPose(physics.sample(0,.4,0,33));
  for(const spec of STAR_FOX_HAIR){const tip=spec.chain[2],moved=starFoxHairPoint(tip,pose[spec.id]??0,spec);expect(moved[0]).toBeLessThan(tip[0]);}
  for(let t=66;t<600;t+=33)physics.sample(0,.4,0,t);
  for(let t=600;t<4000;t+=33)physics.sample(0,0,0,t);
  const settled=starFoxFollowingPose(physics.sample(0,0,0,4000));for(const value of Object.values(settled))expect(Math.abs(value)).toBeLessThan(.001);
});
it('separates a closed pucker from jaw opening, with close taking priority',()=>{
  const pucker={...neutralFrame(),channels:{mouthPucker:1}};
  expect(paintedMouthControls(pucker,true)).toEqual({open:0,round:1,wide:0});
  expect(paintedMouthControls({...pucker,channels:{mouthPucker:1,jawOpen:.5}},true).open).toBe(.5);
  expect(paintedMouthControls({...pucker,channels:{jawOpen:1,mouthFunnel:1,mouthClose:1}},true).open).toBe(0);
  expect(paintedMouthControls(pucker,false).open).toBe(.85);
});
it('keeps wide mouth channels independent of amplitude and preserves camera jaw gain',()=>{
  const frame={...neutralFrame(),channels:{mouthStretchLeft:1,jawOpen:.4}};
  expect(paintedMouthControls(frame,true)).toEqual({open:.4,round:0,wide:1});
  expect(paintedMouthControls({...frame,source:'mediapipe'},true).open).toBeCloseTo(.64);
});

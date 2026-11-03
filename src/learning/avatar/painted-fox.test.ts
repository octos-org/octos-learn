import {expect,it} from "vitest";
import {paintedBlinkAmount,paintedJawAmount,paintedHeadPoint,paintedMotionPoint,paintedEyeControls} from "./painted-fox";
import {neutralFrame} from "./face-frame";

it("keeps gaze inside the portrait and combines cheek squint with independent blinks",()=>{
  const state=paintedEyeControls({...neutralFrame(0,'mediapipe'),channels:{
    eyeLookOutLeft:.9,eyeLookInRight:.9,eyeLookUpLeft:.4,eyeLookUpRight:.4,
    cheekSquintLeft:.8,eyeBlinkRight:.8,
  }});
  expect(state.leftGaze[0]).toBe(-1);expect(state.leftGaze[1]).toBeCloseTo(-.6);
  expect(state.rightGaze).toEqual(state.leftGaze);
  expect(state.left).toBe(0);expect(state.leftSquint).toBe(.8);
  expect(state.right).toBe(1);
  const invalid=paintedEyeControls({...neutralFrame(),channels:{eyeLookInLeft:NaN,eyeSquintRight:Infinity}});
  expect(invalid).toEqual({left:0,right:0,leftSquint:0,rightSquint:0,leftTension:0,rightTension:0,leftGaze:[0,0],rightGaze:[0,0]});
});

it("maps independent brow lowering to the visible eyelid tension without forcing a blink",()=>{
  const state=paintedEyeControls({...neutralFrame(),channels:{browDownLeft:.85,browDownRight:.3}});
  expect(state.leftTension).toBe(.85);expect(state.rightTension).toBe(.3);
  expect(state.left).toBe(0);expect(state.right).toBe(0);
});

it("adds bounded ear and hair following while keeping facial geometry and clothing rigid",()=>{
  const face:Array<[number,number]>=[[198,210],[328,210],[261,248],[260,276]];
  for(const pitch of [-.35,.35])for(const yaw of [-.45,.45])for(const roll of [-.1,.1]){
    for(const point of face)expect(paintedMotionPoint(point,pitch,yaw,roll)).toEqual(paintedHeadPoint(point,pitch,yaw,roll));
    for(const point of [[35,-107],[475,-107],[10,180],[500,180]]as Array<[number,number]>){
      const rigid=paintedHeadPoint(point,pitch,yaw,roll),moved=paintedMotionPoint(point,pitch,yaw,roll);
      expect(Math.hypot(moved[0]-rigid[0],moved[1]-rigid[1])).toBeLessThan(8);
      expect(moved).not.toEqual(rigid);
    }
    expect(paintedMotionPoint([256,420],pitch,yaw,roll)).toEqual([256,420]);
  }
  expect(paintedMotionPoint([35,-107],0,0,0)).toEqual([35,-107]);
});

it("keeps asymmetric gaze and expression channels independent",()=>{
  const state=paintedEyeControls({...neutralFrame(),channels:{eyeLookInLeft:.5,eyeSquintRight:1}});
  expect(state.leftGaze).toEqual([.5,0]);
  expect(state.rightGaze).toEqual([0,0]);
  expect(state.left).toBe(0);
  expect(state.right).toBe(0);expect(state.rightSquint).toBe(1);
});

it("retargets detected eyelids without changing manual or ARKit control semantics",()=>{
  expect(paintedBlinkAmount(.8,"mediapipe")).toBe(1);
  expect(paintedBlinkAmount(.03,"mediapipe")).toBe(0);
  expect(paintedBlinkAmount(.5,"demo")).toBe(.5);
  expect(paintedBlinkAmount(.5,"arkit")).toBe(.5);
  expect(paintedBlinkAmount(NaN,"mediapipe")).toBe(0);
  let previous=0;
  for(let n=0;n<=100;n++){const value=paintedBlinkAmount(n/100,"mediapipe");expect(value).toBeGreaterThanOrEqual(previous);expect(value).toBeLessThanOrEqual(1);previous=value;}
});

it("gives camera mouth scores usable travel while preserving manual and ARKit values",()=>{
  expect(paintedJawAmount(0,"mediapipe")).toBe(0);
  expect(paintedJawAmount(.5,"mediapipe")).toBeCloseTo(.8);
  expect(paintedJawAmount(1,"mediapipe")).toBe(1);
  expect(paintedJawAmount(.5,"demo")).toBe(.5);
  expect(paintedJawAmount(.5,"arkit")).toBe(.5);
  expect(paintedJawAmount(NaN,"mediapipe")).toBe(0);
  let previous=0;
  for(let n=0;n<=100;n++){const value=paintedJawAmount(n/100,"mediapipe");expect(value).toBeGreaterThanOrEqual(previous);expect(value).toBeLessThanOrEqual(1);previous=value;}
});

it("moves hair and ears at the crop edges with the head without stretching them",()=>{
  const features:Array<[number,number]>=[[0,0],[512,0],[0,180],[512,180],[10,280],[500,280],[145,182],[377,182],[198,210],[328,210],[261,248],[260,276],[256,328]];
  const distance=(a:number[],b:number[])=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  for(const pitch of [-.35,.35])for(const yaw of [-.45,.45])for(const roll of [-.1,.1]){
    const moved=features.map(p=>paintedHeadPoint(p,pitch,yaw,roll));
    for(let a=0;a<features.length;a++)for(let b=a+1;b<features.length;b++)
      expect(distance(moved[a],moved[b])).toBeCloseTo(distance(features[a],features[b]),9);
    expect(paintedHeadPoint([256,420],pitch,yaw,roll)).toEqual([256,420]);
    expect(paintedHeadPoint([0,180],pitch,yaw,roll)).not.toEqual([0,180]);
  }
});

import {expect,it} from "vitest";
import {paintedBlinkAmount,paintedJawAmount,paintedHeadPoint} from "./painted-fox";

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

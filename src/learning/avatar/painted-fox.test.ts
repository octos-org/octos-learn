import {expect,it} from "vitest";
import {paintedBlinkAmount} from "./painted-fox";

it("retargets detected eyelids without changing manual or ARKit control semantics",()=>{
  expect(paintedBlinkAmount(.8,"mediapipe")).toBe(1);
  expect(paintedBlinkAmount(.03,"mediapipe")).toBe(0);
  expect(paintedBlinkAmount(.5,"demo")).toBe(.5);
  expect(paintedBlinkAmount(.5,"arkit")).toBe(.5);
  expect(paintedBlinkAmount(NaN,"mediapipe")).toBe(0);
  let previous=0;
  for(let n=0;n<=100;n++){const value=paintedBlinkAmount(n/100,"mediapipe");expect(value).toBeGreaterThanOrEqual(previous);expect(value).toBeLessThanOrEqual(1);previous=value;}
});

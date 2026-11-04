import { expect, it } from "vitest";
import { bodyFromLandmarks, BodySmoother, handGesture, mixBody, neutralBody, parseBodyPose, type BodyLandmark } from "./body-frame";
import { neutralFrame, FaceSmoother } from "./face-frame";
import { bodyPreset } from "./puppet-fox";
import { AVATAR_BODY_TRACK_SCHEMA, AVATAR_TRACK_SCHEMA, parseAvatarTrack, PerformanceRecorder, sampleAvatarTrack } from "./performance-track";
const pose = () => {
  const p: BodyLandmark[] = Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
  for(const [i,x,y] of [[11,.65,.3],[13,.8,.45],[15,.9,.2],[12,.35,.3],[14,.25,.5],[16,.25,.7]]) p[i!] = {x:x!,y:y!,visibility:1};
  return p;
};
const hand = (fingers: number[], x=.9, y=.2) => {
  const p = Array.from({length:21},()=>({x,y:y-.03})); p[0]={x,y}; p[9]={x,y:y-.06};
  for(const tip of [8,12,16,20]) {p[tip-2]={x:x+(tip-8)*.002,y:y-.07};p[tip]={x:x+(tip-8)*.002,y:y-(fingers.includes(tip)?.14:.04)};}
  return p;
};
it("mirrors camera x once and corrects the camera aspect ratio",()=>{
  const b=bodyFromLandmarks(pose(),[],640,480);
  expect(b.tracked).toBe(true);expect(b.left.tracked).toBe(true);expect(b.right.tracked).toBe(true);
  expect(b.left.upper).toBeCloseTo(Math.atan2(.15*4/3,.15));
  expect(b.right.upper).toBeLessThan(0);expect(b.left.lower).toBeGreaterThan(2);
  expect(bodyFromLandmarks(pose(),[],480,480).left.upper).toBeCloseTo(Math.PI/4);
});
it("drops each occluded arm independently and rejects non-finite landmarks",()=>{
  const p=pose();p[13]!.visibility=.1;expect(bodyFromLandmarks(p,[],640,480).left.tracked).toBe(false);expect(bodyFromLandmarks(p,[],640,480).right.tracked).toBe(true);
  p[12]!.x=NaN;expect(bodyFromLandmarks(p,[],640,480).tracked).toBe(false);
  expect(bodyFromLandmarks([],[],0,0)).toEqual(neutralBody());
});
it.each([[[],"fist"],[[8],"point"],[[8,12,16,20],"open"]] as const)("recognizes finger extension %s as %s",(fingers,gesture)=>{
  const p=hand([...fingers]);expect(handGesture(p)).toBe(gesture);
  // Rotate the entire hand 90 degrees: gesture must stay the same.
  expect(handGesture(p.map(({x,y})=>({x:-y,y:x})))).toBe(gesture);
});
it("matches hands by camera-space wrist even if handedness is inverted",()=>{
  const b=bodyFromLandmarks(pose(),[{side:"right",points:hand([8])}],640,480);
  expect(b.left.gesture).toBe("point");expect(b.right.gesture).toBe("relaxed");expect(b.left.wrist).toBeCloseTo(0);
  expect(bodyFromLandmarks(pose(),[{side:"left",points:hand([8],2,2)}],640,480).left.gesture).toBe("relaxed");
});
it("does not transfer a gesture from an invalid or missing hand",()=>{
  const p=hand([8]);p[8]!.x=NaN;
  expect(handGesture(p)).toBe("relaxed");expect(handGesture([])).toBe("relaxed");
  expect(bodyFromLandmarks(pose(),[{side:"left",points:p}],640,480).left.gesture).toBe("relaxed");
});
it("uses shortest-angle interpolation through the wrap boundary",()=>{
  const a=bodyPreset("left"),b=bodyPreset("left");a.left.lower=3.1;b.left.lower=-3.1;
  expect(Math.abs(mixBody(a,b,.5).left.lower)).toBeCloseTo(Math.PI);
});
it("returns lost arms to neutral and keeps body motion when the face is lost",()=>{
  const smoother=new FaceSmoother();let f=smoother.update({...neutralFrame(),body:bodyPreset("left")},0);
  expect(f.tracked).toBe(false);expect(f.body!.left.lower).toBeGreaterThan(1);
  f=smoother.update(neutralFrame(16),16);expect(f.body!.left.lower).toBeGreaterThan(0);
  for(let t=32;t<3000;t+=16)f=smoother.update(neutralFrame(t),t);
  expect(Math.abs(f.body!.left.lower)).toBeLessThan(.001);expect(f.body!.left.tracked).toBe(false);
  smoother.reset();expect(smoother.update(neutralFrame(),0).body).toBeUndefined();
  expect(new BodySmoother().update(undefined,0)).toBeUndefined();
});
it("strictly parses compact parameters and strips unrelated data",()=>{
  const b=bodyPreset("point");expect(parseBodyPose({...b,image:"no",landmarks:[]})).toEqual(b);
  expect(()=>parseBodyPose({...b,left:{...b.left,upper:Infinity}})).toThrow();
  expect(()=>parseBodyPose({...b,left:{...b.left,gesture:"private"}})).toThrow();
  expect(()=>parseBodyPose({...b,lean:4})).toThrow();
});
it("records and round-trips v2 body motion including face-lost frames",()=>{
  const recorder=new PerformanceRecorder();recorder.begin(100);
  const a={...neutralFrame(),body:bodyPreset("rest")},b={...neutralFrame(),body:bodyPreset("left")};
  recorder.append(a,100);recorder.append(b,200);b.body.left.upper=0;
  const track=parseAvatarTrack(JSON.parse(JSON.stringify(recorder.finish(200))));
  expect(track.schema).toBe(AVATAR_BODY_TRACK_SCHEMA);expect(track.frames[1]!.body!.left.upper).toBe(.9);
  expect(sampleAvatarTrack(track,50).body!.left.upper).toBeCloseTo(.45);
  expect(sampleAvatarTrack(track,100).tracked).toBe(false);
  expect(()=>parseAvatarTrack({...track,schema:AVATAR_TRACK_SCHEMA})).toThrow("body_requires_v2_track");
  expect(()=>parseAvatarTrack({...track,frames:[{...track.frames[0],body:{}}]})).toThrow();
});
it("preserves the old face-only track format",()=>{
  const recorder=new PerformanceRecorder();recorder.begin(0);recorder.append(neutralFrame(),0);
  expect(parseAvatarTrack(recorder.finish(10)).schema).toBe(AVATAR_TRACK_SCHEMA);
});

it("updates a gesture after tracking has already started at display-rate intervals",()=>{
  const smoother=new BodySmoother(); smoother.update(bodyPreset("rest"),0);
  expect(smoother.update(bodyPreset("point"),16)!.left.gesture).toBe("point");
  expect(smoother.update(bodyPreset("left"),32)!.left.gesture).toBe("open");
  expect(smoother.update(undefined,48)!.left.gesture).toBe("relaxed");
});

import {expect,it} from 'vitest';
import {paintedLipControls,paintedBrowControls} from './painted-expressions';
import {FACE_CHANNELS,neutralFrame} from './face-frame';
import {parseAvatarTrack,sampleAvatarTrack,AVATAR_TRACK_SCHEMA} from './performance-track';
import {expressionSample} from './expression-samples';
it('retains independent side, press, roll, shift and lip-raise channels',()=>{
 const p=paintedLipControls({...neutralFrame(),channels:{jawOpen:.6,mouthSmileLeft:.8,mouthFrownRight:.5,mouthPressLeft:.4,mouthRollUpper:.7,mouthRight:.8,mouthUpperUpRight:.5}});
 expect(p.leftSmile).toBe(.8);expect(p.rightSmile).toBe(-.5);expect(p.pressLeft).toBe(.4);expect(p.pressRight).toBe(0);expect(p.rollUpper).toBe(.7);expect(p.rollLower).toBe(0);expect(p.shift).toBe(.8);expect(p.upperRight).toBe(.5);expect(p.upperLeft).toBe(0);expect(p.open).toBeLessThan(.6);
});
it('keeps pucker distinct from funnel, and gives closure priority over all mouth opening signals',()=>{
 const p=paintedLipControls({...neutralFrame(),channels:{mouthPucker:1}});expect(p.open).toBe(0);expect(p.pucker).toBe(1);expect(p.funnel).toBe(0);
 const closed=paintedLipControls({...neutralFrame(),channels:{jawOpen:1,mouthClose:1,mouthUpperUpLeft:1,mouthLowerDownRight:1}});expect(closed.open).toBe(0);expect(closed.upperLeft).toBe(0);expect(closed.lowerRight).toBe(0);
});
it('preserves eyebrow asymmetry and small camera signals without inventing an expression',()=>{
 expect(paintedBrowControls(neutralFrame())).toEqual([{inner:0,outer:0,down:0},{inner:0,outer:0,down:0}]);
 const p=paintedBrowControls({...neutralFrame(0,'mediapipe'),channels:{browOuterUpLeft:.15,browDownRight:.2}});expect(p[0].outer).toBeCloseTo(.255);expect(p[1].down).toBeCloseTo(.34);expect(p[0].down).toBe(0);expect(p[1].outer).toBe(0);
 for(const pose of [paintedLipControls({...neutralFrame(),channels:Object.fromEntries(FACE_CHANNELS.map(k=>[k,NaN]))}),...paintedBrowControls({...neutralFrame(),channels:{browInnerUp:NaN}})])expect(Object.values(pose).every(Number.isFinite)).toBe(true);
});
it('round-trips the detailed facial channels through the existing action-track format',()=>{
 const frame={...neutralFrame(),tracked:true,channels:{mouthPressLeft:.7,mouthRollLower:.4,mouthLeft:.8,mouthUpperUpRight:.6,browOuterUpLeft:.9,browDownRight:.3}};
 const value={schema:AVATAR_TRACK_SCHEMA,durationMs:1000,frames:[frame,{...frame,timeMs:1000}]};
 const track=parseAvatarTrack(JSON.parse(JSON.stringify(value)));expect(track).not.toBeNull();expect(sampleAvatarTrack(track!,500).channels).toMatchObject(frame.channels);
 for(const id of['brows','lips'] as const)expect(expressionSample(id).frames.some(f=>Object.values(f.channels).some(n=>(n??0)>.5))).toBe(true);
});

import {faceChannel,type FaceFrame} from './face-frame';
const clamp=(n:number,min=0,max=1)=>Number.isFinite(n)?Math.max(min,Math.min(max,n)):0;
export function paintedLipControls(frame:FaceFrame){
 const raw=(key:Parameters<typeof faceChannel>[1])=>clamp(faceChannel(frame,key));
 const c=(key:Parameters<typeof faceChannel>[1])=>clamp(raw(key)*(frame.source==='mediapipe'?1.35:1));
 const close=raw('mouthClose'),pressLeft=c('mouthPressLeft'),pressRight=c('mouthPressRight'),press=(pressLeft+pressRight)/2;
 const jaw=clamp(raw('jawOpen')*(frame.source==='mediapipe'?1.6:1));
 return {open:jaw*(1-close)*(1-.7*press),close,pressLeft,pressRight,
  pucker:c('mouthPucker'),funnel:c('mouthFunnel'),
  leftSmile:clamp(c('mouthSmileLeft')+.25*c('mouthDimpleLeft')-c('mouthFrownLeft'),-1,1),
  rightSmile:clamp(c('mouthSmileRight')+.25*c('mouthDimpleRight')-c('mouthFrownRight'),-1,1),
  stretchLeft:c('mouthStretchLeft'),stretchRight:c('mouthStretchRight'),
  shift:clamp(c('mouthRight')-c('mouthLeft'),-1,1),jawShift:clamp(c('jawRight')-c('jawLeft'),-1,1),
  upperLeft:c('mouthUpperUpLeft')*(1-close),upperRight:c('mouthUpperUpRight')*(1-close),
  lowerLeft:c('mouthLowerDownLeft')*(1-close),lowerRight:c('mouthLowerDownRight')*(1-close),
  rollUpper:c('mouthRollUpper'),rollLower:c('mouthRollLower'),
  shrugUpper:c('mouthShrugUpper'),shrugLower:c('mouthShrugLower'),
 };
}
export type PaintedLipPose=ReturnType<typeof paintedLipControls>;
export function paintedBrowControls(frame:FaceFrame){
 const gain=frame.source==='mediapipe'?1.7:1;
 const c=(key:Parameters<typeof faceChannel>[1])=>clamp(faceChannel(frame,key)*gain);
 return [{inner:c('browInnerUp'),outer:c('browOuterUpLeft'),down:c('browDownLeft')},
  {inner:c('browInnerUp'),outer:c('browOuterUpRight'),down:c('browDownRight')}];
}

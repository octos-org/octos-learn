/** Real painter pixel checks and preview media; no camera input or browser control. */
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createPaintedFoxPainter,PAINTED_FOX_ASSETS,PAINTED_FOX_VIEW,paintedEyeControls} from '../src/learning/avatar/painted-fox';
import {preparePaintedEyes,paintEyes} from '../src/learning/avatar/painted-eyes';
import {neutralFrame,type FaceFrame} from '../src/learning/avatar/face-frame';
import {PerformanceRecorder,parseAvatarTrack,sampleAvatarTrack} from '../src/learning/avatar/performance-track';
const [toolsDir,output='docs/avatar-animation-phase-a/ears-expressions-v2']=process.argv.slice(2);
if(!toolsDir)throw Error('Expected authoring tools directory');
const require=createRequire(`${resolve(toolsDir)}/package.json`),{createCanvas,loadImage,GlobalFonts}=require('@napi-rs/canvas');
const {GIFEncoder,quantize,applyPalette}=require('gifenc');
GlobalFonts.registerFromPath('/System/Library/Fonts/STHeiti Medium.ttc','AvatarChinese');
const surface=(w:number,h:number)=>{const canvas=createCanvas(w,h);return{canvas,context:canvas.getContext('2d')as CanvasRenderingContext2D};};
const images=Object.fromEntries(await Promise.all(Object.entries(PAINTED_FOX_ASSETS).map(async([key,path])=>[key,await loadImage(`public/${path}`)])));
const painter=createPaintedFoxPainter(images as Parameters<typeof createPaintedFoxPainter>[0],surface);
const {frame:sz,size,x:padX,y:padY}=PAINTED_FOX_VIEW,margin=(sz-size)/2,offsetX=margin+padX,offsetY=margin+padY;
const canvas=createCanvas(sz,sz),ctx=canvas.getContext('2d');
const frame=(channels:FaceFrame['channels']={},rotation:FaceFrame['rotation']=[0,0,0]):FaceFrame=>({...neutralFrame(),tracked:true,channels,rotation});
const render=(value:FaceFrame)=>{painter.draw(ctx,sz,sz,value);return ctx.getImageData(0,0,sz,sz).data;};
const diff=(a:Uint8ClampedArray,b:Uint8ClampedArray,where:(x:number,y:number)=>boolean=()=>true)=>{
  let max=0,changed=0;for(let y=0;y<sz;y++)for(let x=0;x<sz;x++)if(where(x-offsetX,y-offsetY)){
    let pixel=0;for(let ch=0;ch<4;ch++)pixel=Math.max(pixel,Math.abs(a[(y*sz+x)*4+ch]-b[(y*sz+x)*4+ch]));
    max=Math.max(max,pixel);if(pixel>8)changed++;
  }return{max,changed};
};
await mkdir(output,{recursive:true});
const neutral=render(frame()),reference=surface(sz,sz);reference.context.drawImage(images.extended,margin,margin,size,size);
const originalFace=surface(sz,sz);originalFace.context.drawImage(images.base,offsetX,offsetY,512,512);
const mouth=frame({jawOpen:1}),frown=frame({browDownLeft:1,browDownRight:1,mouthFrownLeft:.8,mouthFrownRight:.8});
const checks:Record<string,number>={neutralMax:diff(neutral,reference.context.getImageData(0,0,sz,sz).data).max,
  originalFaceMax:diff(neutral,originalFace.context.getImageData(0,0,sz,sz).data,(x,y)=>x>=128&&x<400&&y>=128&&y<338).max,
  mouthOutsideMax:diff(render(mouth),neutral,(x,y)=>!(x>=210&&x<314&&y>=254&&y<334)).max,
  mouthCloseMax:diff(render(frame({jawOpen:1,mouthClose:1})),neutral).max,
  independentRightEyeMax:diff(render(frame({browDownLeft:1})),neutral,(x,y)=>x>=274&&x<389&&y>=136&&y<260).max,
  closedLidTensionMax:diff(render(frame({eyeBlinkLeft:1,eyeBlinkRight:1,browDownLeft:1,browDownRight:1})),render(frame({eyeBlinkLeft:1,eyeBlinkRight:1})),(_x,y)=>y>=185&&y<260).max,
  invalidMax:diff(render(frame({browDownLeft:NaN,eyeSquintLeft:Infinity,jawOpen:NaN},[NaN,Infinity,-Infinity])),neutral).max};
const eyeOnly=surface(sz,sz),small=surface(512,512),rig=preparePaintedEyes(surface,images.base,images.clean);
small.context.drawImage(images.base,0,0);paintEyes(small.context,rig,paintedEyeControls(frown));
eyeOnly.context.drawImage(images.extended,margin,margin,size,size);eyeOnly.context.drawImage(small.canvas,128,128,272,210,offsetX+128,offsetY+128,272,210);
checks.lidAfterBrowOverlayMax=diff(render(frown),eyeOnly.context.getImageData(0,0,sz,sz).data,(x,y)=>x>=134&&x<389&&y>=185&&y<250).max;
let minAlpha=255,clothesMax=0;
for(const pitch of [-.35,.35])for(const yaw of [-.45,.45])for(const roll of [-.1,.1]){
  const pixels=render(frame({},[pitch,yaw,roll]));clothesMax=Math.max(clothesMax,diff(pixels,neutral,(_x,y)=>y>=420).max);
  for(let y=margin;y<margin+size;y++)for(let x=margin;x<margin+size;x++)minAlpha=Math.min(minAlpha,pixels[(y*sz+x)*4+3]);
}
checks.clothesMax=clothesMax;checks.resetMax=diff(render(frame()),neutral).max;
const continuity=Object.fromEntries(['jawOpen','browDownLeft','browInnerUp','eyeSquintLeft','eyeLookInLeft'].map(key=>[key,diff(render(frame({[key]:.000001})),neutral).max]));
const frownLidDelta=diff(render(frown),neutral,(x,y)=>x>=134&&x<389&&y>=185&&y<235);
if(Object.values(checks).some(n=>n!==0)||Object.values(continuity).some(n=>n>1)||minAlpha!==255||frownLidDelta.changed<200)throw Error(JSON.stringify({checks,continuity,minAlpha,frownLidDelta}));
const poses=[
  {label:'自然 · 完整耳朵',value:frame()},
  {label:'皱眉 · 眉眼联动',value:frown},
  {label:'疑惑 · 单侧抬眉',value:frame({browOuterUpLeft:.9,browDownRight:.4,mouthFrownRight:.4},[0,0,.04])},
  {label:'担心 · 眉心上抬',value:frame({browInnerUp:.9,mouthFrownLeft:.8,mouthFrownRight:.8})},
  {label:'向左摆头',value:frame({},[.15,.4,.1])},
  {label:'向右摆头',value:frame({},[-.15,-.4,-.1])},
  {label:'眯眼微笑',value:frame({cheekSquintLeft:.8,cheekSquintRight:.8,mouthSmileLeft:.8,mouthSmileRight:.8})},
  {label:'张嘴 · 口腔细节',value:mouth},
];
const sheet=createCanvas(1280,700),s=sheet.getContext('2d');s.fillStyle='#f4f1ea';s.fillRect(0,0,1280,700);s.font='17px AvatarChinese';
for(const [i,p]of poses.entries()) {render(p.value);s.fillStyle='#243649';s.fillText(p.label,i%4*320+10,Math.floor(i/4)*350+22);s.drawImage(canvas,i%4*320,Math.floor(i/4)*350+30,320,320);}
await writeFile(`${output}/poses.jpg`,sheet.toBuffer('image/jpeg',94));
render(frame());await writeFile(`${output}/neutral.png`,canvas.toBuffer('image/png'));
const close=createCanvas(800,344),c=close.getContext('2d');c.fillStyle='#f4f1ea';c.fillRect(0,0,800,344);c.font='22px AvatarChinese';
for(const [i,p]of poses.slice(0,2).entries()){render(p.value);c.drawImage(canvas,offsetX+130,offsetY+130,264,200,i*400,34,400,303);c.fillStyle='#243649';c.fillText(p.label,i*400+10,24);}
await writeFile(`${output}/frown-detail.jpg`,close.toBuffer('image/jpeg',95));
const scratch=resolve('scratch/avatar-ears');await mkdir(scratch,{recursive:true});
const beforePath=resolve(scratch,'mouth-before.ts');
await writeFile(beforePath,execFileSync('git',['show','51acb03f:src/learning/avatar/painted-fox.ts'],{encoding:'utf8'}).replaceAll('"./face-frame"',JSON.stringify(resolve('src/learning/avatar/face-frame.ts'))).replaceAll('"./original-fox"',JSON.stringify(resolve('src/learning/avatar/original-fox.ts'))).replaceAll('"./painted-eyes"',JSON.stringify(resolve('src/learning/avatar/painted-eyes.ts'))));
const old=await import(beforePath),oldPainter=old.createPaintedFoxPainter(images,surface),oldSurface=surface(536,536);
const mouthDetail=createCanvas(640,294),md=mouthDetail.getContext('2d');md.fillStyle='#f4f1ea';md.fillRect(0,0,640,294);md.font='20px AvatarChinese';md.fillStyle='#243649';md.fillText('此前口腔采样',12,25);md.fillText('本轮口腔采样',332,25);
oldPainter.draw(oldSurface.context,536,536,mouth);render(mouth);
md.drawImage(oldSurface.canvas,222,266,104,80,4,40,312,240);md.drawImage(canvas,offsetX+210,offsetY+254,104,80,324,40,312,240);
await writeFile(`${output}/mouth-detail.jpg`,mouthDetail.toBuffer('image/jpeg',95));
const gifCanvas=createCanvas(400,434),g=gifCanvas.getContext('2d'),gif=GIFEncoder(),timings:number[]=[],values:FaceFrame[]=[];
const recorder=new PerformanceRecorder();recorder.begin(0);
for(let i=0;i<80;i++){
  const phase=i/80*4,part=Math.floor(phase),wave=Math.sin((phase-part)*Math.PI)**2;
  const value=part===0?frame({},[.2*Math.sin(i*.2),.42*Math.sin(i*.32),.1*Math.sin(i*.32)])
    :part===1?frame({browDownLeft:wave,browDownRight:wave,mouthFrownLeft:.8*wave,mouthFrownRight:.8*wave})
      :part===2?frame({browInnerUp:.9*wave,mouthFrownLeft:.8*wave,mouthFrownRight:.8*wave})
        :frame({jawOpen:wave,cheekSquintLeft:.4*wave,cheekSquintRight:.4*wave,mouthSmileLeft:.5*wave,mouthSmileRight:.5*wave});
  values.push(value);recorder.append(value,i*100);const started=performance.now();render(value);timings.push(performance.now()-started);
  g.fillStyle='#f4f1ea';g.fillRect(0,0,400,434);g.font='18px AvatarChinese';g.fillStyle='#243649';g.fillText(['耳朵 / 发梢随头移动','皱眉 · 眉眼联动','担心 · 眉心变化','开口 / 微笑'][part],12,24);g.drawImage(canvas,0,34,400,400);
  const rgba=g.getImageData(0,0,400,434).data,palette=quantize(rgba,128);gif.writeFrame(applyPalette(rgba,palette),400,434,{palette,delay:100});
}
gif.finish();await writeFile(`${output}/preview.gif`,gif.bytes());
const track=parseAvatarTrack(JSON.parse(JSON.stringify(recorder.finish(8000))));
let replayMax=0;for(const i of [0,5,19,30,45,60,79])replayMax=Math.max(replayMax,diff(render(values[i]),render(sampleAvatarTrack(track,i*100))).max);
if(replayMax)throw Error('Replay changed output');
const report={checks,continuity,minAlpha,frownLidDelta,replayMax,animation:{frames:80,durationMs:8000,synthetic:true},meanNativeDrawMs:timings.reduce((a,b)=>a+b,0)/timings.length,
  limits:'Actual product painter, deterministic synthetic controls; no browser/camera/TV acceptance. Bicubic sampling adds no missing oral artwork. Small 2D bends do not reconstruct a side view.'};
await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));

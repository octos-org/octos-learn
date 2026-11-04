/** Actual production painter comparison using deterministic controls, not a camera recording. */
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createPaintedFoxPainter,PAINTED_FOX_ASSETS} from '../src/learning/avatar/painted-fox';
import {neutralFrame,type FaceFrame} from '../src/learning/avatar/face-frame';

const [toolsDir,output='docs/avatar-animation-phase-a/expressions-v1',baseline='51acb03f']=process.argv.slice(2);
if(!toolsDir)throw Error('Expected authoring tools directory');
const work=resolve('scratch/avatar-expressions');await mkdir(work,{recursive:true});await mkdir(output,{recursive:true});
const beforeEyes=resolve(work,'baseline-eyes.ts'),beforePainter=resolve(work,'baseline-painter.ts');
await writeFile(beforeEyes,execFileSync('git',['show',`${baseline}:src/learning/avatar/painted-eyes.ts`],{encoding:'utf8'})
  .replaceAll('"./original-fox"',JSON.stringify(resolve('src/learning/avatar/original-fox.ts'))));
await writeFile(beforePainter,execFileSync('git',['show',`${baseline}:src/learning/avatar/painted-fox.ts`],{encoding:'utf8'})
  .replaceAll('"./face-frame"',JSON.stringify(resolve('src/learning/avatar/face-frame.ts')))
  .replaceAll('"./original-fox"',JSON.stringify(resolve('src/learning/avatar/original-fox.ts')))
  .replaceAll('"./painted-eyes"',JSON.stringify(beforeEyes)));
const old=await import(beforePainter);
const require=createRequire(`${resolve(toolsDir)}/package.json`);
const {createCanvas,loadImage,GlobalFonts}=require('@napi-rs/canvas');
GlobalFonts.registerFromPath('/System/Library/Fonts/STHeiti Medium.ttc','AvatarChinese');
const {GIFEncoder,quantize,applyPalette}=require('gifenc');
const images=Object.fromEntries(await Promise.all(Object.entries(PAINTED_FOX_ASSETS).map(async([key,path])=>[key,await loadImage(`public/${path}`)])));
const surface=(w:number,h:number)=>{const canvas=createCanvas(w,h);return{canvas,context:canvas.getContext('2d')as CanvasRenderingContext2D};};
const before=old.createPaintedFoxPainter(images,surface),after=createPaintedFoxPainter(images as Parameters<typeof createPaintedFoxPainter>[0],surface);
const canvas=createCanvas(536,536),ctx=canvas.getContext('2d');
const frame=(channels:FaceFrame['channels']={},rotation:FaceFrame['rotation']=[0,0,0]):FaceFrame=>({...neutralFrame(),tracked:true,channels,rotation});
const render=(value:FaceFrame)=>{after.draw(ctx,536,536,value);return ctx.getImageData(0,0,536,536).data;};
const diff=(a:Uint8ClampedArray,b:Uint8ClampedArray,where:(x:number,y:number)=>boolean=()=>true)=>{
  let max=0;for(let y=0;y<536;y++)for(let x=0;x<536;x++)if(where(x,y))for(let ch=0;ch<4;ch++)max=Math.max(max,Math.abs(a[(y*536+x)*4+ch]-b[(y*536+x)*4+ch]));return max;
};
const poses=[
  {label:'自然',value:frame()},
  {label:'视线向左',value:frame({eyeLookOutLeft:1,eyeLookInRight:1})},
  {label:'视线向右',value:frame({eyeLookInLeft:1,eyeLookOutRight:1})},
  {label:'视线向上',value:frame({eyeLookUpLeft:1,eyeLookUpRight:1})},
  {label:'视线向下',value:frame({eyeLookDownLeft:1,eyeLookDownRight:1})},
  {label:'眯眼微笑',value:frame({cheekSquintLeft:.85,cheekSquintRight:.85,mouthSmileLeft:.8,mouthSmileRight:.8})},
  {label:'皱眉',value:frame({browDownLeft:1,browDownRight:1,mouthFrownLeft:.8,mouthFrownRight:.8})},
  {label:'单侧抬眉',value:frame({browOuterUpLeft:1})},
  {label:'单眼闭合 + 侧看',value:frame({eyeBlinkLeft:1,eyeLookInLeft:.8,eyeLookOutRight:.8})},
  {label:'微笑张嘴',value:frame({jawOpen:.65,mouthSmileLeft:.8,mouthSmileRight:.8,cheekSquintLeft:.5,cheekSquintRight:.5})},
  {label:'大张嘴',value:frame({jawOpen:1})},
  {label:'转头 + 视线',value:frame({eyeLookOutLeft:.7,eyeLookInRight:.7},[.15,-.3,-.08])},
];
const sheet=createCanvas(1024,864),s=sheet.getContext('2d');s.fillStyle='#f4f1ea';s.fillRect(0,0,1024,864);s.font='18px AvatarChinese';
for(const [i,p]of poses.entries()){
  after.draw(ctx,536,536,p.value);s.fillStyle='#243649';s.fillText(p.label,i%4*256+12,Math.floor(i/4)*288+23);
  s.drawImage(canvas,i%4*256,Math.floor(i/4)*288+32,256,256);
}
await writeFile(`${output}/poses.jpg`,sheet.toBuffer('image/jpeg',92));
const neutral=render(frame()),reference=surface(536,536);reference.context.drawImage(images.base,12,12,512,512);
const checks={neutralMax:diff(neutral,reference.context.getImageData(0,0,536,536).data),
  gazeOutsideEyesMax:diff(render(poses[1].value),neutral,(x,y)=>!(x>=146&&x<264&&y>=173&&y<272)&&!(x>=286&&x<401&&y>=173&&y<272)),
  closedEyeGazeMax:diff(render(frame({eyeBlinkLeft:1,eyeBlinkRight:1,eyeLookInLeft:1,eyeLookOutRight:1})),render(frame({eyeBlinkLeft:1,eyeBlinkRight:1}))),
  independentRightEyeMax:diff(render(frame({eyeLookInLeft:1})),neutral,(x,y)=>x>=286&&x<401&&y>=173&&y<272),
  invalidMax:diff(render(frame({eyeLookInLeft:NaN,eyeLookUpRight:Infinity,cheekSquintLeft:NaN})),neutral),resetMax:diff(render(frame()),neutral)};
const continuity=Object.fromEntries(['eyeLookInLeft','eyeLookOutRight','eyeLookUpLeft','eyeSquintLeft','mouthFrownLeft','browDownLeft'].map(key=>[key,diff(render(frame({[key]:.000001})),neutral)]));
function pupilX(value:FaceFrame){
  const data=render(value);let weight=0,sum=0;
  for(let y=194;y<=232;y++)for(let x=165;x<=231;x++){
    const i=((y+12)*536+x+12)*4,r=data[i],g=data[i+1],b=data[i+2];
    if(r>80&&r>g*1.12&&g>b*1.15&&b<170){const w=r-g;sum+=x*w;weight+=w;}
  }return sum/weight;
}
const gazeCentroids={left:pupilX(poses[1].value),neutral:pupilX(frame()),right:pupilX(poses[2].value)};
if(Object.values(checks).some(n=>n!==0)||Object.values(continuity).some(n=>n>1)||!(gazeCentroids.left<gazeCentroids.neutral&&gazeCentroids.neutral<gazeCentroids.right))
  throw Error(JSON.stringify({checks,continuity,gazeCentroids}));
const pair=createCanvas(640,358),p=pair.getContext('2d'),gif=GIFEncoder(),timings:number[]=[];
const animationFrames=100,delayMs=100;
for(let i=0;i<animationFrames;i++){
  const phase=i/animationFrames*5,part=Math.floor(phase),wave=Math.sin((phase-part)*Math.PI)**2;
  const value=part===0?frame({eyeLookInLeft:Math.sin(i*.22),eyeLookOutRight:Math.sin(i*.22),eyeLookOutLeft:-Math.sin(i*.22),eyeLookInRight:-Math.sin(i*.22)})
    :part===1?frame({cheekSquintLeft:wave,cheekSquintRight:wave,mouthSmileLeft:wave,mouthSmileRight:wave})
      :part===2?frame({browDownLeft:wave,browDownRight:wave,mouthFrownLeft:wave,mouthFrownRight:wave})
        :part===3?frame({browOuterUpLeft:wave,eyeBlinkRight:wave})
          :frame({jawOpen:wave,mouthSmileLeft:.5*wave,mouthSmileRight:.5*wave,eyeLookUpLeft:.4*wave,eyeLookUpRight:.4*wave});
  p.fillStyle='#f4f1ea';p.fillRect(0,0,640,358);p.font='18px AvatarChinese';p.fillStyle='#243649';
  for(const [col,painter]of [before,after].entries()){
    const started=performance.now();painter.draw(ctx,536,536,value);if(col===1)timings.push(performance.now()-started);
    p.fillText(col?'优化后':'此前版本',col*320+12,24);p.drawImage(canvas,col*320,38,320,320);
  }
  const rgba=p.getImageData(0,0,640,358).data,palette=quantize(rgba,128);
  gif.writeFrame(applyPalette(rgba,palette),640,358,{palette,delay:delayMs});
}
gif.finish();await writeFile(`${output}/comparison.gif`,gif.bytes());
const report={baseline,checks,continuity,gazeCentroids,animation:{frames:animationFrames,delayMs,durationMs:animationFrames*delayMs},
  meanNativeDrawMs:timings.reduce((a,b)=>a+b,0)/timings.length,
  source:'Actual old/new production Canvas painters, identical painted-v0.2 assets, deterministic synthetic coefficients.',
  limits:'No new face capture. Centroid verifies direction, not gaze tracking accuracy. Native draw times and GIF playback are not browser/TV FPS. No additional side-view geometry.'};
await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));

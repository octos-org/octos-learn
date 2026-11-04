import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {MATERIALS,drawFace} from '../docs/avatar-animation-phase-a/facial-rig/renderer.mjs';
import {prepareBlinkStudy,drawBlinkStudy} from '../docs/avatar-animation-phase-a/facial-rig/blink-study.mjs';
const require=createRequire(import.meta.url);
const {createCanvas,loadImage}=require(process.argv[2]||'@napi-rs/canvas');
const root=path.resolve('docs/avatar-animation-phase-a/facial-rig'),out=path.resolve('scratch/avatar-face-rig/blink-v2');
const deliver=path.join(root,'blink-v2');fs.mkdirSync(deliver,{recursive:true});
fs.mkdirSync(out,{recursive:true});
const images=Object.fromEntries(await Promise.all(MATERIALS.map(async k=>[k,await loadImage(`${root}/materials/${k}.png`)])));
const rig=prepareBlinkStudy(createCanvas,images.source),canvas=createCanvas(512,512),ctx=canvas.getContext('2d');
const sheet=createCanvas(1400,480),s=sheet.getContext('2d');s.fillStyle='#f4f1ea';s.fillRect(0,0,1400,480);s.fillStyle='#243649';s.font='18px sans-serif';
const source=createCanvas(512,512),sourceCtx=source.getContext('2d');sourceCtx.drawImage(images.source,0,0);const original=sourceCtx.getImageData(0,0,512,512).data;
let outsideMax=0,irisMax=0;
for(const [i,blink]of [0,.25,.5,.75,1].entries()) {
  s.fillText(`V1 / ${blink*100}%`,i*280+12,22);
  drawFace(ctx,images,{left:blink});s.drawImage(canvas,120,165,140,105,i*280,30,280,210);
  s.fillText(`V2 / ${blink*100}%`,i*280+12,262);
  drawBlinkStudy(ctx,images,rig,blink);s.drawImage(canvas,120,165,140,105,i*280,270,280,210);
  fs.writeFileSync(`${out}/${Math.round(blink*100)}.png`,canvas.toBuffer('image/png'));
  const pixels=ctx.getImageData(0,0,512,512).data;
  for(let y=0;y<512;y++)for(let x=0;x<512;x++) {
    const outside=x<120||x>=255||y<160||y>=270;
    const iris=blink<=.75&&x>=180&&x<=194&&y>=223&&y<=225;
    if(outside||iris)for(let c=0;c<4;c++) {
      const delta=Math.abs(pixels[(y*512+x)*4+c]-original[(y*512+x)*4+c]);
      if(outside)outsideMax=Math.max(outsideMax,delta);if(iris)irisMax=Math.max(irisMax,delta);
    }
  }
}
fs.writeFileSync(`${deliver}/comparison.png`,sheet.toBuffer('image/png'));
drawBlinkStudy(ctx,images,rig,0);let resetMax=0;const reset=ctx.getImageData(0,0,512,512).data;
for(let i=0;i<reset.length;i++)resetMax=Math.max(resetMax,Math.abs(reset[i]-original[i]));
drawBlinkStudy(ctx,images,rig,.0001);const opening=ctx.getImageData(0,0,512,512).data;let openingSum=0,openingMax=0;
for(let y=160;y<270;y++)for(let x=120;x<255;x++)for(let c=0;c<3;c++){const delta=Math.abs(opening[(y*512+x)*4+c]-original[(y*512+x)*4+c]);openingMax=Math.max(openingMax,delta);openingSum+=delta;}
if(outsideMax!==0||irisMax!==0||resetMax!==0)throw Error(JSON.stringify({outsideMax,irisMax,resetMax}));
const clip=createCanvas(800,300),clipCtx=clip.getContext('2d');
fs.mkdirSync(`${out}/frames`,{recursive:true});
for(let i=0;i<120;i++){
  const t=i/24,smooth=p=>{p=Math.max(0,Math.min(1,p));return p*p*(3-2*p);};
  const blink=t<1?0:t<2?smooth(t-1):t<2.3?1:1-smooth(t-2.3);
  clipCtx.fillStyle='#f4f1ea';clipCtx.fillRect(0,0,800,300);clipCtx.fillStyle='#243649';clipCtx.font='18px sans-serif';
  for(const [j,label]of ['V1 / compressed eye','V2 / stationary iris'].entries()) {
    clipCtx.fillText(label,j*400+12,24);if(j===0)drawFace(ctx,images,{left:blink});else drawBlinkStudy(ctx,images,rig,blink);
    clipCtx.drawImage(canvas,120,165,140,95,j*400,30,400,270);
  }
  fs.writeFileSync(`${out}/frames/${String(i).padStart(3,'0')}.png`,clip.toBuffer('image/png'));
}
const report={scope:'Screen-left eye only, local Canvas study; no webcam or full face/head rig',poses:[0,.25,.5,.75,1],outsideRect:[120,160,255,270],outsideRectMaxChannelDifference:outsideMax,resetMaxChannelDifference:resetMax,stationaryIrisPatch:{rect:[180,223,195,226],blinkValues:[0,.25,.5,.75],maxChannelDifference:irisMax},neutralReconstructionBoundary:{atBlink:.0001,maxChannelDifference:openingMax,meanAbsoluteRgbDifferenceInEyeRect:openingSum/(135*110*3),note:'Zero blink uses source pixels. Very small positive blink reconstructs painted lashes; remaining boundary jump is a known limitation, not a quality pass.'},frameCount:120,playbackFps:24,quality:'Iris no longer squeezed. Some lash edge aliasing and reconstruction changes remain; not a finished animation quality pass.'};
fs.writeFileSync(`${deliver}/report.json`,JSON.stringify(report,null,2));console.log(report);

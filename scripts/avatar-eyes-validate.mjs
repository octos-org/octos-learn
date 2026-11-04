import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {prepareEyeOcclusion,drawEyeOcclusion} from '../docs/avatar-animation-phase-a/facial-rig/eye-occlusion.mjs';
const require=createRequire(import.meta.url);
const {createCanvas,loadImage}=require(process.argv[2]||'@napi-rs/canvas');
const root=path.resolve('docs/avatar-animation-phase-a/facial-rig'),deliver=path.join(root,'blink-v3'),framesDir=path.resolve('scratch/avatar-face-rig/blink-v3/frames');
fs.mkdirSync(deliver,{recursive:true});fs.mkdirSync(framesDir,{recursive:true});
const images=Object.fromEntries(await Promise.all(['source','face'].map(async k=>[k,await loadImage(`${root}/materials/${k}.png`)])));
const canvas=createCanvas(512,512),ctx=canvas.getContext('2d'),rig=prepareEyeOcclusion(createCanvas,images.source,images.face);
const render=state=>{drawEyeOcclusion(ctx,images,rig,state);return ctx.getImageData(0,0,512,512).data;};
const original=render({});
const maxDiff=(a,b,predicate=()=>true)=>{let max=0;for(let y=0;y<512;y++)for(let x=0;x<512;x++)if(predicate(x,y))for(let ch=0;ch<4;ch++)max=Math.max(max,Math.abs(a[(y*512+x)*4+ch]-b[(y*512+x)*4+ch]));return max;};
const inEye=(x,y,eye)=>x>=eye.profile.rect[0]&&x<eye.profile.rect[0]+eye.w&&y>=eye.profile.rect[1]&&y<eye.profile.rect[1]+eye.h;
let outsideMax=0,irisMax=0;
const poses=[0,.25,.5,.75,1,0],sheet=createCanvas(1536,1096),s=sheet.getContext('2d');s.fillStyle='#f4f1ea';s.fillRect(0,0,sheet.width,sheet.height);s.font='20px sans-serif';
for(const [i,b]of poses.entries()){
  const pixels=render({left:b,right:b});outsideMax=Math.max(outsideMax,maxDiff(pixels,original,(x,y)=>!inEye(x,y,rig.left)&&!inEye(x,y,rig.right)));
  if(b<=.75)irisMax=Math.max(irisMax,maxDiff(pixels,original,(x,y)=>y>=223&&y<=225&&((x>=180&&x<=194)||(x>=320&&x<=333))));
  const x=i%3*512,y=Math.floor(i/3)*548;s.fillStyle='#243649';s.fillText(i===5?'Reset':`${b*100}%`,x+16,y+25);s.drawImage(canvas,x,y+36);
}
fs.writeFileSync(`${deliver}/comparison.jpg`,sheet.toBuffer('image/jpeg',92));
const boundary={};for(const key of ['left','right']){
  const closed=render({[key]:1});boundary[key]=[];
  for(const epsilon of [.001,.0001,.00001,.000001]){
    const start=render({[key]:epsilon}),end=render({[key]:1-epsilon});
    boundary[key].push({epsilon,nearNeutralMax:maxDiff(start,original),nearClosedMax:maxDiff(end,closed)});
  }
  const limit=boundary[key].at(-1),probe=boundary[key][1];
  if(limit.nearNeutralMax>1||limit.nearClosedMax>1||probe.nearNeutralMax>8||probe.nearClosedMax>8)throw Error('Lid endpoint continuity failed: '+JSON.stringify({key,probes:boundary[key]}));
}
const leftOnly=render({left:1}),rightOnly=render({right:1});
const independentEyeMax=Math.max(maxDiff(leftOnly,original,(x,y)=>inEye(x,y,rig.right)),maxDiff(rightOnly,original,(x,y)=>inEye(x,y,rig.left)));
const resetMax=maxDiff(render({}),original),invalidInputMax=maxDiff(render({left:NaN,right:Infinity}),original);
// Residual blending is rounded to 8-bit pixels; tolerate one level within the iris probe.
if(outsideMax||irisMax>1||independentEyeMax||resetMax||invalidInputMax)throw Error(JSON.stringify({outsideMax,irisMax,independentEyeMax,resetMax,invalidInputMax}));
const smooth=p=>{p=Math.max(0,Math.min(1,p));return p*p*(3-2*p);},frames=[];
for(let i=0;i<120;i++){
  const t=i/24;let left=0,right=0;
  if(t>=1&&t<2.65){left=right=t<1.7?smooth((t-1)/.7):t<1.95?1:1-smooth((t-1.95)/.7);}
  else if(t>=3.2&&t<3.7)left=Math.sin((t-3.2)*2*Math.PI)**2;
  else if(t>=4.2&&t<4.7)right=Math.sin((t-4.2)*2*Math.PI)**2;
  render({left,right});fs.writeFileSync(`${framesDir}/${String(i).padStart(3,'0')}.png`,canvas.toBuffer('image/png'));frames.push({i,time:t,left,right});
}
const report={scope:'Both eyes; continuous painted residuals with unwarped eyeball. No full head, mouth or gaze rig.',outsideEyesMaxChannelDifference:outsideMax,stationaryIrisProbeMaxChannelDifference:irisMax,probeNote:'Visible 15x3/14x3 iris regions at 0/25/50/75%; geometry guard, not a quality score.',independentEyeMaxChannelDifference:independentEyeMax,neutralResetMaxChannelDifference:resetMax,invalidInputsReturnNeutralMaxChannelDifference:invalidInputMax,endpointContinuity:boundary,playbackFps:24,frames,quality:'Corrects V2 neutral jump and extends to both eyes. Fitted 512px artwork, not a full Live2D rig or a human/TV capture performance pass.'};
fs.writeFileSync(`${deliver}/report.json`,JSON.stringify(report,null,2));console.log({outsideMax,irisMax,independentEyeMax,resetMax,invalidInputMax,boundary,frames:frames.length});

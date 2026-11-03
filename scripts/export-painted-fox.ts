import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createPaintedFoxPainter,PAINTED_FOX_ASSETS} from '../src/learning/avatar/painted-fox';
import {demoFaceFrame,neutralFrame,type FaceFrame} from '../src/learning/avatar/face-frame';
import {PerformanceRecorder,parseAvatarTrack,sampleAvatarTrack} from '../src/learning/avatar/performance-track';
const [toolsDir,output='scratch/avatar-painted']=process.argv.slice(2);
if(!toolsDir)throw Error('Expected authoring tools directory');
const require=createRequire(`${toolsDir}/package.json`);
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const images=Object.fromEntries(await Promise.all(Object.entries(PAINTED_FOX_ASSETS).map(async([key,file])=>[key,await loadImage(`public/${file}`)])));
const surface=(w:number,h:number)=>{const c=createCanvas(w,h);return{canvas:c,context:c.getContext('2d')as CanvasRenderingContext2D};};
const painter=createPaintedFoxPainter(images as Parameters<typeof createPaintedFoxPainter>[0],surface),c=createCanvas(536,536),ctx=c.getContext('2d');
const frame=(channels:FaceFrame['channels']={},rotation:FaceFrame['rotation']=[0,0,0]):FaceFrame=>({...neutralFrame(),channels,rotation});
const poses=[frame(),frame({jawOpen:.0001}),frame({jawOpen:.25}),frame({jawOpen:.5}),frame({jawOpen:.75}),frame({jawOpen:1}),frame({mouthPucker:.9}),frame({jawOpen:.65,mouthSmileLeft:.8,mouthSmileRight:.8}),frame({eyeBlinkLeft:1,eyeBlinkRight:1}),frame({browInnerUp:.9}),frame({jawOpen:.55},[.2,-.4,-.08]),frame()];
await mkdir(output,{recursive:true});const sheet=createCanvas(536*4,572*3),s=sheet.getContext('2d');s.fillStyle='#f4f1ea';s.fillRect(0,0,sheet.width,sheet.height);s.font='20px sans-serif';
const labels=['Neutral','Open .0001','Open 25%','Open 50%','Open 75%','Open 100%','Pucker','Smile + open','Closed eyes','Brows','Head + mouth','Reset'];
for(let i=0;i<poses.length;i++){painter.draw(ctx,536,536,poses[i]);s.fillStyle='#243649';s.fillText(labels[i],i%4*536+14,Math.floor(i/4)*572+25);s.drawImage(c,i%4*536,Math.floor(i/4)*572+36);await writeFile(`${output}/pose-${i}.png`,c.toBuffer('image/png'));}
await writeFile(`${output}/poses.jpg`,sheet.toBuffer('image/jpeg',92));console.log(output);
const render=(value:FaceFrame)=>{painter.draw(ctx,536,536,value);return ctx.getImageData(0,0,536,536).data;};
const diff=(a:Uint8ClampedArray,b:Uint8ClampedArray,where:(x:number,y:number)=>boolean=()=>true)=>{let max=0;for(let y=0;y<536;y++)for(let x=0;x<536;x++)if(where(x,y))for(let ch=0;ch<4;ch++)max=Math.max(max,Math.abs(a[(y*536+x)*4+ch]-b[(y*536+x)*4+ch]));return max;};
const neutral=render(frame()),reference=createCanvas(536,536),ref=reference.getContext('2d');ref.drawImage(images.base,12,12,512,512);
const neutralMax=diff(neutral,ref.getImageData(0,0,536,536).data);
const boundaries:Record<string,unknown>={};
for(const key of ['jawOpen','mouthPucker','mouthSmileLeft','eyeBlinkLeft','eyeBlinkRight','browInnerUp']as const){
  const probes=[.0001,.000001].map(epsilon=>({epsilon,max:diff(render(frame({[key]:epsilon})),neutral)}));boundaries[key]=probes;
}
const headBoundaries=[.0001,.000001].map(epsilon=>({epsilon,max:diff(render(frame({},[epsilon,-epsilon,epsilon])),neutral)}));
const mouthOutsideMax=diff(render(frame({jawOpen:1})),neutral,(x,y)=>x<222||x>=342||y<275||y>=340);
const closedMax=diff(render(frame({jawOpen:1,mouthClose:1})),neutral);
let clothesMax=0,minHeadAlpha=255;
for(const p of [-.35,.35])for(const y of [-.45,.45])for(const r of [-.1,.1]){
  const head=render(frame({},[p,y,r]));clothesMax=Math.max(clothesMax,diff(head,neutral,(_x,yy)=>yy>=420));
  for(let yy=12;yy<524;yy++)for(let x=12;x<524;x++)minHeadAlpha=Math.min(minHeadAlpha,head[(yy*536+x)*4+3]);
}
const invalidMax=diff(render(frame({jawOpen:NaN,eyeBlinkLeft:Infinity},[NaN,Infinity,-Infinity])),neutral),resetMax=diff(render(frame()),neutral);
const report={neutralMax,mouthOutsideMax,closedMax,clothesMax,minHeadAlpha,invalidMax,resetMax,boundaries,headBoundaries,note:'Actual native Canvas pixels; not camera accuracy, browser/TV FPS or final art approval.'};
await writeFile(`${output}/render-report.json`,JSON.stringify(report,null,2));console.log(report);
if(neutralMax||mouthOutsideMax||closedMax||clothesMax||invalidMax||resetMax||minHeadAlpha!==255)throw Error('Painted portrait geometry/preservation check failed');
if(Object.values(boundaries).some(value=>(value as Array<{max:number}>)[1].max>1)||headBoundaries[1].max>1)throw Error('Painted portrait neutral continuity failed');
if(process.argv.includes('--animation')) {
  await mkdir(`${output}/frames`,{recursive:true});const timings:number[]=[],recorder=new PerformanceRecorder();recorder.begin(0);
  for(let i=0;i<160;i++){
    const timeMs=i*50,input=demoFaceFrame(timeMs),start=performance.now();painter.draw(ctx,536,536,input);timings.push(performance.now()-start);recorder.append(input,timeMs);
    await writeFile(`${output}/frames/${String(i).padStart(3,'0')}.png`,c.toBuffer('image/png'));
  }
  await writeFile(`${output}/animation-report.json`,JSON.stringify({frames:160,playbackFps:20,durationMs:8000,source:'Deterministic demoFaceFrame, no human/camera input',averageNativeDrawMs:timings.reduce((a,b)=>a+b)/timings.length,note:'Native authoring environment only, not browser or television FPS.'},null,2));
  const track=parseAvatarTrack(JSON.parse(JSON.stringify(recorder.finish(8000))));
  let roundTripMax=0;
  for(const timeMs of [0,450,2250,4000,5500,6500,7950])roundTripMax=Math.max(roundTripMax,diff(render(demoFaceFrame(timeMs)),render(sampleAvatarTrack(track,timeMs))));
  if(roundTripMax!==0)throw Error('Recorded parameter round-trip changes painted frame');
  await writeFile(`${output}/synthetic-track.json`,JSON.stringify(track));
  await writeFile(`${output}/round-trip-report.json`,JSON.stringify({frames:track.frames.length,durationMs:track.durationMs,source:'demo',maxPixelDifferenceAtRecordedFrames:roundTripMax,note:'Native recording/serialization/import/playback path; not a browser download or human recording.'},null,2));
}

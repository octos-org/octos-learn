import {createRequire} from 'node:module';
import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {FaceSmoother,mediaPipeFrame,type FaceFrame} from '../src/learning/avatar/face-frame';
import {PerformanceRecorder,parseAvatarTrack,sampleAvatarTrack} from '../src/learning/avatar/performance-track';
import {createPaintedFoxPainter,PAINTED_FOX_ASSETS,paintedBlinkAmount} from '../src/learning/avatar/painted-fox';
const [input,output,toolsDir]=process.argv.slice(2);
if(!input||!output||!toolsDir)throw Error('Expected input JSON directory, output directory and authoring tools directory');
const require=createRequire(`${toolsDir}/package.json`),{createCanvas,loadImage}=require('@napi-rs/canvas');
const images=Object.fromEntries(await Promise.all(Object.entries(PAINTED_FOX_ASSETS).map(async([key,file])=>[key,await loadImage(`public/${file}`)])));
const surface=(w:number,h:number)=>{const canvas=createCanvas(w,h);return {canvas,context:canvas.getContext('2d')as CanvasRenderingContext2D};};
const painter=createPaintedFoxPainter(images as Parameters<typeof createPaintedFoxPainter>[0],surface),canvas=createCanvas(536,536),ctx=canvas.getContext('2d');
const hash=(frame:FaceFrame)=>{painter.draw(ctx,536,536,frame);return createHash('sha256').update(ctx.getImageData(0,0,536,536).data).digest('hex');};
const keys=['eyeBlinkLeft','eyeBlinkRight','jawOpen','mouthPucker']as const;
await mkdir(output,{recursive:true});const all=[];
for(const filename of (await readdir(input)).filter(f=>f.endsWith('.json')).sort()){
  const raw=JSON.parse(await readFile(`${input}/${filename}`,'utf8'));
  const smoother=new FaceSmoother(),recorder=new PerformanceRecorder();recorder.begin(0);
  const observations:Array<{timeMs:number;phase:string;input:FaceFrame;display:FaceFrame}>=[];
  for(const entry of raw.frames){
    const frame=mediaPipeFrame(entry.timeMs,entry.categories,entry.matrix??undefined),display=smoother.update(frame,entry.timeMs);
    recorder.append(display,entry.timeMs);observations.push({timeMs:entry.timeMs,phase:entry.phase,input:frame,display});
  }
  const duration=raw.frames.at(-1).timeMs+1000/raw.inputFps,track=parseAvatarTrack(JSON.parse(JSON.stringify(recorder.finish(duration))));
  const blank=observations.filter(f=>f.phase==='blank'),recovery=observations.filter(f=>f.phase==='recovery');
  const stats=Object.fromEntries(keys.map(key=>[key,{rawMax:Math.max(...observations.map(o=>o.input.channels[key]??0)),displayMax:Math.max(...observations.map(o=>o.display.channels[key]??0)),rawHighFrames:observations.filter(o=>(o.input.channels[key]??0)>=.8).length,displayHighFrames:observations.filter(o=>(o.display.channels[key]??0)>=.8).length,
    ...(key.startsWith('eyeBlink')?{paintedLidMax:Math.max(...observations.map(o=>paintedBlinkAmount(o.display.channels[key]??0,o.display.source))),paintedNearlyClosedFrames:observations.filter(o=>paintedBlinkAmount(o.display.channels[key]??0,o.display.source)>=.98).length}:{})}]));
  const probes=[observations[0],observations[Math.floor(observations.length/3)],observations[Math.floor(observations.length*2/3)],observations.at(-1)!];
  const replayMatches=probes.every(o=>hash(o.display)===hash(sampleAvatarTrack(track,o.timeMs)));if(!replayMatches)throw Error('Real input recording replay changed pixels');
  const lossEnd=blank.at(-1)!,lossMax=Math.max(...Object.values(lossEnd.display.channels).map(v=>Math.abs(v??0)),...lossEnd.display.rotation.map(Math.abs));
  const firstBlank=blank.find(o=>!o.input.tracked),firstRecovery=recovery.find(o=>o.input.tracked);
  if(lossMax>.001||blank.some(o=>o.input.tracked)||!firstRecovery)throw Error('Real detector loss/recovery probe failed');
  const report={video:raw.video,sourceSha256:raw.sourceSha256,modelSha256:raw.modelSha256,runtime:raw.runtime,inputFps:raw.inputFps,frames:observations.length,detectedVideoFrames:observations.filter(o=>o.phase==='video'&&o.input.tracked).length,videoFrameCount:observations.filter(o=>o.phase==='video').length,channels:stats,
    rotationRanges:[0,1,2].map(axis=>({min:Math.min(...observations.filter(o=>o.input.tracked).map(o=>o.input.rotation[axis])),max:Math.max(...observations.filter(o=>o.input.tracked).map(o=>o.input.rotation[axis]))})),
    blankFrames:blank.length,blankFalsePositiveFrames:blank.filter(o=>o.input.tracked).length,lossEndMaxAbsChannelOrRotation:lossMax,
    recoveryDetected:firstRecovery!==undefined,recoveryDelayMs:firstRecovery?firstRecovery.timeMs-recovery[0].timeMs:null,lossDetectedAfterMs:firstBlank?firstBlank.timeMs-blank[0].timeMs:null,
    recordSerializeReplayHashMatches:replayMatches,processing:raw.processing,note:'Real model output from local public example video. Python CPU runtime is distinct from browser/WASM and is not user-camera/TV validation.'};
  all.push(report);await writeFile(`${output}/${filename}`,JSON.stringify(track));
  await mkdir(`${output}/${filename.replace('.json','')}-frames`,{recursive:true});
  if(process.argv.includes('--media'))for(let i=0;i<observations.length;i++){
    painter.draw(ctx,536,536,observations[i].display);await writeFile(`${output}/${filename.replace('.json','')}-frames/${String(i).padStart(4,'0')}.png`,canvas.toBuffer('image/png'));
  }
  // Retain close/open endpoints from actual detected events, never fabricated sliders.
  const most=(key:typeof keys[number])=>observations.reduce((a,b)=>(a.input.channels[key]??0)>(b.input.channels[key]??0)?a:b);
  const poses=[observations[0],most('eyeBlinkLeft'),most('eyeBlinkRight'),most('jawOpen'),lossEnd,firstRecovery??observations.at(-1)!];
  const sheet=createCanvas(1608,1144),s=sheet.getContext('2d');s.fillStyle='#f4f1ea';s.fillRect(0,0,1608,1144);s.font='18px sans-serif';
  const labels=['First detected input','Left blink peak','Right blink peak','Mouth peak','After blank inputs','Recovery'];
  for(let i=0;i<poses.length;i++){const x=i%3*536,y=Math.floor(i/3)*572;painter.draw(ctx,536,536,poses[i].display);s.fillStyle='#243649';s.fillText(`${labels[i]} / ${poses[i].timeMs}ms`,x+12,y+24);s.drawImage(canvas,x,y+36);}
  await writeFile(`${output}/${filename.replace('.json','')}-poses.jpg`,sheet.toBuffer('image/jpeg',90));
}
await writeFile(`${output}/summary.json`,JSON.stringify(all,null,2));console.log(JSON.stringify(all,null,2));

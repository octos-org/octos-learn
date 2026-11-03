/** Compare actual product painters; local synthetic controls, never camera footage. */
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createPaintedFoxPainter,PAINTED_FOX_ASSETS,paintedHeadPoint} from '../src/learning/avatar/painted-fox';
import {neutralFrame,type FaceFrame} from '../src/learning/avatar/face-frame';
import {parseAvatarTrack,sampleAvatarTrack} from '../src/learning/avatar/performance-track';

const [toolsDir,out='scratch/avatar-mouth-head/comparison',baseline='f78b4218']=process.argv.slice(2);
if(!toolsDir)throw Error('Expected authoring tools directory');
await mkdir(out,{recursive:true});
const old=execFileSync('git',['show',`${baseline}:src/learning/avatar/painted-fox.ts`],{encoding:'utf8'})
  .replaceAll('"./face-frame"',JSON.stringify(resolve('src/learning/avatar/face-frame.ts')))
  .replaceAll('"./original-fox"',JSON.stringify(resolve('src/learning/avatar/original-fox.ts')))
  .replaceAll('"./painted-eyes"',JSON.stringify(resolve('src/learning/avatar/painted-eyes.ts')))
  .replace('    draw(target:', '    headPoint,\n    draw(target:');
const oldFile=resolve(out,'baseline-painter.ts');await writeFile(oldFile,old);
const beforeModule=await import(oldFile);
const {createCanvas,loadImage}=createRequire(`${resolve(toolsDir)}/package.json`)('@napi-rs/canvas');
const images=Object.fromEntries(await Promise.all(Object.entries(PAINTED_FOX_ASSETS).map(async([key,file])=>[key,await loadImage(`public/${file}`)])));
const surface=(w:number,h:number)=>{const canvas=createCanvas(w,h);return{canvas,context:canvas.getContext('2d')as CanvasRenderingContext2D};};
const before=beforeModule.createPaintedFoxPainter(images,surface),after=createPaintedFoxPainter(images as Parameters<typeof createPaintedFoxPainter>[0],surface);
const canvas=createCanvas(536,536),ctx=canvas.getContext('2d');
const frame=(jawOpen=0,rotation:FaceFrame['rotation']=[0,0,0]):FaceFrame=>({...neutralFrame(0,'mediapipe'),tracked:true,channels:{jawOpen},rotation});
const aperture=(data:Uint8ClampedArray)=>{
  let rows=0;
  // Dark/pink oral pixels in a central strip, excluding the nose and collar.
  for(let y=260;y<326;y++){
    let covered=0;
    for(let x=255;x<=265;x++){const i=((y+12)*536+x+12)*4;if((data[i]+data[i+1]+data[i+2])/3<185)covered++;}
    if(covered>=6)rows++;
  }
  return rows;
};
const mouth=[];
for(const score of [0,.1,.25,.5,.75,1]){
  before.draw(ctx,536,536,frame(score));const beforeRows=aperture(ctx.getImageData(0,0,536,536).data);
  after.draw(ctx,536,536,frame(score));const afterRows=aperture(ctx.getImageData(0,0,536,536).data);
  mouth.push({cameraJawScore:score,beforeRows,afterRows});
}
const sheet=createCanvas(1072,1144),s=sheet.getContext('2d');s.fillStyle='#f4f1ea';s.fillRect(0,0,1072,1144);s.font='20px sans-serif';s.fillStyle='#243649';
for(const [row,input]of [frame(.5),frame(0,[.25,-.45,-.1])].entries())for(const [col,painter]of [before,after].entries()){
  painter.draw(ctx,536,536,input);s.fillText(`${col?'After':'Before'}: ${row?'head following':'camera jaw = 0.5'}`,col*536+14,row*572+25);
  s.drawImage(canvas,col*536,row*572+36);
}
await writeFile(`${out}/comparison.jpg`,sheet.toBuffer('image/jpeg',92));
const features:Array<[number,number]>=[[0,0],[512,0],[0,180],[512,180],[10,280],[500,280],[145,182],[377,182],[198,210],[328,210],[261,248],[260,276],[256,328]];
const distance=(a:number[],b:number[])=>Math.hypot(a[0]-b[0],a[1]-b[1]);
let beforeMax=0,afterMax=0;
for(const pitch of [-.35,.35])for(const yaw of [-.45,.45])for(const roll of [-.1,.1])for(let a=0;a<features.length;a++)for(let b=a+1;b<features.length;b++){
  const d=distance(features[a],features[b]);
  beforeMax=Math.max(beforeMax,Math.abs(distance(before.headPoint(features[a],pitch,yaw,roll),before.headPoint(features[b],pitch,yaw,roll))/d-1));
  afterMax=Math.max(afterMax,Math.abs(distance(paintedHeadPoint(features[a],pitch,yaw,roll),paintedHeadPoint(features[b],pitch,yaw,roll))/d-1));
}
if(mouth[3].afterRows<2*mouth[3].beforeRows||mouth[0].beforeRows!==mouth[0].afterRows||afterMax>1e-8)throw Error('Mouth travel or rigid facial core regression');
const report={baseline,source:'Synthetic MediaPipe coefficients; both painters use identical painted-v0.2 assets',mouth,
  headPairDistanceMaxRelativeError:{before:beforeMax,after:afterMax},
  limits:'Central dark/pink row count is an image measurement, not human-mouth tracking accuracy. Head geometry includes crop-edge hair/ears and measures the mesh control field, not recognition or inferred 3D rotation. Artwork outside the source crop is unavailable and may clip during movement.'};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--animation')){
  const {GIFEncoder,quantize,applyPalette}=createRequire(`${resolve(toolsDir)}/package.json`)('gifenc');
  const track=parseAvatarTrack(JSON.parse(await readFile('docs/avatar-animation-phase-a/real-input/recorded-track.json','utf8')));
  const pair=createCanvas(1072,572),p=pair.getContext('2d'),small=createCanvas(536,286),g=small.getContext('2d'),gif=GIFEncoder();
  const frames=Math.ceil(track.durationMs/100);
  for(let i=0;i<frames;i++){
    const value=sampleAvatarTrack(track,i*100);
    p.fillStyle='#f4f1ea';p.fillRect(0,0,1072,572);p.font='20px sans-serif';p.fillStyle='#243649';
    for(const [col,painter]of [before,after].entries()){
      painter.draw(ctx,536,536,value);p.fillText(`${col?'After':'Before'}: same recorded input`,col*536+14,25);p.drawImage(canvas,col*536,36);
    }
    g.drawImage(pair,0,0,536,286);const rgba=g.getImageData(0,0,536,286).data,palette=quantize(rgba,128);
    gif.writeFrame(applyPalette(rgba,palette),536,286,{palette,delay:100});
  }
  gif.finish();await writeFile(`${out}/recorded-input.gif`,gif.bytes());
  await writeFile(`${out}/animation.json`,JSON.stringify({frames,frameDelayMs:100,durationMs:frames*100,
    input:'Existing native-model recorded-track.json; same parameters replayed through old/new product painters. No new inference or camera capture.',
    limitation:'Offline GIF timing is not a live browser or device performance measurement.'},null,2)+'\n');
}

/** Render the real facial pipeline for all four portraits. No camera input. */
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {createPaintedFoxPainter,type PaintedFoxImages} from '../src/learning/avatar/painted-fox';
import {PAINTED_CHARACTERS} from '../src/learning/avatar/painted-characters';
import {LOCAL_RIG_ASSETS,type LocalRigImages} from '../src/learning/avatar/painted-local-rig';
import {neutralFrame,FACE_CHANNELS,type FaceFrame} from '../src/learning/avatar/face-frame';
import {createEarInertia,FOX_EAR_INERTIA} from '../src/learning/avatar/ear-inertia';
const[toolsDir,out='scratch/avatar-expressions']=process.argv.slice(2);if(!toolsDir)throw Error('Expected native tools directory');
const require=createRequire(`${resolve(toolsDir)}/package.json`),{createCanvas,loadImage}=require('@napi-rs/canvas');
const surface=(w:number,h:number)=>{const canvas=createCanvas(w,h);return{canvas,context:canvas.getContext('2d') as CanvasRenderingContext2D};};
const local=Object.fromEntries(await Promise.all(Object.entries(LOCAL_RIG_ASSETS).map(async([k,p])=>[k,await loadImage('public/'+p)]))) as LocalRigImages;
const samples:Array<{id:string;channels:FaceFrame['channels']}>= [
 {id:'neutral',channels:{}},{id:'frown-brows',channels:{browDownLeft:1,browDownRight:1}},
 {id:'raised-brows',channels:{browInnerUp:1,browOuterUpLeft:1,browOuterUpRight:1}},
 {id:'left-brow',channels:{browOuterUpLeft:1}},{id:'right-brow',channels:{browOuterUpRight:1}},{id:'worried',channels:{browInnerUp:1}},
 {id:'open',channels:{jawOpen:.65}},{id:'pressed',channels:{mouthPressLeft:1,mouthPressRight:1}},
 {id:'pucker',channels:{mouthPucker:1}},{id:'funnel',channels:{mouthFunnel:1}},{id:'wide',channels:{mouthStretchLeft:1,mouthStretchRight:1,jawOpen:.3}},
 {id:'smile',channels:{mouthSmileLeft:1,mouthSmileRight:1}},{id:'frown-mouth',channels:{mouthFrownLeft:1,mouthFrownRight:1}},
 {id:'smirk-left',channels:{mouthSmileLeft:1}},{id:'smirk-right',channels:{mouthSmileRight:1}},
 {id:'shift-left',channels:{mouthLeft:1,jawOpen:.2}},{id:'shift-right',channels:{mouthRight:1,jawOpen:.2}},
 {id:'upper-up',channels:{mouthUpperUpLeft:1,mouthUpperUpRight:1}},
 {id:'lower-down',channels:{mouthLowerDownLeft:1,mouthLowerDownRight:1}},
 {id:'roll-upper',channels:{mouthRollUpper:1}},{id:'roll-lower',channels:{mouthRollLower:1}},
 {id:'close-override',channels:{jawOpen:1,mouthClose:1}},
];
const records=[];const compare=(a:Uint8ClampedArray,b:Uint8ClampedArray,region:(x:number,y:number)=>boolean)=>{
 let max=0,count=0,total=0;for(let y=0;y<736;y++)for(let x=0;x<736;x++)if(region(x,y)){const i=(y*736+x)*4;let difference=0;for(let c=0;c<3;c++){const d=Math.abs(a[i+c]-b[i+c]);max=Math.max(max,d);difference=Math.max(difference,d);total+=d;}if(difference>8)count++;}return{max,count,total};
};
await mkdir(out,{recursive:true});
for(const character of PAINTED_CHARACTERS){
 const images=Object.fromEntries(await Promise.all(Object.entries(character.assets).map(async([k,p])=>[k,await loadImage('public/'+p)]))) as PaintedFoxImages;
 const painter=createPaintedFoxPainter(images,surface,character.rig,character.id==='star-fox'?local:undefined),canvas=createCanvas(736,736),ctx=canvas.getContext('2d');
 const draw=(channels:FaceFrame['channels'])=>{painter.draw(ctx,736,736,{...neutralFrame(0),tracked:true,channels});return ctx.getImageData(0,0,736,736).data;};
 const neutral=draw({}),brows=createCanvas(1440,350),b=brows.getContext('2d'),mouths=createCanvas(1440,600),m=mouths.getContext('2d');b.fillStyle='#e7edf0';b.fillRect(0,0,1440,350);m.fillStyle='#e7edf0';m.fillRect(0,0,1440,600);b.font=m.font='15px sans-serif';
 const changes:Record<string,ReturnType<typeof compare>>={};let protectedMax=0,closeMax=0,minAlpha=255,oppositeBrowMax=0,returnMax=0;
 for(const[i,sample]of samples.entries()){
  const current=draw(sample.channels);for(let y=16;y<720;y++)for(let x=16;x<720;x++)minAlpha=Math.min(minAlpha,current[(y*736+x)*4+3]);
  changes[sample.id]=compare(current,neutral,(x,y)=>i<6?x>235&&x<515&&y>300&&y<470:x>300&&x<455&&y>445&&y<555);
  protectedMax=Math.max(protectedMax,compare(current,neutral,(x,y)=>y>565||y<280||x<200||x>550).max);
  if(sample.id==='close-override')closeMax=changes[sample.id].max;
  if(sample.id==='left-brow')oppositeBrowMax=compare(current,neutral,(x,y)=>x>380&&x<510&&y>315&&y<425).max;
  if(i<6){b.drawImage(canvas,235,300,280,200,i*240,35,240,230);b.fillStyle='#26384b';b.fillText(sample.id,i*240+10,23);}
  else{const j=i-6,col=j%6,row=Math.floor(j/6);m.drawImage(canvas,300,445,155,110,col*240,row*200+30,240,165);m.fillStyle='#26384b';m.fillText(sample.id,col*240+10,row*200+23);}
 }
 for(const channels of[{browDownLeft:1,browDownRight:1},{browOuterUpLeft:1},{mouthPressLeft:1,mouthPressRight:1},{mouthPucker:1},{mouthSmileLeft:1}] as FaceFrame['channels'][]){
  for(let step=0;step<=20;step++)draw(Object.fromEntries(Object.entries(channels).map(([k,v])=>[k,v!*step/20])));
  for(let step=20;step>=0;step--)draw(Object.fromEntries(Object.entries(channels).map(([k,v])=>[k,v!*step/20])));
  returnMax=Math.max(returnMax,compare(draw({}),neutral,()=>true).max);
 }
 draw(Object.fromEntries(FACE_CHANNELS.map(k=>[k,1])));for(const n of ctx.getImageData(0,0,736,736).data)if(!Number.isFinite(n))throw Error('Non-finite rendered color');
 const motion=createEarInertia(character.rig?.earInertia),profile=character.rig?.earInertia??FOX_EAR_INERTIA;let peak=0;motion.sample(0,0,0,0);for(let t=33;t<=3000;t+=33){const p=motion.sample(0,.4,0,t);peak=Math.max(peak,...Object.values(p).map(Math.abs));}
 records.push({character:character.id,changes,protectedMax,closeMax,minAlpha,oppositeBrowMax,returnMax,ear:{peak,maxAngle:profile.maxAngle,frequency:profile.frequency}});
 await writeFile(`${out}/${character.id}-brows.jpg`,brows.toBuffer('image/jpeg',97));await writeFile(`${out}/${character.id}-mouths.jpg`,mouths.toBuffer('image/jpeg',97));
}
const files=[...new Set(['src/learning/avatar/painted-expressions.ts','src/learning/avatar/painted-fox.ts','src/learning/avatar/painted-characters.ts','src/learning/avatar/painted-local-rig.ts','src/learning/avatar/painted-eyes.ts','src/learning/avatar/ear-inertia.ts','src/learning/avatar/avatar-lab-page.tsx','src/learning/avatar/avatar-lab.css','src/learning/avatar/expression-samples.ts','src/learning/avatar/face-frame.ts','scripts/avatar-expressions-validate.ts',...Object.values(LOCAL_RIG_ASSETS).map(p=>'public/'+p),...PAINTED_CHARACTERS.flatMap(c=>Object.values(c.assets).map(p=>'public/'+p))])];
const inputSha256=Object.fromEntries(await Promise.all(files.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
const report={schema:'avatar-expressions/1',characters:records,inputSha256,scope:'Actual renderer; synthetic channels. Deliberately visible neutral brow layer. No real browser/camera acceptance.'};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(records.map(r=>({character:r.character,protectedMax:r.protectedMax,closeMax:r.closeMax,ear:r.ear,changes:Object.fromEntries(Object.entries(r.changes).map(([k,v])=>[k,v.count]))}))));
if(!process.argv.includes('--diagnostic')&&(records.some(r=>r.protectedMax>1||r.closeMax>1||r.minAlpha!==255||r.oppositeBrowMax>1||r.returnMax>1||samples.slice(1,-1).some(s=>r.changes[s.id].count<8))||records[2].ear.peak<records[0].ear.peak*1.8))throw Error('Expression or per-character ear validation failed');

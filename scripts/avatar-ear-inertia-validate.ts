/** Current acceptance: original ears, passive small-angle follow-through.
 * Synthetic product-renderer output; no browser or camera acceptance implied. */
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {PAINTED_CHARACTERS} from '../src/learning/avatar/painted-characters';
import {createPaintedFoxPainter,type PaintedFoxImages,paintedHeadPoint} from '../src/learning/avatar/painted-fox';
import {LOCAL_RIG_ASSETS,localEarSwayPoint,LOCAL_EAR_ATTACHMENT,type LocalRigImages,starFoxNaturalPose} from '../src/learning/avatar/painted-local-rig';
import {STAR_FOX_RIGHT_EAR} from '../src/learning/avatar/star-fox-parts';
import {neutralFrame} from '../src/learning/avatar/face-frame';
import {FOX_MOTION} from '../src/learning/avatar/painted-secondary-motion';
import {createEarInertia,MAX_EAR_SWAY,FOX_EAR_INERTIA} from '../src/learning/avatar/ear-inertia';
const[toolsDir,out='scratch/ear-inertia']=process.argv.slice(2);if(!toolsDir)throw Error('Expected native tools directory');
const require=createRequire(`${resolve(toolsDir)}/package.json`),{createCanvas,loadImage}=require('@napi-rs/canvas'),{GIFEncoder,quantize,applyPalette}=require('gifenc');
const surface=(w:number,h:number)=>{const canvas=createCanvas(w,h);return{canvas,context:canvas.getContext('2d') as CanvasRenderingContext2D};};
const local=Object.fromEntries(await Promise.all(Object.entries(LOCAL_RIG_ASSETS).map(async([k,p])=>[k,await loadImage('public/'+p)]))) as LocalRigImages;
const sheets=createCanvas(1280,1260),s=sheets.getContext('2d');s.fillStyle='#e7edf0';s.fillRect(0,0,1280,1260);s.font='17px sans-serif';s.fillStyle='#26384b';
const records=[];let starFoxPainter:ReturnType<typeof createPaintedFoxPainter>|undefined;
const maxDiff=(a:Uint8ClampedArray,b:Uint8ClampedArray,points:number[][])=>{
 let max=0;for(const[x,y]of points)for(let dy=-12;dy<=12;dy++)for(let dx=-12;dx<=12;dx++){
  const i=((Math.round(y)+dy)*736+Math.round(x)+dx)*4;for(let c=0;c<3;c++)max=Math.max(max,Math.abs(a[i+c]-b[i+c]));
 }return max;
};
for(const[index,character]of PAINTED_CHARACTERS.entries()){
 const images=Object.fromEntries(await Promise.all(Object.entries(character.assets).map(async([k,p])=>[k,await loadImage('public/'+p)]))) as PaintedFoxImages;
 const painter=createPaintedFoxPainter(images,surface,character.rig,character.id==='star-fox'?local:undefined),canvas=createCanvas(736,736),ctx=canvas.getContext('2d');
 if(index===0)starFoxPainter=painter;
 const profile=character.rig?.motion??FOX_MOTION,points=profile.ears.map(ear=>[ear.root[0]*.2+ear.tip[0]*.8+112,ear.root[1]*.2+ear.tip[1]*.8+208]);
 painter.draw(ctx,736,736,neutralFrame(0),{timeMs:0,idleMotion:true});const rest=ctx.getImageData(0,0,736,736).data;let idleEarMax=0,heldEarMax=0;
 for(let time=100;time<=30000;time+=100){painter.draw(ctx,736,736,neutralFrame(time),{timeMs:time,idleMotion:true});idleEarMax=Math.max(idleEarMax,maxDiff(rest,ctx.getImageData(0,0,736,736).data,points));}
 const yaw=.35;painter.draw(ctx,736,736,{...neutralFrame(0),rotation:[0,-yaw,0]},{timeMs:0,idleMotion:true});const held=ctx.getImageData(0,0,736,736).data;
 const turnedPoints=points.map(([x,y])=>{const p=paintedHeadPoint([x-112,y-208],0,yaw,0);return[p[0]+112,p[1]+208];});
 for(let time=100;time<=30000;time+=100){painter.draw(ctx,736,736,{...neutralFrame(time),rotation:[0,-yaw,0]},{timeMs:time,idleMotion:true});heldEarMax=Math.max(heldEarMax,maxDiff(held,ctx.getImageData(0,0,736,736).data,turnedPoints));}
 const first=createCanvas(736,736),f=first.getContext('2d');painter.draw(f,736,736,neutralFrame(0));s.drawImage(first,index*320,30,320,320);s.fillText(character.id,index*320+8,23);
 const inertia=character.rig?.earInertia??FOX_EAR_INERTIA,controller=createEarInertia(inertia);controller.sample(0,0,0,0);let peak=0;
 for(let time=33;time<=3000;time+=33){const p=controller.sample(0,.4,0,time);peak=Math.max(peak,...Object.values(p).map(Math.abs));}
 records.push({character:character.id,idleEarMax,heldEarMax,peak,maxAngle:inertia.maxAngle});
}
let tipMax=0,rootMax=0;
for(const right of[false,true])for(let step=-25;step<=25;step++){
 const angle=step/25*MAX_EAR_SWAY,tip:[number,number]=right?[574,85]:[130,85],moved=localEarSwayPoint(tip,angle,right);tipMax=Math.max(tipMax,Math.hypot(moved[0]-tip[0],moved[1]-tip[1]));
 for(const p of right?STAR_FOX_RIGHT_EAR.attachment:LOCAL_EAR_ATTACHMENT){const q=localEarSwayPoint(p,angle,right);rootMax=Math.max(rootMax,Math.hypot(q[0]-p[0],q[1]-p[1]));}
}
const motion=createEarInertia(),canvas=createCanvas(736,736),ctx=canvas.getContext('2d'),video=createCanvas(512,560),v=video.getContext('2d'),gif=GIFEncoder();
const smooth=(x:number)=>x*x*(3-2*x);
const yawAt=(t:number)=>t<500?0:t<800?.35*smooth((t-500)/300):t<1500?.35:t<1850?.35-.7*smooth((t-1500)/350):t<2600?-.35:t<2950?-.35+.35*smooth((t-2600)/350):0;
const snapshots=[17,22,29,46,52,62,81,95],angles=[];let peakAngle=0,rebound=false,settling=false;
for(let i=0;i<=150;i++){
 const time=i*1000/30,yaw=yawAt(time),p=motion.sample(0,yaw,0,time);peakAngle=Math.max(peakAngle,...Object.values(p).map(Math.abs));if(time>800&&time<1500&&p.leftTilt>0)rebound=true;
 settling=starFoxPainter!.draw(ctx,736,736,{...neutralFrame(time),rotation:[0,-yaw,0]},{timeMs:time}).settling;angles.push({timeMs:time,yaw,...p});
 const index=snapshots.indexOf(i);if(index>=0){const col=index%4,row=1+Math.floor(index/4);s.drawImage(canvas,col*320,row*400-20,320,320);s.fillStyle='#26384b';s.fillText(`${(time/1000).toFixed(2)}s`,col*320+10,row*400-25);}
 if(!process.argv.includes('--stills-only')&&i<150){v.fillStyle='#f4f1e8';v.fillRect(0,0,512,560);v.drawImage(canvas,0,40,512,512);v.fillStyle='#26384b';v.font='18px sans-serif';v.fillText('Passive ear follow-through',12,27);const rgba=v.getImageData(0,0,512,560).data,palette=quantize(rgba,160);gif.writeFrame(applyPalette(rgba,palette),512,560,{palette,delay:1000/30,repeat:0});}
}
const idleStates=Array.from({length:600},(_,i)=>starFoxNaturalPose(i*100)),idleEarEvents=idleStates.filter(p=>p.ear!==0||p.rightEar!==0).length;
const files=[...new Set(['src/learning/avatar/ear-inertia.ts','src/learning/avatar/painted-local-rig.ts','src/learning/avatar/painted-fox.ts','src/learning/avatar/painted-expressions.ts','src/learning/avatar/painted-secondary-motion.ts','src/learning/avatar/painted-characters.ts','src/learning/avatar/illustrated-avatar-stage.tsx','src/learning/avatar/avatar-lab-page.tsx','scripts/avatar-ear-inertia-validate.ts',...Object.values(LOCAL_RIG_ASSETS).map(p=>'public/'+p),...PAINTED_CHARACTERS.flatMap(c=>Object.values(c.assets).map(p=>'public/'+p))])];
const inputSha256=Object.fromEntries(await Promise.all(files.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
const report={schema:'passive-ear-inertia/1',characters:records,maxAngleRadians:MAX_EAR_SWAY,peakAngle,tipMax,rootMax,idleEarEvents,rebound,settled:!settling,finalEarPose:angles.at(-1),inputSha256,scope:'Actual product renderer, original ear texture, no active turns. Synthetic input; no real browser/camera/device acceptance.'};
await mkdir(out,{recursive:true});await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');await writeFile(`${out}/poses.jpg`,sheets.toBuffer('image/jpeg',96));await writeFile(`${out}/angles.json`,JSON.stringify(angles)+'\n');
if(!process.argv.includes('--stills-only')){gif.finish();await writeFile(`${out}/sample.gif`,gif.bytes());}
console.log(JSON.stringify(report));
if(records.some(r=>r.idleEarMax>1||r.heldEarMax>1)||tipMax>=6||rootMax>1e-9||idleEarEvents||peakAngle>MAX_EAR_SWAY||!rebound||settling||angles.at(-1)!.leftTilt!==0||angles.at(-1)!.rightTilt!==0)throw Error('Passive ear follow-through validation failed');

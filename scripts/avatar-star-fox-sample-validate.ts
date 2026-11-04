import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {createPaintedFoxPainter,PAINTED_FOX_ASSETS,type PaintedFoxImages} from '../src/learning/avatar/painted-fox';
import {LOCAL_RIG_ASSETS,createLocalRigPainter,type LocalRigImages,type LocalRigPose,localRightEarPoint,starFoxHairPoint,starFoxNaturalPose} from '../src/learning/avatar/painted-local-rig';
import {STAR_FOX_HAIR,STAR_FOX_RIGHT_EAR} from '../src/learning/avatar/star-fox-parts';
import {neutralFrame,type FaceFrame} from '../src/learning/avatar/face-frame';
import {createPaintedSecondaryMotion} from '../src/learning/avatar/painted-secondary-motion';
const[toolsDir,output='scratch/star-fox-sample']=process.argv.slice(2);if(!toolsDir)throw Error('Expected authoring tools directory');
const require=createRequire(`${resolve(toolsDir)}/package.json`),{createCanvas,loadImage,GlobalFonts}=require('@napi-rs/canvas'),{GIFEncoder,quantize,applyPalette}=require('gifenc');GlobalFonts.registerFromPath('/System/Library/Fonts/STHeiti Medium.ttc','AvatarChinese');
const surface=(w:number,h:number)=>{const canvas=createCanvas(w,h);return{canvas,context:canvas.getContext('2d') as CanvasRenderingContext2D};};
const images=Object.fromEntries(await Promise.all(Object.entries(PAINTED_FOX_ASSETS).map(async([key,path])=>[key,await loadImage('public/'+path)]))) as PaintedFoxImages;
const local=Object.fromEntries(await Promise.all(Object.entries(LOCAL_RIG_ASSETS).map(async([key,path])=>[key,await loadImage('public/'+path)]))) as LocalRigImages;
const old=createPaintedFoxPainter(images,surface),painter=createPaintedFoxPainter(images,surface,{},local),canvas=createCanvas(736,736),ctx=canvas.getContext('2d');
const rest:LocalRigPose={ear:0,rightEar:0,hair:0,leftHair:0,forelock:0};
const render=(pose:LocalRigPose=rest,channels:FaceFrame['channels']={},rotation:FaceFrame['rotation']=[0,0,0],timeMs=0,idle=false)=>{painter.draw(ctx,736,736,{...neutralFrame(timeMs),channels,rotation},{localPose:idle?undefined:pose,timeMs,idleMotion:idle});return ctx.getImageData(0,0,736,736).data;};
await mkdir(output,{recursive:true});
const difference=(a:Uint8ClampedArray,b:Uint8ClampedArray,region=(x:number,y:number)=>x>=16&&x<720&&y>=16&&y<720)=>{let max=0,count=0,total=0,changed=0;for(let y=0;y<736;y++)for(let x=0;x<736;x++)if(region(x,y)){let d=0;for(let c=0;c<3;c++){const v=Math.abs(a[(y*736+x)*4+c]-b[(y*736+x)*4+c]);d=Math.max(d,v);total+=v;count++;}max=Math.max(max,d);if(d>3)changed++;}return{max,mean:total/count,changed};};
old.draw(ctx,736,736,neutralFrame(0));const baseline=ctx.getImageData(0,0,736,736).data,neutral=render();
let minAlpha=255,expressionMax=0,bodyMax=0,rightSeamDistance=0,minimumPartTriangle=Infinity;
const protectedFace=(x:number,y:number)=>x>=250&&x<510&&y>=355&&y<540&&!(x>=316&&x<430&&y>=450&&y<550);
for(const channels of[{jawOpen:1},{jawOpen:.3,mouthPucker:1},{browInnerUp:1,browOuterUpLeft:1,browOuterUpRight:1},{browDownLeft:1,browDownRight:1},{eyeBlinkLeft:1,eyeBlinkRight:1},{mouthSmileLeft:1,mouthFrownRight:.8}]){
 old.draw(ctx,736,736,{...neutralFrame(0),channels});const before=ctx.getImageData(0,0,736,736).data,after=render(rest,channels);expressionMax=Math.max(expressionMax,difference(before,after,protectedFace).max);
}
for(let n=0;n<=20;n++){
 const value=-1+n*.1,pose={ear:Math.max(-.4,value),rightEar:Math.max(-.4,-value),hair:value,leftHair:-value,forelock:value},pixels=render(pose);
 bodyMax=Math.max(bodyMax,difference(pixels,neutral,(_x,y)=>y>=560&&y<720).max);
 for(let y=16;y<720;y++)for(let x=16;x<720;x++)minAlpha=Math.min(minAlpha,pixels[(y*736+x)*4+3]);
 for(const point of STAR_FOX_RIGHT_EAR.attachment){const p=localRightEarPoint(point,value);rightSeamDistance=Math.max(rightSeamDistance,Math.hypot(p[0]-point[0],p[1]-point[1]));}
 for(const part of STAR_FOX_HAIR){const[x,y,w,h]=part.box;for(let yy=0;yy<12;yy++)for(let xx=0;xx<12;xx++){
  const p=([[x+xx*w/12,y+yy*h/12],[x+(xx+1)*w/12,y+yy*h/12],[x+xx*w/12,y+(yy+1)*h/12],[x+(xx+1)*w/12,y+(yy+1)*h/12]] as [number,number][]).map(v=>starFoxHairPoint(v,value,part));
  for(const[a,b,c]of[[0,1,2],[1,3,2]]){const area=(p[b][0]-p[a][0])*(p[c][1]-p[a][1])-(p[c][0]-p[a][0])*(p[b][1]-p[a][1]);minimumPartTriangle=Math.min(minimumPartTriangle,area/((w/12)*(h/12)));}
 }}
}
const staged=surface(704,704),partPainter=createLocalRigPainter(local,surface);partPainter.drawRightEar(staged.context,0);const earNeutral=staged.context.getImageData(0,0,704,704).data;let rightRootMax=0;
for(const value of[-.4,.3,.6,1]){staged.context.clearRect(0,0,704,704);partPainter.drawRightEar(staged.context,value);const p=staged.context.getImageData(0,0,704,704).data;for(const point of STAR_FOX_RIGHT_EAR.attachment)for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){const i=((point[1]+dy)*704+point[0]+dx)*4;for(let c=0;c<4;c++)rightRootMax=Math.max(rightRootMax,Math.abs(p[i+c]-earNeutral[i+c]));}}
const mouthCanvas=createCanvas(1280,440),mc=mouthCanvas.getContext('2d');mc.fillStyle='#f4f1e6';mc.fillRect(0,0,1280,440);mc.font='17px AvatarChinese';mc.fillStyle='#243649';
const mouthSamples:Array<{id:string;label:string;channels:FaceFrame['channels']}>= [
 {id:'closed',label:'自然闭口',channels:{}},{id:'micro',label:'微开口',channels:{jawOpen:.1}},{id:'normal',label:'自然张口',channels:{jawOpen:.65}},{id:'open',label:'大开口',channels:{jawOpen:1}},
 {id:'pucker',label:'闭嘴圆唇',channels:{mouthPucker:1}},{id:'round',label:'圆唇张口',channels:{jawOpen:.65,mouthPucker:1}},{id:'wide',label:'横向张口',channels:{jawOpen:.65,mouthStretchLeft:1,mouthStretchRight:1}},{id:'closeOverride',label:'主动闭合',channels:{jawOpen:1,mouthClose:1}},
];
const mouthBounds:Record<string,{width:number;height:number;count:number}>={};let mouthCloseMax=0;
for(const[i,sample]of mouthSamples.entries()){
 const p=render(rest,sample.channels);let minX=736,minY=736,maxX=0,maxY=0,count=0;
 for(let y=478;y<540;y++)for(let x=322;x<430;x++){const k=(y*736+x)*4,changed=Math.max(Math.abs(p[k]-neutral[k]),Math.abs(p[k+1]-neutral[k+1]),Math.abs(p[k+2]-neutral[k+2]))>8;if(changed&&p[k]<235&&p[k+1]<150&&p[k+2]<150&&p[k]>p[k+1]*1.25){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;}}
 mouthBounds[sample.id]={width:count?maxX-minX+1:0,height:count?maxY-minY+1:0,count};
 if(sample.id==='closeOverride')mouthCloseMax=difference(p,neutral,(x,y)=>x>=322&&x<430&&y>=460&&y<540).max;
 const col=i%4,row=Math.floor(i/4);mc.drawImage(canvas,320,455,110,85,col*320+12,row*220+30,294,180);mc.fillStyle='#243649';mc.fillText(sample.label,col*320+12,row*220+23);
}
await writeFile(output+'/mouth-shapes.jpg',mouthCanvas.toBuffer('image/jpeg',97));
const naturalStates=Array.from({length:880},(_,i)=>starFoxNaturalPose(i*100)),natural={states:naturalStates.length,leftActive:naturalStates.filter(p=>p.ear>.001).length,rightActive:naturalStates.filter(p=>(p.rightEar??0)>.001).length,overlap:naturalStates.filter(p=>p.ear>.001&&(p.rightEar??0)>.001).length,quiet:naturalStates.filter(p=>p.ear===0&&p.rightEar===0).length,settled:0};
const settle=createPaintedSecondaryMotion();settle.sample(0,0,0,0);for(let t=33;t<600;t+=33)settle.sample(0,.4,.1,t);for(let t=600;t<4000;t+=33)settle.sample(0,0,0,t);natural.settled=Math.max(...Object.values(settle.sample(0,0,0,4000)).map(Math.abs));
const inputFiles=['src/learning/avatar/painted-local-rig.ts','src/learning/avatar/star-fox-parts.ts','src/learning/avatar/painted-fox.ts','src/learning/avatar/painted-secondary-motion.ts','src/learning/avatar/avatar-lab-page.tsx','src/learning/avatar/illustrated-avatar-stage.tsx','src/learning/avatar/avatar-audio-preview.tsx','src/learning/avatar/face-frame.ts',...Object.values(LOCAL_RIG_ASSETS).map(path=>'public/'+path)];
const inputSha256=Object.fromEntries(await Promise.all(inputFiles.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
const neutralDiff=difference(baseline,neutral),report={neutralDiff,expressionMax,bodyMax,minAlpha,rightSeamDistance,rightRootMax,minimumPartTriangle,mouthCloseMax,mouthBounds,natural,inputSha256,scope:'Actual product painter; both independent ears and three authored hair groups, synthetic controls, no browser/device acceptance.'};
await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');
const still=createCanvas(1280,760),s=still.getContext('2d');s.fillStyle='#f4f1e6';s.fillRect(0,0,1280,760);s.font='18px AvatarChinese';s.fillStyle='#243649';
const samples:Array<{label:string;pose:LocalRigPose;channels?:FaceFrame['channels']}>= [
 {label:'自然 / 基线',pose:rest},{label:'左耳',pose:{...rest,ear:1}},{label:'右耳',pose:{...rest,rightEar:1}},{label:'双耳独立',pose:{...rest,ear:.8,rightEar:.4}},
 {label:'两侧发束',pose:{...rest,hair:1,leftHair:-1}},{label:'刘海轻摆',pose:{...rest,forelock:1}},{label:'大开口',pose:rest,channels:{jawOpen:1}},{label:'圆唇',pose:rest,channels:{jawOpen:.65,mouthPucker:1}},
];for(const[i,sample]of samples.entries()){render(sample.pose,sample.channels);const col=i%4,row=Math.floor(i/4);s.drawImage(canvas,col*320,row*380+30,320,340);s.fillStyle='#243649';s.fillText(sample.label,col*320+10,row*380+23);}
await writeFile(output+'/poses.jpg',still.toBuffer('image/jpeg',96));
// A separate alpha sheet makes stray tips visible before movement can hide them.
const sheet=createCanvas(1050,370),m=sheet.getContext('2d');m.fillStyle='#c9cfd5';m.fillRect(0,0,1050,370);m.font='18px AvatarChinese';m.fillStyle='#243649';for(const[i,part]of STAR_FOX_HAIR.entries()){const[x,y,w,h]=part.box;m.drawImage(local[part.id],x,y,w,h,i*350+10,40,330,290);m.fillText(part.id,i*350+10,25);}await writeFile(output+'/hair-layers.jpg',sheet.toBuffer('image/jpeg',96));
console.log(JSON.stringify(report));
if(process.argv.includes('--diagnostic'))process.exit(0);
if(neutralDiff.max>1||expressionMax>1||bodyMax||minAlpha!==255||rightSeamDistance>1e-8||rightRootMax>1||minimumPartTriangle<.35||mouthCloseMax>1||mouthBounds.wide.width<=mouthBounds.round.width*1.5||mouthBounds.wide.height>=mouthBounds.normal.height||mouthBounds.open.count<=mouthBounds.micro.count*2||natural.overlap||natural.quiet<natural.states*.7||natural.settled>.001)throw Error('Star Fox material, geometry, mouth-shape or idle regression');
if(!process.argv.includes('--stills-only')){
 const video=createCanvas(512,560),v=video.getContext('2d'),gif=GIFEncoder(),board=createCanvas(1280,740),b=board.getContext('2d');b.fillStyle='#f4f1e6';b.fillRect(0,0,1280,740);b.font='16px AvatarChinese';const snapshots=[15,25,35,45,55,65,125,165];
 for(let i=0;i<180;i++){const t=i/10,a=t<1?0:t<2?Math.sin((t-1)*Math.PI/2):t<3?1:t<4?Math.cos((t-3)*Math.PI):t<5?-1:t<6?-Math.cos((t-5)*Math.PI/2):0;
  painter.draw(ctx,736,736,{...neutralFrame(i*100),rotation:[.12*a,.4*a,.1*a],channels:{jawOpen:i>150?.5+.4*Math.sin(t*5):0,mouthPucker:i>160?.7:0}},{timeMs:i*100,idleMotion:true});
  v.fillStyle='#f4f1e6';v.fillRect(0,0,512,560);v.drawImage(canvas,0,40,512,512);v.fillStyle='#243649';v.font='17px AvatarChinese';v.fillText('双耳 / 两侧发束 / 刘海 / 高清嘴部',12,27);
  const index=snapshots.indexOf(i);if(index>=0){const col=index%4,row=Math.floor(index/4);b.drawImage(canvas,col*320,row*370+30,320,330);b.fillStyle='#243649';b.fillText(t.toFixed(1)+' 秒',col*320+10,row*370+23);}
  const rgba=v.getImageData(0,0,512,560).data,palette=quantize(rgba,160);gif.writeFrame(applyPalette(rgba,palette),512,560,{palette,delay:100});}
 gif.finish();await writeFile(output+'/sample.gif',gif.bytes());
 await writeFile(output+'/following-poses.jpg',board.toBuffer('image/jpeg',96));
 const idleSample=Array.from({length:500},(_,i)=>starFoxNaturalPose(i*100));await writeFile(output+'/idle-schedule.json',JSON.stringify(idleSample)+'\n');
}

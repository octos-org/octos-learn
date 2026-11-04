import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPaintedFoxPainter, PAINTED_FOX_ASSETS, type PaintedFoxImages } from '../src/learning/avatar/painted-fox';
import { LOCAL_RIG_ASSETS, LOCAL_HAIR_CHAIN, LOCAL_EAR_ROOT, localEarPoint, localHairPoint, createLocalRigPainter, type LocalRigImages, type LocalRigPose } from '../src/learning/avatar/painted-local-rig';
import { neutralFrame, type FaceFrame } from '../src/learning/avatar/face-frame';
const [toolsDir, output='scratch/avatar-local-rig'] = process.argv.slice(2); if (!toolsDir) throw Error('Expected authoring tools directory');
const require=createRequire(`${resolve(toolsDir)}/package.json`), {createCanvas,loadImage,GlobalFonts}=require('@napi-rs/canvas'), {GIFEncoder,quantize,applyPalette}=require('gifenc');
GlobalFonts.registerFromPath('/System/Library/Fonts/STHeiti Medium.ttc','AvatarChinese');
const surface=(w:number,h:number)=>{const canvas=createCanvas(w,h);return{canvas,context:canvas.getContext('2d') as CanvasRenderingContext2D};};
const images=Object.fromEntries(await Promise.all(Object.entries(PAINTED_FOX_ASSETS).map(async([key,path])=>[key,await loadImage('public/'+path)]))) as PaintedFoxImages;
const local=Object.fromEntries(await Promise.all(Object.entries(LOCAL_RIG_ASSETS).map(async([key,path])=>[key,await loadImage('public/'+path)]))) as LocalRigImages;
const old=createPaintedFoxPainter(images,surface),next=createPaintedFoxPainter(images,surface,{},local),canvas=createCanvas(736,736),ctx=canvas.getContext('2d');
const render=(p:typeof old,frame:FaceFrame,pose?:LocalRigPose,idle=false)=>{p.draw(ctx,736,736,frame,{timeMs:frame.timeMs,localPose:pose,idleMotion:idle});return ctx.getImageData(0,0,736,736).data;};
await mkdir(output,{recursive:true});
const original=render(old,neutralFrame(0)),reconstructed=render(next,neutralFrame(0),{ear:0,hair:0});
const diff=(a:Uint8ClampedArray,b:Uint8ClampedArray,region=(x:number,y:number)=>x>=16&&x<720&&y>=16&&y<720)=>{let max=0,total=0,count=0,changed=0;for(let y=0;y<736;y++)for(let x=0;x<736;x++)if(region(x,y)){let d=0;for(let c=0;c<3;c++){const v=Math.abs(a[(y*736+x)*4+c]-b[(y*736+x)*4+c]);total+=v;count++;d=Math.max(d,v);}max=Math.max(max,d);if(d>3)changed++;}return{max,mean:total/count,changed};};
const face=(x:number,y:number)=>x>=250&&x<500&&y>=355&&y<540,body=(_x:number,y:number)=>y>=560&&y<720;
const report:Record<string,unknown>={neutral:diff(original,reconstructed),faceNeutral:diff(original,reconstructed,face)};
const earStage=surface(704,704),materialStage=surface(704,704),localPainter=createLocalRigPainter(local,surface);
materialStage.context.drawImage(local.foreground,0,0);const foreground=materialStage.context.getImageData(0,0,704,704).data;
materialStage.context.clearRect(0,0,704,704);materialStage.context.drawImage(local.hair,0,0);const hairMaterial=materialStage.context.getImageData(0,0,704,704).data;
const rootPixels=(value:number)=>{earStage.context.clearRect(0,0,704,704);localPainter.drawEar(earStage.context,value);return earStage.context.getImageData(0,0,704,704).data;};
const earNeutral=rootPixels(0);let rootBandMaxDifference=0,visibleRootPixels=0,minimumScalpOverlap=Infinity,neighborTipAlpha=0;
for(let y=270;y<330;y++)for(let x=95;x<270;x++){const i=(y*704+x)*4;if(earNeutral[i+3]>128&&foreground[i+3]<128)visibleRootPixels++;}
for(let value=-.4;value<=1;value+=.05){const pixels=rootPixels(value);let overlap=0;
 for(let y=270;y<330;y++)for(let x=95;x<270;x++){const i=(y*704+x)*4;
  for(let c=0;c<4;c++)rootBandMaxDifference=Math.max(rootBandMaxDifference,Math.abs(pixels[i+c]-earNeutral[i+c]));
  if(pixels[i+3]>128&&foreground[i+3]>128)overlap++;
 }
 minimumScalpOverlap=Math.min(minimumScalpOverlap,overlap);
}
// These two boxes contained the unrelated upper/lower hair tips in the user's
// screenshot. Checking alpha catches a mask error that geometry tests cannot.
for(const[x0,y0,w,h]of[[558,345,12,14],[546,382,16,12]])for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++)neighborTipAlpha=Math.max(neighborTipAlpha,hairMaterial[(y*704+x)*4+3]);
Object.assign(report,{rootBandMaxDifference,visibleRootPixels,minimumScalpOverlap,neighborTipAlpha});
if(rootBandMaxDifference>1||visibleRootPixels<100||minimumScalpOverlap<1000||neighborTipAlpha!==0)throw Error('Material attachment or separation failed: '+JSON.stringify(report));
let minimumAlpha=255,maximumFace=0,maximumBody=0,maximumEarRoot=0,maximumHairRoot=0,maximumBoneError=0,minimumHairTriangle=Infinity,maximumExpressionDifference=0;
for(let i=0;i<=20;i++){
 const v=-1+i/10,pose={ear:Math.max(-.4,v),hair:v},pixels=render(next,neutralFrame(i*20),pose);
 maximumFace=Math.max(maximumFace,diff(pixels,reconstructed,face).max);maximumBody=Math.max(maximumBody,diff(pixels,reconstructed,body).max);
 for(let y=16;y<720;y++)for(let x=16;x<720;x++)minimumAlpha=Math.min(minimumAlpha,pixels[(y*736+x)*4+3]);
 const e=localEarPoint(LOCAL_EAR_ROOT,pose.ear),a=localHairPoint(LOCAL_HAIR_CHAIN[0],v),b=localHairPoint(LOCAL_HAIR_CHAIN[1],v),c=localHairPoint(LOCAL_HAIR_CHAIN[2],v);
 maximumEarRoot=Math.max(maximumEarRoot,Math.hypot(e[0]-LOCAL_EAR_ROOT[0],e[1]-LOCAL_EAR_ROOT[1]));maximumHairRoot=Math.max(maximumHairRoot,Math.hypot(a[0]-LOCAL_HAIR_CHAIN[0][0],a[1]-LOCAL_HAIR_CHAIN[0][1]));
 for(const [before,after]of[[[LOCAL_HAIR_CHAIN[0],LOCAL_HAIR_CHAIN[1]],[a,b]],[[LOCAL_HAIR_CHAIN[1],LOCAL_HAIR_CHAIN[2]],[b,c]]])maximumBoneError=Math.max(maximumBoneError,Math.abs(Math.hypot(before[0][0]-before[1][0],before[0][1]-before[1][1])-Math.hypot(after[0][0]-after[1][0],after[0][1]-after[1][1])));
 for(let y=0;y<8;y++)for(let x=0;x<12;x++){
  const p=([[500+x*8,305+y*11],[508+x*8,305+y*11],[500+x*8,316+y*11],[508+x*8,316+y*11]] as [number,number][]).map(point=>localHairPoint(point,v));
  for(const[a,b,c]of[[0,1,2],[1,3,2]])minimumHairTriangle=Math.min(minimumHairTriangle,(p[b][0]-p[a][0])*(p[c][1]-p[a][1])-(p[c][0]-p[a][0])*(p[b][1]-p[a][1]));
 }
}
for(const channels of [{jawOpen:1},{jawOpen:.4,mouthPucker:.8},{eyeBlinkLeft:1,eyeBlinkRight:1},{browInnerUp:1,browOuterUpLeft:1,browOuterUpRight:1},{browDownLeft:1,browDownRight:1},{mouthSmileLeft:1,mouthFrownRight:.6}]){
 const frame={...neutralFrame(0),channels};const before=render(old,frame),after=render(next,frame,{ear:1,hair:-1});
 maximumExpressionDifference=Math.max(maximumExpressionDifference,diff(before,after,face).max);
}
Object.assign(report,{minimumAlpha,maximumFace,maximumBody,maximumEarRoot,maximumHairRoot,maximumBoneError,minimumHairTriangle,originalHairTriangle:88,maximumExpressionDifference,scope:'One image-left ear and one image-right lock only; same product painter with native Canvas, synthetic inputs, not a browser/camera/device acceptance test.'});
if(diff(original,reconstructed).max>1||maximumFace||maximumBody||maximumExpressionDifference||minimumAlpha!==255||maximumEarRoot>1e-8||maximumHairRoot>1e-8||maximumBoneError>1e-7||minimumHairTriangle<40)throw Error(JSON.stringify(report));
const still=createCanvas(1280,760),s=still.getContext('2d');s.fillStyle='#f4f1e6';s.fillRect(0,0,1280,760);s.font='18px AvatarChinese';s.fillStyle='#243649';
for(const[i,pose]of[{ear:0,hair:0},{ear:.55,hair:-1},{ear:1,hair:1},{ear:0,hair:0}].entries()){
 render(next,neutralFrame(i*100),pose);s.drawImage(canvas,i*320,35,320,320);s.fillText(['自然重组','有限侧转 / 发梢左摆','有限转向极值 / 发梢右摆','复位'][i],i*320+8,25);
 s.drawImage(canvas,100,85,230,260,i*320,405,220,250);s.drawImage(canvas,512,315,110,100,i*320+215,550,100,90);
}
await writeFile(`${output}/poses.jpg`,still.toBuffer('image/jpeg',95));await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');
if(!process.argv.includes('--stills-only')){
 const movie=createCanvas(1000,470),m=movie.getContext('2d'),gif=GIFEncoder();
 for(let i=0;i<70;i++){
  const t=i/10,turn=t<1?0:t<2?Math.sin((t-1)*Math.PI/2):t<3?1:t<4?Math.cos((t-3)*Math.PI):t<5?-1:t<6?-Math.cos((t-5)*Math.PI/2):0;
  const frame={...neutralFrame(i*100),tracked:true,rotation:[.12*turn,.4*turn,.1*turn] as FaceFrame['rotation']};m.fillStyle='#f4f1e6';m.fillRect(0,0,1000,470);m.fillStyle='#243649';m.font='18px AvatarChinese';m.fillText('旧版 · 同一段头动',15,26);m.fillText('局部绑定 · 单耳 / 一撮侧发',515,26);
  for(const[j,p]of[old,next].entries()){render(p,frame);m.drawImage(canvas,95,70,560,480,j*500,40,500,429);}
  const rgba=m.getImageData(0,0,1000,470).data,palette=quantize(rgba,160);gif.writeFrame(applyPalette(rgba,palette),1000,470,{palette,delay:100});
 }
 gif.finish();await writeFile(`${output}/comparison.gif`,gif.bytes());
 const detail=createCanvas(800,430),d=detail.getContext('2d'),earMovie=GIFEncoder();
 for(let i=0;i<60;i++){
  const t=i/10,ear=t<1?0:t<2?(t-1):t<3?1:t<4?4-t:0,hair=t<1?0:Math.sin((t-1)*Math.PI)*.9;
  render(next,neutralFrame(i*100),{ear,hair});d.fillStyle='#f4f1e6';d.fillRect(0,0,800,430);d.fillStyle='#243649';d.font='18px AvatarChinese';d.fillText('独立耳廓 · 原画 / 后侧毛面',12,25);d.fillText('独立发束 · 固定发根',420,25);d.drawImage(canvas,100,85,230,270,0,40,350,390);d.drawImage(canvas,512,315,115,100,420,100,350,305);
  const rgba=d.getImageData(0,0,800,430).data,palette=quantize(rgba,160);earMovie.writeFrame(applyPalette(rgba,palette),800,430,{palette,delay:100});
 }
 earMovie.finish();await writeFile(`${output}/details.gif`,earMovie.bytes());
}
console.log(JSON.stringify(report,null,2));

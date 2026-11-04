/** Inspect the actual upper ear/head seam that the previous root-band checks
 * missed. Writes product-rendered closeups, not a schematic connection line. */
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createPaintedFoxPainter,paintedHeadPoint,PAINTED_FOX_ASSETS,type PaintedFoxImages} from '../src/learning/avatar/painted-fox';
import {LOCAL_RIG_ASSETS,type LocalRigImages} from '../src/learning/avatar/painted-local-rig';
import {neutralFrame,type FaceFrame} from '../src/learning/avatar/face-frame';
const [toolsDir,output='scratch/avatar-ear-seam']=process.argv.slice(2);if(!toolsDir)throw Error('Expected authoring tools directory');
const require=createRequire(`${resolve(toolsDir)}/package.json`),{createCanvas,loadImage}=require('@napi-rs/canvas');
const surface=(w:number,h:number)=>{const canvas=createCanvas(w,h);return{canvas,context:canvas.getContext('2d') as CanvasRenderingContext2D};};
const images=Object.fromEntries(await Promise.all(Object.entries(PAINTED_FOX_ASSETS).map(async([key,path])=>[key,await loadImage('public/'+path)]))) as PaintedFoxImages;
const local=Object.fromEntries(await Promise.all(Object.entries(LOCAL_RIG_ASSETS).map(async([key,path])=>[key,await loadImage('public/'+path)]))) as LocalRigImages;
const painter=createPaintedFoxPainter(images,surface,{},local),canvas=createCanvas(736,736),ctx=canvas.getContext('2d');
const render=(ear:number,rotation:FaceFrame['rotation']=[0,0,0])=>{painter.draw(ctx,736,736,{...neutralFrame(0),rotation},{localPose:{ear,hair:0}});return ctx.getImageData(0,0,736,736).data;};
const reference=render(0),seam:Array<[number,number]>=[[251,177],[230,190],[211,203],[196,218],[178,240],[163,265],[153,287]];
const distance=(x:number,y:number)=>Math.min(...seam.slice(1).map((b,i)=>{const a=seam[i],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);}));
const paper=(p:Uint8ClampedArray,i:number)=>Math.min(p[i],p[i+1],p[i+2])>220&&Math.max(p[i],p[i+1],p[i+2])-Math.min(p[i],p[i+1],p[i+2])<22;
const report:Array<{ear:number;exposedPaper:number;seamMaxDifference:number}>=[];
const still=createCanvas(1280,780),s=still.getContext('2d');s.fillStyle='#e7eaed';s.fillRect(0,0,1280,780);s.font='18px sans-serif';
for(const[i,value]of[0,.4,.7,1].entries()){
 const pixels=render(value);let exposedPaper=0,seamMaxDifference=0;
 for(let y=150;y<270;y++)for(let x=150;x<275;x++)if(distance(x,y)<8){const k=((y+16)*736+x+16)*4;
  const colored=Math.max(reference[k],reference[k+1],reference[k+2])-Math.min(reference[k],reference[k+1],reference[k+2])>40;
  if(colored&&paper(pixels,k))exposedPaper++;
  for(let c=0;c<3;c++)seamMaxDifference=Math.max(seamMaxDifference,Math.abs(pixels[k+c]-reference[k+c]));
 }
 report.push({ear:value,exposedPaper,seamMaxDifference});
 s.drawImage(canvas,90,65,260,300,i*320,30,312,360);s.fillStyle='#243649';s.fillText('ear='+value,i*320+10,22);
 s.drawImage(canvas,205,165,90,110,i*320,430,300,330);
}
let maximumExposedPaper=0,maximumSeamDifference=0,sweepStates=0;
for(const rotation of [[0,0,0],[.35,.45,.1],[-.35,-.45,-.1]] as FaceFrame['rotation'][]){
 const reference=render(0,rotation);
 for(let step=0;step<=28;step++){
  const ear=-.4+step*.05,pixels=render(ear,rotation);sweepStates++;
  let exposedPaper=0,seamMaxDifference=0;
  for(let y=150;y<270;y++)for(let x=150;x<275;x++)if(distance(x,y)<8){
   const p=paintedHeadPoint([x-96,y-192],rotation[0],-rotation[1],-rotation[2]),xx=Math.round(p[0]+112),yy=Math.round(p[1]+208),k=(yy*736+xx)*4;
   const colored=Math.max(reference[k],reference[k+1],reference[k+2])-Math.min(reference[k],reference[k+1],reference[k+2])>40;
   if(colored&&paper(pixels,k))exposedPaper++;
   for(let c=0;c<3;c++)seamMaxDifference=Math.max(seamMaxDifference,Math.abs(pixels[k+c]-reference[k+c]));
  }
  maximumExposedPaper=Math.max(maximumExposedPaper,exposedPaper);maximumSeamDifference=Math.max(maximumSeamDifference,seamMaxDifference);
 }
}
const result={poses:report,sweepStates,maximumExposedPaper,maximumSeamDifference,scope:'Actual diagonal upper ear/front-hair seam. Native product painter, simulated poses, no browser/camera acceptance.'};
await mkdir(output,{recursive:true});await writeFile(`${output}/seam-poses.jpg`,still.toBuffer('image/jpeg',96));await writeFile(`${output}/report.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
if(maximumExposedPaper!==0||maximumSeamDifference>1)throw Error('Visible upper ear/head seam opened');

/** Native product-painter comparison. Synthetic pose inputs, not a camera or
 * browser recording. Generated GIFs stay in ignored scratch/. */
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {createPaintedFoxPainter,PAINTED_FOX_ASSETS,paintedHeadPoint,type PaintedFoxImages} from '../src/learning/avatar/painted-fox';
import {LOCAL_RIG_ASSETS,LOCAL_EAR_ATTACHMENT,type LocalRigImages} from '../src/learning/avatar/painted-local-rig';
import {EAR_TURN_ASSET,earTurnDemoValue} from '../src/learning/avatar/painted-ear-turn';
import {neutralFrame,type FaceFrame} from '../src/learning/avatar/face-frame';
const[toolsDir,out='scratch/ear-turn']=process.argv.slice(2);if(!toolsDir)throw Error('Expected native tools directory');
const require=createRequire(`${resolve(toolsDir)}/package.json`),{createCanvas,loadImage}=require('@napi-rs/canvas'),{GIFEncoder,quantize,applyPalette}=require('gifenc');
const surface=(w:number,h:number)=>{const canvas=createCanvas(w,h);return{canvas,context:canvas.getContext('2d') as CanvasRenderingContext2D};};
const images=Object.fromEntries(await Promise.all(Object.entries(PAINTED_FOX_ASSETS).map(async([k,p])=>[k,await loadImage('public/'+p)]))) as PaintedFoxImages;
const local=Object.fromEntries(await Promise.all(Object.entries(LOCAL_RIG_ASSETS).map(async([k,p])=>[k,await loadImage('public/'+p)]))) as LocalRigImages;
const atlas=await loadImage('public/'+EAR_TURN_ASSET),painters=[createPaintedFoxPainter(images,surface,{},local),createPaintedFoxPainter(images,surface,{}, {...local,earTurn:atlas})];
const canvas=createCanvas(736,736),ctx=canvas.getContext('2d');
const render=(kind:number,value:number,rotation:FaceFrame['rotation']=[0,0,0])=>{painters[kind].draw(ctx,736,736,{...neutralFrame(0),rotation},{localPose:{ear:value,hair:0}});return ctx.getImageData(0,0,736,736).data;};
const sheet=createCanvas(1536,1100),s=sheet.getContext('2d');s.fillStyle='#e8edf0';s.fillRect(0,0,1536,1100);s.fillStyle='#26384b';s.font='21px sans-serif';
const values=[0,.2,.4,.6,.8,1];let rootMax=0,exposedPaper=0,bodyMax=0;const innerWhite:number[]=[];
for(let row=0;row<2;row++)for(const[i,value]of values.entries()){
 render(row,value);s.drawImage(canvas,75,65,270,335,i*256,row*400+40,256,320);s.fillText(`${row?'painted':'mesh'} ${value.toFixed(1)}`,i*256+10,row*400+27);
 if(row===1){let count=0;const data=ctx.getImageData(0,0,736,736).data;for(let y=100;y<210;y++)for(let x=110;x<220;x++){const k=(y*736+x)*4;if(data[k]>200&&data[k+1]>170&&data[k+1]<235&&data[k+2]>135&&Math.max(data[k],data[k+1],data[k+2])-Math.min(data[k],data[k+1],data[k+2])<70)count++;}innerWhite.push(count);}
}
for(const rotation of[[0,0,0],[.35,.45,.1],[-.35,-.45,-.1]] as FaceFrame['rotation'][]){
 const reference=render(1,0,rotation);
 for(let i=0;i<=44;i++){
  const current=render(1,i/44,rotation);
  for(const[x,y]of LOCAL_EAR_ATTACHMENT)for(const dx of[-3,0,3])for(const dy of[-3,0,3]){
   const p=paintedHeadPoint([x+dx-96,y+dy-192],rotation[0],-rotation[1],-rotation[2]),xx=Math.round(p[0]+112),yy=Math.round(p[1]+208),k=(yy*736+xx)*4;
   for(let c=0;c<3;c++)rootMax=Math.max(rootMax,Math.abs(current[k+c]-reference[k+c]));
   const colored=Math.max(reference[k],reference[k+1],reference[k+2])-Math.min(reference[k],reference[k+1],reference[k+2])>40;
   if(colored&&Math.min(current[k],current[k+1],current[k+2])>220&&Math.max(current[k],current[k+1],current[k+2])-Math.min(current[k],current[k+1],current[k+2])<22)exposedPaper++;
  }
  for(let y=560;y<720;y++)for(let x=70;x<666;x++){const k=(y*736+x)*4;for(let c=0;c<3;c++)bodyMax=Math.max(bodyMax,Math.abs(current[k+c]-reference[k+c]));}
 }
}
// Full head remains identical outside the one ear. Show whole-character context.
render(1,0);s.drawImage(canvas,0,0,736,736,40,790,300,300);render(1,1);s.drawImage(canvas,0,0,736,736,350,790,300,300);
await mkdir(out,{recursive:true});await writeFile(`${out}/comparison.jpg`,sheet.toBuffer('image/jpeg',96));
if(!process.argv.includes('--stills-only')){
 const anim=createCanvas(880,540),a=anim.getContext('2d'),gif=GIFEncoder();
 for(let i=0;i<132;i++){a.fillStyle='#e8edf0';a.fillRect(0,0,880,540);const value=earTurnDemoValue(i*1000/30);
  for(let kind=0;kind<2;kind++){render(kind,value);a.drawImage(canvas,45,50,330,380,kind*440+20,45,400,460);a.fillStyle='#26384b';a.font='18px sans-serif';a.fillText(kind?'Painted poses':'Previous mesh',kind*440+30,29);}
  const rgba=a.getImageData(0,0,880,540).data,palette=quantize(rgba,256);gif.writeFrame(applyPalette(rgba,palette),880,540,{palette,delay:1000/30,repeat:0});
 }gif.finish();await writeFile(`${out}/comparison.gif`,gif.bytes());
}
const inputs=['src/learning/avatar/painted-ear-turn.ts','src/learning/avatar/painted-local-rig.ts','src/learning/avatar/painted-fox.ts','src/learning/avatar/illustrated-avatar-stage.tsx','src/learning/avatar/avatar-lab-page.tsx','scripts/prepare-ear-turn.ts','scripts/avatar-ear-turn-validate.ts',`public/${EAR_TURN_ASSET}`];
const inputSha256=Object.fromEntries(await Promise.all(inputs.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
const report={frames:12,checkedStates:135,rootMax,exposedPaper,bodyMax,innerWhite,inputSha256,scope:'Native product painter; synthetic inputs. One left ear only. No browser/camera/device acceptance.'};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
if(rootMax>1||exposedPaper||bodyMax||innerWhite[5]>innerWhite[0]*.65)throw Error('Ear drawing comparison failed');

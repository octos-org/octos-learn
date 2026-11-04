/** Prepare the completed Fox sample without re-cutting the accepted left ear
 * or right curl. Generation supplies hidden paint only; masks are authored. */
import {createRequire} from 'node:module';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {STAR_FOX_HAIR,STAR_FOX_RIGHT_EAR} from '../src/learning/avatar/star-fox-parts';
import {LOCAL_FOREGROUND_PATH} from '../src/learning/avatar/painted-local-rig';
const [toolsDir]=process.argv.slice(2);if(!toolsDir)throw Error('Expected authoring tools directory');
const require=createRequire(`${resolve(toolsDir)}/package.json`),{createCanvas,loadImage,Path2D}=require('@napi-rs/canvas');
const root='public/teach-avatars/star-fox/local-rig-v0.3',previous='public/teach-avatars/star-fox/local-rig-v0.2';await mkdir(root,{recursive:true});
const make=()=>{const canvas=createCanvas(704,704);return{canvas,ctx:canvas.getContext('2d')};};
const source=make(),base=make(),under=make();source.ctx.drawImage(await loadImage('public/teach-avatars/star-fox/painted-v0.3/portrait-extended.png'),0,0);base.ctx.drawImage(await loadImage(previous+'/base.png'),0,0);under.ctx.drawImage(await loadImage(root+'/underpaint-generated.png'),0,0,704,704);
const original=source.ctx.getImageData(0,0,704,704),basePixels=base.ctx.getImageData(0,0,704,704),hidden=under.ctx.getImageData(0,0,704,704);
const parts:Record<string,ReturnType<typeof make>>={};
for(const[name,path]of[['ear-front','ear-front.png'],['ear-back','ear-back.png'],['hair','hair.png']]){await copyFile(previous+'/'+path,root+'/'+path);const part=make();part.ctx.drawImage(await loadImage(root+'/'+path),0,0);parts[name]=part;}
for(const[id,path,expand]of[['right-ear-front',STAR_FOX_RIGHT_EAR.path,8],...STAR_FOX_HAIR.filter(p=>p.id!=='hair').map(p=>[p.id,p.path,.5])] as Array<[string,string,number]>){
 const mask=make();mask.ctx.fillStyle='#fff';mask.ctx.strokeStyle='#fff';mask.ctx.lineWidth=expand;mask.ctx.lineJoin='round';mask.ctx.fill(new Path2D(path));mask.ctx.stroke(new Path2D(path));
 const m=mask.ctx.getImageData(0,0,704,704),part=make(),out=part.ctx.createImageData(704,704);
 for(let i=0;i<out.data.length;i+=4){
  let amount=m.data[i+3]/255;const rgb=Array.from(original.data.slice(i,i+3));if(Math.min(...rgb)>220&&Math.max(...rgb)-Math.min(...rgb)<19)amount=0;if(!amount)continue;
  const bg=rgb.map((v,c)=>v*(1-amount)+hidden.data[i+c]*amount);let alpha=amount;
  for(let c=0;c<3;c++)alpha=Math.max(alpha,rgb[c]<bg[c]?(bg[c]-rgb[c])/Math.max(1,bg[c]):(rgb[c]-bg[c])/Math.max(1,255-bg[c]));
  alpha=Math.min(1,Math.ceil(alpha*255)/255);
  for(let c=0;c<3;c++){basePixels.data[i+c]=bg[c];out.data[i+c]=Math.max(0,Math.min(255,(rgb[c]-basePixels.data[i+c]*(1-alpha))/alpha));}out.data[i+3]=alpha*255;
 }
 part.ctx.putImageData(out,0,0);parts[id]=part;await writeFile(root+'/'+id+'.png',part.canvas.toBuffer('image/png'));
}
base.ctx.putImageData(basePixels,0,0);await writeFile(root+'/base.png',base.canvas.toBuffer('image/png'));
const hairs=STAR_FOX_HAIR.map(spec=>parts[spec.id].ctx.getImageData(0,0,704,704).data);
const foreground=make();foreground.ctx.fillStyle='#fff';foreground.ctx.fill(new Path2D(LOCAL_FOREGROUND_PATH));foreground.ctx.fill(new Path2D(STAR_FOX_RIGHT_EAR.foreground));foreground.ctx.globalCompositeOperation='source-in';foreground.ctx.drawImage(source.canvas,0,0);
const f=foreground.ctx.getImageData(0,0,704,704),restore=make(),r=restore.ctx.createImageData(704,704);
for(let i=0;i<r.data.length;i+=4)if(hairs.some(h=>h[i+3]>0)){f.data[i+3]=0;for(let c=0;c<3;c++)r.data[i+c]=basePixels.data[i+c];r.data[i+3]=255;}
foreground.ctx.putImageData(f,0,0);restore.ctx.putImageData(r,0,0);await writeFile(root+'/foreground.png',foreground.canvas.toBuffer('image/png'));await writeFile(root+'/restore.png',restore.canvas.toBuffer('image/png'));
const rowBounds=(data:Uint8ClampedArray,width:number,y:number)=>{let left=width,right=0;for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>128){left=Math.min(left,x);right=x;}return[left,right];};
const full=make();full.ctx.fillStyle='#fff';full.ctx.fill(new Path2D(STAR_FOX_RIGHT_EAR.fullPath));const fullPixels=full.ctx.getImageData(0,0,704,704);
const frontImage=await loadImage('public/teach-avatars/star-fox/local-rig-v0.1/ear-front-generated.png'),fc=createCanvas(frontImage.width,frontImage.height),fg=fc.getContext('2d');fg.drawImage(frontImage,0,0);const front=fg.getImageData(0,0,frontImage.width,frontImage.height),extension=parts['right-ear-front'].ctx.getImageData(0,0,704,704);
for(let y=170;y<=335;y++){
 const[left,right]=rowBounds(fullPixels.data,704,y),yy=Math.round(40+(y-85)/250*(frontImage.height-100)),[fl,fr]=rowBounds(front.data,frontImage.width,yy);if(left>=right||fl>=fr)continue;
 for(let x=left;x<=right;x++){const i=(y*704+x)*4;if(f.data[i+3]!==255||fullPixels.data[i+3]!==255)continue;const xx=Math.round(fr-(x-left)/Math.max(1,right-left)*(fr-fl)),k=(yy*frontImage.width+xx)*4;for(let c=0;c<3;c++)extension.data[i+c]=front.data[k+c];extension.data[i+3]=255;}
}
parts['right-ear-front'].ctx.putImageData(extension,0,0);await writeFile(root+'/right-ear-front.png',parts['right-ear-front'].canvas.toBuffer('image/png'));
const backImage=await loadImage('public/teach-avatars/star-fox/local-rig-v0.1/ear-back-generated.png'),bc=createCanvas(backImage.width,backImage.height),bg=bc.getContext('2d');bg.drawImage(backImage,0,0);const back=bg.getImageData(0,0,backImage.width,backImage.height),rear=make(),rearPixels=rear.ctx.createImageData(704,704);
for(let y=85;y<=335;y++){const[left,right]=rowBounds(extension.data,704,y),yy=Math.round(45+(y-85)/250*(backImage.height-170)),[bl,br]=rowBounds(back.data,backImage.width,yy);if(left>=right||bl>=br)continue;for(let x=left;x<=right;x++){const i=(y*704+x)*4,xx=Math.round(br-(x-left)/Math.max(1,right-left)*(br-bl)),k=(yy*backImage.width+xx)*4;for(let c=0;c<3;c++)rearPixels.data[i+c]=back.data[k+c];rearPixels.data[i+3]=extension.data[i+3];}}
rear.ctx.putImageData(rearPixels,0,0);await writeFile(root+'/right-ear-back.png',rear.canvas.toBuffer('image/png'));
const oral=createCanvas(512,512),oc=oral.getContext('2d');oc.drawImage(await loadImage(root+'/oral-generated.png'),0,0,512,512);await writeFile(root+'/oral.png',oral.toBuffer('image/png'));
const diagnostic=createCanvas(1408,704),d=diagnostic.getContext('2d');d.drawImage(source.canvas,0,0);d.drawImage(base.canvas,704,0);d.strokeStyle='#059eae';d.lineWidth=1;for(const p of STAR_FOX_HAIR)d.stroke(new Path2D(p.path));d.stroke(new Path2D(STAR_FOX_RIGHT_EAR.path));
await mkdir('scratch/star-fox-sample',{recursive:true});await writeFile('scratch/star-fox-sample/materials.jpg',diagnostic.toBuffer('image/jpeg',95));console.log('Prepared both ears, three main hair groups, restoration mask and HD oral texture.');

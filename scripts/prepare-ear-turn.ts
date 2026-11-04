/** Sprite preparation only: preserve authored pixels, uniformly register each
 * drawing, then composite a stationary root collar. No nonlinear ear warp. */
import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {EAR_TURN} from '../src/learning/avatar/painted-ear-turn';
import {LOCAL_EAR_ATTACHMENT} from '../src/learning/avatar/painted-local-rig';
const[toolsDir]=process.argv.slice(2);if(!toolsDir)throw Error('Expected native authoring tools directory');
const require=createRequire(`${resolve(toolsDir)}/package.json`),{createCanvas,loadImage}=require('@napi-rs/canvas');
const dir='public/teach-avatars/star-fox/ear-turn-v0.1',image=await loadImage(`${dir}/poses-generated.png`);
const src=createCanvas(image.width,image.height),s=src.getContext('2d');s.drawImage(image,0,0);
const ear=await loadImage('public/teach-avatars/star-fox/local-rig-v0.3/ear-front.png'),earCanvas=createCanvas(704,704),e=earCanvas.getContext('2d');e.drawImage(ear,0,0);const anchor=e.getImageData(0,0,704,704).data;
const{columns,frames,width,height,x:ox,y:oy}=EAR_TURN,rows=Math.ceil(frames/columns),cw=image.width/columns,ch=image.height/rows;
const atlas=createCanvas(width*columns,height*rows),a=atlas.getContext('2d'),diagnostic=createCanvas(1536,960),d=diagnostic.getContext('2d');d.fillStyle='#f4f1e8';d.fillRect(0,0,1536,960);
const smooth=(v:number)=>{const x=Math.max(0,Math.min(1,v));return x*x*(3-2*x);};
const distance=(x:number,y:number)=>Math.min(...LOCAL_EAR_ATTACHMENT.slice(1).map((b,i)=>{const p=LOCAL_EAR_ATTACHMENT[i],dx=b[0]-p[0],dy=b[1]-p[1],t=Math.max(0,Math.min(1,((x-p[0])*dx+(y-p[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(x-p[0]-t*dx,y-p[1]-t*dy);}));
const records=[];let scale=0;
for(let n=0;n<frames;n++){
 const cell=createCanvas(cw,ch),c=cell.getContext('2d');c.drawImage(src,(n%columns)*cw,Math.floor(n/columns)*ch,cw,ch,0,0,cw,ch);const pixels=c.getImageData(0,0,cw,ch);
 let left=cw,right=0,top=ch,bottom=0;
 for(let y=0;y<ch;y++)for(let x=0;x<cw;x++)if(pixels.data[(y*cw+x)*4+3]>128){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(left>=right||top>=bottom)throw Error('Missing sprite cell '+n);
 if(!scale)scale=250/(bottom-top);
 // Generator padding varies. Register the rounded hidden base, not the tip,
 // so the visible pinna is free to change contour and position naturally.
 let rootX=0,total=0;for(let y=bottom-28;y<=bottom;y++)for(let x=left;x<=right;x++){const alpha=pixels.data[(y*cw+x)*4+3]/255;if(alpha>.5){rootX+=x*alpha;total+=alpha;}}
 rootX/=total;
 // Discard only essentially invisible generation noise (alpha <= 7/255),
 // leaving the antialiased painted edge and native transparency intact.
 for(let i=3;i<pixels.data.length;i+=4)if(pixels.data[i]<=7)pixels.data[i]=0;
 c.putImageData(pixels,0,0);
 const frame=createCanvas(width,height),f=frame.getContext('2d'),dx=180-rootX*scale,dy=335-bottom*scale;
 f.drawImage(cell,dx-ox,dy-oy,cw*scale,ch*scale);const target=f.getImageData(0,0,width,height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const xx=x+ox,yy=y+oy,srcIndex=(yy*704+xx)*4,index=(y*width+x)*4;
  const weight=1-smooth((distance(xx,yy)-9)/10),sa=anchor[srcIndex+3]/255*weight;
  if(sa===0)continue;const da=target.data[index+3]/255,out=sa+da*(1-sa);
  for(let k=0;k<3;k++)target.data[index+k]=(anchor[srcIndex+k]*sa+target.data[index+k]*da*(1-sa))/out;
  target.data[index+3]=Math.round(out*255);
 }
 f.putImageData(target,0,0);a.drawImage(frame,(n%columns)*width,Math.floor(n/columns)*height);
 d.drawImage(frame,(n%columns)*384,Math.floor(n/columns)*320);d.fillStyle='#27384a';d.font='16px sans-serif';d.fillText(`pose ${n+1}`,n%columns*384+280,Math.floor(n/columns)*320+30);
 records.push({frame:n,bounds:{left,right,top,bottom},scale,translation:[dx,dy],root:[180,335]});
}
await writeFile(`${dir}/poses.png`,atlas.toBuffer('image/png'));await mkdir('scratch/ear-turn',{recursive:true});await writeFile('scratch/ear-turn/registered.jpg',diagnostic.toBuffer('image/jpeg',95));await writeFile(`${dir}/registration.json`,JSON.stringify({columns,rows,frames,width,height,origin:[ox,oy],records},null,2)+'\n');
console.log('Prepared 12 registered painted poses; runtime atlas '+atlas.width+'x'+atlas.height);

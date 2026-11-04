/** Preserve whole-ear drawings, register the hidden base, and separately trace
 * the real hair occluder. Never paste static original-ear fur over the turn. */
import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {EAR_TURN,EAR_TURN_HAIR_PATH} from '../src/learning/avatar/painted-ear-turn';
const[toolsDir]=process.argv.slice(2);if(!toolsDir)throw Error('Expected native authoring tools directory');
const require=createRequire(`${resolve(toolsDir)}/package.json`),{createCanvas,loadImage,Path2D}=require('@napi-rs/canvas');
const sourceDir='public/teach-avatars/star-fox/ear-turn-v0.1',dir='public/teach-avatars/star-fox/ear-turn-v0.2';await mkdir(dir,{recursive:true});
const image=await loadImage(`${sourceDir}/poses-generated.png`);
const src=createCanvas(image.width,image.height),s=src.getContext('2d');s.drawImage(image,0,0);
const{columns,frames,width,height,x:ox,y:oy}=EAR_TURN,rows=Math.ceil(frames/columns),cw=image.width/columns,ch=image.height/rows;
const atlas=createCanvas(width*columns,height*rows),a=atlas.getContext('2d'),diagnostic=createCanvas(1536,960),d=diagnostic.getContext('2d');d.fillStyle='#f4f1e8';d.fillRect(0,0,1536,960);
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
 f.drawImage(cell,dx-ox,dy-oy,cw*scale,ch*scale);a.drawImage(frame,(n%columns)*width,Math.floor(n/columns)*height);
 d.drawImage(frame,(n%columns)*384,Math.floor(n/columns)*320);d.fillStyle='#27384a';d.font='16px sans-serif';d.fillText(`pose ${n+1}`,n%columns*384+280,Math.floor(n/columns)*320+30);
 records.push({frame:n,bounds:{left,right,top,bottom},scale,translation:[dx,dy],root:[180,335]});
}
await writeFile(`${dir}/poses.png`,atlas.toBuffer('image/png'));
const foreground=createCanvas(704,704),f=foreground.getContext('2d');f.drawImage(await loadImage('public/teach-avatars/star-fox/local-rig-v0.3/foreground.png'),0,0);f.clearRect(0,0,340,704);
f.save();f.clip(new Path2D(EAR_TURN_HAIR_PATH));f.drawImage(await loadImage('public/teach-avatars/star-fox/painted-v0.3/portrait-extended.png'),0,0);f.restore();await writeFile(`${dir}/foreground.png`,foreground.toBuffer('image/png'));
await mkdir('scratch/ear-turn',{recursive:true});await writeFile('scratch/ear-turn/registered.jpg',diagnostic.toBuffer('image/jpeg',95));await writeFile(`${dir}/registration.json`,JSON.stringify({columns,rows,frames,width,height,origin:[ox,oy],records},null,2)+'\n');
console.log('Prepared 12 registered painted poses; runtime atlas '+atlas.width+'x'+atlas.height);

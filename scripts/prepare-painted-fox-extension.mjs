/** Prepare the generated outpainting while retaining the fitted original face. */
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
const [toolsDir,generated,output='public/teach-avatars/star-fox/painted-v0.3/portrait-extended.png']=process.argv.slice(2);
if(!toolsDir||!generated)throw Error('Expected authoring tools directory and generated outpainting file');
const require=createRequire(`${resolve(toolsDir)}/package.json`);
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const canvas=createCanvas(704,704),ctx=canvas.getContext('2d');
ctx.drawImage(await loadImage(generated),0,0,704,704);
const extended=ctx.getImageData(0,0,704,704),original=createCanvas(512,512),ox=original.getContext('2d');
ox.drawImage(await loadImage('public/teach-avatars/star-fox/painted-v0.2/source.png'),0,0);
const source=ox.getImageData(0,0,512,512),smooth=n=>{n=Math.max(0,Math.min(1,n));return n*n*(3-2*n);};
for(let y=0;y<512;y++)for(let x=0;x<512;x++){
  // The seam is confined to the old crop perimeter; no facial pixels are blended.
  const alpha=smooth(y/22)*smooth(x/12)*smooth((511-x)/12),i=(y*512+x)*4,j=((y+192)*704+x+96)*4;
  for(let ch=0;ch<3;ch++)extended.data[j+ch]=Math.round(source.data[i+ch]*alpha+extended.data[j+ch]*(1-alpha));
  extended.data[j+3]=255;
}
ctx.putImageData(extended,0,0);await mkdir(dirname(output),{recursive:true});await writeFile(output,canvas.toBuffer('image/png'));

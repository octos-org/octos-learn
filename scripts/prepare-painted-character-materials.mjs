/** Native authoring preparation; paintings/underpaintings are made by imagegen. */
import {createRequire}from'node:module';
import {readFile,mkdir,writeFile,copyFile}from'node:fs/promises';
import {resolve}from'node:path';
const[toolsDir,configPath]=process.argv.slice(2);if(!toolsDir||!configPath)throw Error('Expected authoring tools and preparation config');
const require=createRequire(`${resolve(toolsDir)}/package.json`),{createCanvas,loadImage}=require('@napi-rs/canvas');
for(const item of JSON.parse(await readFile(configPath,'utf8'))){
  const dir=`public/teach-avatars/${item.id}/painted-v0.1`;await mkdir(dir,{recursive:true});
  const canvas=createCanvas(704,704),ctx=canvas.getContext('2d');ctx.fillStyle='#f4f1e6';ctx.fillRect(0,0,704,704);ctx.drawImage(await loadImage(item.portrait),item.dx??0,item.dy??0,704,704);
  await writeFile(`${dir}/portrait.png`,canvas.toBuffer('image/png'));
  const base=createCanvas(512,512),b=base.getContext('2d');b.drawImage(canvas,96,192,512,512,0,0,512,512);await writeFile(`${dir}/source.png`,base.toBuffer('image/png'));
  if(item.clean){b.clearRect(0,0,512,512);b.drawImage(await loadImage(item.clean),0,0,512,512);await writeFile(`${dir}/clean.png`,base.toBuffer('image/png'));}
  if(item.concept)await copyFile(item.concept,`public/teach-avatars/${item.id}/concept-original.png`);
}

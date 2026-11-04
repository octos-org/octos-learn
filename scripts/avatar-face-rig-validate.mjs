// Optional authoring dependency: @napi-rs/canvas. No product dependency added.
// node scripts/avatar-face-rig-validate.mjs /absolute/path/to/@napi-rs/canvas
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { MATERIALS, drawFace } from '../docs/avatar-animation-phase-a/facial-rig/renderer.mjs';
const require = createRequire(import.meta.url);
const {createCanvas, loadImage} = require(process.argv[2] || '@napi-rs/canvas');
const root = path.resolve('docs/avatar-animation-phase-a/facial-rig');
const out = path.resolve('scratch/avatar-face-rig/frames');
fs.mkdirSync(out,{recursive:true});
const images = Object.fromEntries(await Promise.all(MATERIALS.map(async k => [k,await loadImage(`${root}/materials/${k}.png`)])));
const canvas=createCanvas(512,512),ctx=canvas.getContext('2d');
const source=createCanvas(512,512),sctx=source.getContext('2d');sctx.drawImage(images.source,0,0);
const sourceBytes=sctx.getImageData(0,0,512,512).data;
drawFace(ctx,images);const neutralBytes=ctx.getImageData(0,0,512,512).data;
let neutralMax=0;for(let i=0;i<neutralBytes.length;i++)neutralMax=Math.max(neutralMax,Math.abs(neutralBytes[i]-sourceBytes[i]));
const poses=[{},{left:.5,right:.5},{left:1,right:1},{mouth:.5},{mouth:1},{left:1,right:1,mouth:.8}];
const sheet=createCanvas(1536,1024),sheetCtx=sheet.getContext('2d');
for(const [i,pose] of poses.entries()){drawFace(ctx,images,pose);sheetCtx.drawImage(canvas,(i%3)*512,Math.floor(i/3)*512);}
fs.writeFileSync(`${root}/comparison.png`,sheet.toBuffer('image/png'));
// Compare all poses against source away from the three local edit rectangles.
let outsideMax=0;
for(const pose of poses){drawFace(ctx,images,pose);const pixels=ctx.getImageData(0,0,512,512).data;for(let y=0;y<512;y++)for(let x=0;x<512;x++){
  const local=(x>=120&&x<=250&&y>=160&&y<=265)||(x>=275&&x<=395&&y>=160&&y<=265)||(x>=205&&x<=340&&y>=255&&y<=325);
  if(!local)for(let c=0;c<4;c++)outsideMax=Math.max(outsideMax,Math.abs(pixels[(y*512+x)*4+c]-sourceBytes[(y*512+x)*4+c]));
}}
const frames=[];for(let i=0;i<120;i++){
  const t=i/24,left=Math.max(0,1-Math.abs(t-1)*5),mouth=t>2&&t<4?.8*Math.max(0,Math.sin((t-2)*9)):0;
  drawFace(ctx,images,{left,right:left,mouth});fs.writeFileSync(`${out}/${String(i).padStart(3,'0')}.png`,canvas.toBuffer('image/png'));frames.push({i,time:t,left,right:left,mouth});
}
drawFace(ctx,images);const reset=ctx.getImageData(0,0,512,512).data;let resetMax=0;for(let i=0;i<reset.length;i++)resetMax=Math.max(resetMax,Math.abs(reset[i]-sourceBytes[i]));
if(neutralMax!==0||resetMax!==0||outsideMax!==0)throw new Error(`Image preservation failed: ${JSON.stringify({neutralMax,resetMax,outsideMax})}`);
const report={kind:'Canvas facial-material study, not Anime2.5DRig WebGL output or camera capture',size:[512,512],fps:24,frames,neutralMaxChannelDifference:neutralMax,resetMaxChannelDifference:resetMax,outsideFacialRectanglesMaxChannelDifference:outsideMax,qualityCaveat:'Endpoint improvement only. Intermediate eyelids compress painted eye texture; one mouth shape; no independent iris, brows, head depth or body rig. Not a quality pass or device performance benchmark.'};
fs.writeFileSync(`${root}/render-report.json`,JSON.stringify(report,null,2));console.log({frames:frames.length,neutralMax,resetMax,outsideMax});

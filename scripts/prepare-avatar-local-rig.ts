/** Deterministic mask extraction/registration for the authored local rig.
 * Illustration edits come from imagegen; this script prepares runtime layers. */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LOCAL_EAR_PATH, LOCAL_FULL_EAR_PATH, LOCAL_HAIR_PATH, LOCAL_FOREGROUND_PATH } from '../src/learning/avatar/painted-local-rig';
const [toolsDir] = process.argv.slice(2); if (!toolsDir) throw Error('Expected authoring tools directory');
const require = createRequire(`${resolve(toolsDir)}/package.json`);
const { createCanvas, loadImage, Path2D } = require('@napi-rs/canvas');
const sourceRoot = 'public/teach-avatars/star-fox/local-rig-v0.1';
const root = 'public/teach-avatars/star-fox/local-rig-v0.2'; await mkdir(root, { recursive: true });
const make = () => { const canvas = createCanvas(704, 704); return { canvas, ctx: canvas.getContext('2d') }; };
const source = make(), generated = make();
source.ctx.drawImage(await loadImage('public/teach-avatars/star-fox/painted-v0.3/portrait-extended.png'), 0, 0);
generated.ctx.drawImage(await loadImage(`${sourceRoot}/underpaint-generated-v2.png`), 0, 0, 704, 704);
const original = source.ctx.getImageData(0, 0, 704, 704), under = generated.ctx.getImageData(0, 0, 704, 704);
const base = make(); base.ctx.putImageData(original, 0, 0); const baseData = base.ctx.getImageData(0, 0, 704, 704);
const layers: Record<string, ReturnType<typeof make>> = {};
for (const [name, path] of [['ear-front', LOCAL_EAR_PATH], ['hair', LOCAL_HAIR_PATH]]) {
  const mask = make(); mask.ctx.fillStyle = '#fff'; mask.ctx.strokeStyle = '#fff'; mask.ctx.lineWidth = name==='hair'?.5:8; mask.ctx.lineJoin = 'round'; mask.ctx.fill(new Path2D(path)); mask.ctx.stroke(new Path2D(path));
  const weights = mask.ctx.getImageData(0, 0, 704, 704), part = make(), data = part.ctx.createImageData(704, 704);
  for (let i = 0; i < data.data.length; i += 4) {
    let amount = weights.data[i + 3] / 255;
    const rgb = Array.from(original.data.slice(i, i + 3));
    // The surrounding warm paper is not part of the fur sprite.
    if (Math.min(...rgb) > 220 && Math.max(...rgb) - Math.min(...rgb) < 19) amount = 0;
    if (!amount) continue;
    const bg = rgb.map((v, c) => v * (1 - amount) + under.data[i + c] * amount);
    // Choose alpha sufficient to reconstruct original RGB against the exposed
    // underpainting, including subpixel edge coverage (no cream fringe).
    let alpha = amount;
    for (let c = 0; c < 3; c++) alpha = Math.max(alpha, rgb[c] < bg[c] ? (bg[c] - rgb[c]) / Math.max(1, bg[c]) : (rgb[c] - bg[c]) / Math.max(1, 255 - bg[c]));
    alpha = Math.min(1, Math.ceil(alpha * 255) / 255);
    for (let c = 0; c < 3; c++) { baseData.data[i + c] = bg[c]; data.data[i + c] = Math.max(0, Math.min(255, (rgb[c] - baseData.data[i + c] * (1 - alpha)) / alpha)); }
    data.data[i + 3] = alpha * 255;
  }
  part.ctx.putImageData(data, 0, 0); layers[name] = part;
  await writeFile(`${root}/${name}.png`, part.canvas.toBuffer('image/png'));
}
base.ctx.putImageData(baseData, 0, 0); await writeFile(`${root}/base.png`, base.canvas.toBuffer('image/png'));
const foreground = make(); foreground.ctx.fillStyle = '#fff'; foreground.ctx.fill(new Path2D(LOCAL_FOREGROUND_PATH)); foreground.ctx.globalCompositeOperation = 'source-in'; foreground.ctx.drawImage(source.canvas, 0, 0);
await writeFile(`${root}/foreground.png`, foreground.canvas.toBuffer('image/png'));
const rowBounds = (data: Uint8ClampedArray, width: number, y: number) => { let left = width, right = 0; for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 128) { left = Math.min(left, x); right = x; } return [left, right]; };
// Fill the previously invisible pinna behind the foreground hair. Original
// visible ear pixels stay untouched; the extension is fully hidden at rest.
const fullMask=make();fullMask.ctx.fillStyle='#fff';fullMask.ctx.fill(new Path2D(LOCAL_FULL_EAR_PATH));
const full=fullMask.ctx.getImageData(0,0,704,704),occlusion=foreground.ctx.getImageData(0,0,704,704),frontImage=await loadImage(`${sourceRoot}/ear-front-generated.png`),frontCanvas=createCanvas(frontImage.width,frontImage.height),fc=frontCanvas.getContext('2d');fc.drawImage(frontImage,0,0);
const frontPixels=fc.getImageData(0,0,frontImage.width,frontImage.height),extended=layers['ear-front'].ctx.getImageData(0,0,704,704);
for(let y=170;y<=335;y++){
 const [left,right]=rowBounds(full.data,704,y),yy=Math.round(40+(y-85)/250*(frontImage.height-100)),[fl,fr]=rowBounds(frontPixels.data,frontImage.width,yy);
 if(left>=right||fl>=fr)continue;
 for(let x=left;x<=right;x++){const i=(y*704+x)*4;if(occlusion.data[i+3]!==255||full.data[i+3]!==255)continue;
 const xx=Math.round(fl+(x-left)/Math.max(1,right-left)*(fr-fl)),k=(yy*frontImage.width+xx)*4;
 for(let c=0;c<3;c++)extended.data[i+c]=frontPixels.data[k+c];extended.data[i+3]=255;
 }
}
layers['ear-front'].ctx.putImageData(extended,0,0);await writeFile(`${root}/ear-front.png`,layers['ear-front'].canvas.toBuffer('image/png'));
const back = make(), backImage = await loadImage(`${sourceRoot}/ear-back-generated.png`), backFull = createCanvas(backImage.width, backImage.height), bc = backFull.getContext('2d'); bc.drawImage(backImage, 0, 0);
const backPixels = bc.getImageData(0, 0, backImage.width, backImage.height), earPixels = layers['ear-front'].ctx.getImageData(0, 0, 704, 704), mapped = back.ctx.createImageData(704, 704);
for (let y = 85; y <= 335; y++) {
  const [left, right] = rowBounds(earPixels.data, 704, y);
  const yy = Math.round(45 + (y - 85) / 250 * (backImage.height - 170)), [bl, br] = rowBounds(backPixels.data, backImage.width, yy);
  if (left >= right || bl >= br) continue;
  for (let x = left; x <= right; x++) { const i = (y * 704 + x) * 4, xx = Math.round(bl + (x - left) / Math.max(1, right - left) * (br - bl)), k = (yy * backImage.width + xx) * 4;
    for (let c = 0; c < 3; c++) mapped.data[i + c] = backPixels.data[k + c]; mapped.data[i + 3] = earPixels.data[i + 3]; }
}
back.ctx.putImageData(mapped, 0, 0); await writeFile(`${root}/ear-back.png`, back.canvas.toBuffer('image/png'));
const diagnostic = createCanvas(1408, 704), d = diagnostic.getContext('2d'); d.drawImage(source.canvas, 0, 0); d.drawImage(base.canvas, 704, 0); d.strokeStyle = '#00a9bf'; d.lineWidth = 1; d.stroke(new Path2D(LOCAL_EAR_PATH)); d.stroke(new Path2D(LOCAL_HAIR_PATH));
await mkdir('scratch/avatar-local-rig', { recursive: true }); await writeFile('scratch/avatar-local-rig/materials.jpg', diagnostic.toBuffer('image/jpeg', 94));
console.log('Prepared base, ear-front/back, hair, foreground; material diagnostic saved to scratch/avatar-local-rig/materials.jpg');

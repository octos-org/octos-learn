import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { createPuppetFoxPainter, PUPPET_FOX_ASSETS, bodyPreset, type PuppetFoxImages } from "../src/learning/avatar/puppet-fox";
import { neutralFrame } from "../src/learning/avatar/face-frame";
const [toolsDir, output] = process.argv.slice(2);
if (!toolsDir || !output) throw new Error("Expected authoring tools and output directories");
const require = createRequire(`${toolsDir}/package.json`);
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const images = Object.fromEntries(await Promise.all(Object.entries(PUPPET_FOX_ASSETS).map(async ([key,path]) => [key,await loadImage(`public/${path}`)]))) as PuppetFoxImages;
const painter = createPuppetFoxPainter(images, (w,h) => { const canvas=createCanvas(w,h);return {canvas,context:canvas.getContext('2d')}; });
const sheet=createCanvas(1800,1200), c=sheet.getContext('2d');
await mkdir(output,{recursive:true});
const names=['rest','left','right','both','point','wave'] as const;
for(let i=0;i<names.length;i++) { const canvas=createCanvas(600,600);painter.draw(canvas.getContext('2d'),600,600,{...neutralFrame(),body:bodyPreset(names[i]!,400),channels:i===5?{jawOpen:.8,eyeBlinkLeft:1,eyeBlinkRight:1}:{ }},{backdrop:true});c.drawImage(canvas,i%3*600,Math.floor(i/3)*600);if(i===0)await writeFile(`${output}/puppet-neutral.png`,canvas.toBuffer('image/png')); }
await writeFile(`${output}/puppet-poses.png`,sheet.toBuffer('image/png'));
console.log(output);

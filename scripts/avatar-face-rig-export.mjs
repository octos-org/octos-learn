// Bundle this validation study for local opening without a running dev server.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('docs/avatar-animation-phase-a/facial-rig');
const renderer = fs.readFileSync(`${root}/renderer.mjs`, 'utf8').replaceAll('export ', '');
const data = {};
for (const name of ['source', 'face', 'eyeL-open', 'eyeR-open', 'eyeL-expression', 'eyeR-expression', 'mouth-open', 'mouth-expression']) {
  data[name] = `data:image/png;base64,${fs.readFileSync(`${root}/materials/${name}.png`).toString('base64')}`;
}
let html = fs.readFileSync(`${root}/index.html`, 'utf8');
html = html.replace("import {MATERIALS,drawFace} from './renderer.mjs';", `${renderer}\nconst embeddedImages=${JSON.stringify(data)};`);
html = html.replace("image.src='materials/'+key+'.png'", 'image.src=embeddedImages[key]');
html = html.replace('src="materials/source.png"', `src="${data.source}"`);
fs.writeFileSync(`${root}/preview.html`, html);
const blinkRenderer=fs.readFileSync(`${root}/blink-study.mjs`,'utf8').replaceAll('export ','');
let blinkHtml=fs.readFileSync(`${root}/blink-study.html`,'utf8');
blinkHtml=blinkHtml.replace("import {MATERIALS,drawFace} from './renderer.mjs';",`const {MATERIALS,drawFace}=(()=>{${renderer}\nreturn {MATERIALS,drawFace};})();\nconst embeddedImages=${JSON.stringify(data)};`);
blinkHtml=blinkHtml.replace("import {prepareBlinkStudy,drawBlinkStudy} from './blink-study.mjs';",`const {prepareBlinkStudy,drawBlinkStudy}=(()=>{${blinkRenderer}\nreturn {prepareBlinkStudy,drawBlinkStudy};})();`);
blinkHtml=blinkHtml.replace("image.src='materials/'+key+'.png'",'image.src=embeddedImages[key]');
fs.writeFileSync(`${root}/blink-preview.html`,blinkHtml);
console.log('Exported self-contained preview.html + blink-preview.html; no network or camera access.');

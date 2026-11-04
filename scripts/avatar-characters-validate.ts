/** All four fitted product painters, pixel preservation, replay and preview export. */
import{createRequire}from'node:module';import{mkdir,writeFile}from'node:fs/promises';import{resolve}from'node:path';import{execFileSync}from'node:child_process';
import{PAINTED_CHARACTERS}from'../src/learning/avatar/painted-characters';import{createPaintedFoxPainter,PAINTED_FOX_VIEW}from'../src/learning/avatar/painted-fox';import{neutralFrame,type FaceFrame}from'../src/learning/avatar/face-frame';import{PerformanceRecorder,parseAvatarTrack,sampleAvatarTrack}from'../src/learning/avatar/performance-track';
const[toolsDir,output='scratch/avatar-characters']=process.argv.slice(2);if(!toolsDir)throw Error('Expected authoring tools directory');
const require=createRequire(`${resolve(toolsDir)}/package.json`),{createCanvas,loadImage,GlobalFonts}=require('@napi-rs/canvas'),{GIFEncoder,quantize,applyPalette}=require('gifenc');
GlobalFonts.registerFromPath('/System/Library/Fonts/STHeiti Medium.ttc','AvatarChinese');
const surface=(w:number,h:number)=>{const canvas=createCanvas(w,h);return{canvas,context:canvas.getContext('2d')as CanvasRenderingContext2D};};
const sz=PAINTED_FOX_VIEW.frame,pad=16,offsetX=112,offsetY=208,canvas=createCanvas(sz,sz),ctx=canvas.getContext('2d');
const frame=(channels:FaceFrame['channels']={},rotation:FaceFrame['rotation']=[0,0,0]):FaceFrame=>({...neutralFrame(),tracked:true,channels,rotation});
const diff=(a:Uint8ClampedArray,b:Uint8ClampedArray,where:(x:number,y:number)=>boolean=()=>true)=>{let max=0,changed=0;for(let y=0;y<sz;y++)for(let x=0;x<sz;x++)if(where(x-offsetX,y-offsetY)){
let pixel=0;for(let ch=0;ch<4;ch++)pixel=Math.max(pixel,Math.abs(a[(y*sz+x)*4+ch]-b[(y*sz+x)*4+ch]));max=Math.max(max,pixel);if(pixel>8)changed++;}return{max,changed};};
const poses=[{label:'自然',value:frame()},{label:'双眼闭合',value:frame({eyeBlinkLeft:1,eyeBlinkRight:1})},{label:'皱眉 / 开口',value:frame({jawOpen:.8,browDownLeft:.8,browDownRight:.8})},{label:'头动 / 侧看',value:frame({eyeLookOutLeft:.8,eyeLookInRight:.8},[.15,-.4,-.1])}];
await mkdir(output,{recursive:true});const painters=[],reports:Record<string,unknown>={},gallery=createCanvas(1280,1360),g=gallery.getContext('2d');g.fillStyle='#f4f1ea';g.fillRect(0,0,1280,1360);g.font='18px AvatarChinese';
const work=resolve('scratch/avatar-four/baseline');await mkdir(work,{recursive:true});
const eyePath=resolve(work,'eyes.ts'),painterPath=resolve(work,'painter.ts');await writeFile(eyePath,execFileSync('git',['show','af2b1f08:src/learning/avatar/painted-eyes.ts'],{encoding:'utf8'}).replaceAll('"./original-fox"',JSON.stringify(resolve('src/learning/avatar/original-fox.ts'))));
await writeFile(painterPath,execFileSync('git',['show','af2b1f08:src/learning/avatar/painted-fox.ts'],{encoding:'utf8'}).replaceAll('"./face-frame"',JSON.stringify(resolve('src/learning/avatar/face-frame.ts'))).replaceAll('"./original-fox"',JSON.stringify(resolve('src/learning/avatar/original-fox.ts'))).replaceAll('"./painted-eyes"',JSON.stringify(eyePath)));
const accepted=await import(painterPath),oldSurface=surface(sz,sz);let acceptedFoxMax=0;
for(const[i,character]of PAINTED_CHARACTERS.entries()){
const images=Object.fromEntries(await Promise.all(Object.entries(character.assets).map(async([key,path])=>[key,await loadImage(`public/${path}`)]))),painter=createPaintedFoxPainter(images as Parameters<typeof createPaintedFoxPainter>[0],surface,character.rig);painters.push(painter);
const render=(value:FaceFrame)=>{painter.draw(ctx,sz,sz,value);return ctx.getImageData(0,0,sz,sz).data;};
const neutral=render(frame()),reference=surface(sz,sz);reference.context.drawImage(images.extended,pad,pad,704,704);
const checks:Record<string,number>={neutralMax:diff(neutral,reference.context.getImageData(0,0,sz,sz).data).max,closedMouthMax:diff(render(frame({jawOpen:1,mouthClose:1})),neutral).max,
invalidMax:diff(render(frame({jawOpen:NaN,browDownLeft:Infinity},[NaN,Infinity,-Infinity])),neutral).max};
const oral=character.rig?.mouth?.rect??{x:210,y:254,w:104,h:80};checks.mouthOutsideMax=diff(render(frame({jawOpen:1})),neutral,(x,y)=>!(x>=oral.x&&x<oral.x+oral.w&&y>=oral.y&&y<oral.y+oral.h)).max;
let minAlpha=255,clothesMax=0;for(const pitch of[-.35,.35])for(const yaw of[-.45,.45])for(const roll of[-.1,.1]){const pixels=render(frame({},[pitch,yaw,roll]));clothesMax=Math.max(clothesMax,diff(pixels,neutral,(_x,y)=>y>=420).max);for(let y=pad;y<pad+704;y++)for(let x=pad;x<pad+704;x++)minAlpha=Math.min(minAlpha,pixels[(y*sz+x)*4+3]);}checks.clothesMax=clothesMax;
const recorder=new PerformanceRecorder();recorder.begin(0);for(const[j,p]of poses.entries())recorder.append(p.value,j*100);const track=parseAvatarTrack(JSON.parse(JSON.stringify(recorder.finish(400))));
let replayMax=0;for(const[j,p]of poses.entries())replayMax=Math.max(replayMax,diff(render(p.value),render(sampleAvatarTrack(track,j*100))).max);checks.replayMax=replayMax;checks.resetMax=diff(render(frame()),neutral).max;
const continuity=Object.fromEntries(['jawOpen','browDownLeft','eyeBlinkLeft','eyeLookInLeft'].map(key=>[key,diff(render(frame({[key]:.000001})),neutral).max]));
const frownDelta=diff(render(frame({browDownLeft:1,browDownRight:1})),neutral,(_x,y)=>y>=175&&y<245);
if(Object.values(checks).some(n=>n!==0)||minAlpha!==255||Object.values(continuity).some(n=>n>1)||frownDelta.changed<100)throw Error(JSON.stringify({id:character.id,checks,minAlpha,continuity,frownDelta}));
reports[character.id]={checks,minAlpha,continuity,frownDelta};
// Head/ear following was intentionally changed after this baseline. Preserve
// the approved still facial artwork, rather than asserting the old head motion.
// The open mouth was redrawn on 2026-11-03 at the user's request (crooked,
// jagged lips), so open-mouth poses compare everything except the mouth area.
if(character.id==='star-fox'){const previous=accepted.createPaintedFoxPainter(images,surface);for(const p of[...poses.filter(p=>p.value.rotation.every(n=>n===0)),{value:frame({mouthPucker:.8,mouthSmileLeft:.6,browInnerUp:.7})}]){previous.draw(oldSurface.context,sz,sz,p.value);const opened=Object.keys(p.value.channels).some(key=>/^(jaw|mouth)/.test(key));acceptedFoxMax=Math.max(acceptedFoxMax,diff(render(p.value),oldSurface.context.getImageData(0,0,sz,sz).data,opened?(x,y)=>!(x>=208&&x<=316&&y>=252&&y<=336):undefined).max);}}
for(const[j,p]of poses.entries()){render(p.value);g.fillStyle='#243649';g.fillText(character.name()+' · '+p.label,i*320+10,j*340+24);g.drawImage(canvas,i*320,j*340+30,310,310);}
render(frame());await writeFile(`${output}/${character.id}-neutral.png`,canvas.toBuffer('image/png'));
}
if(acceptedFoxMax!==0)throw Error('Approved fox output regressed');await writeFile(`${output}/poses.jpg`,gallery.toBuffer('image/jpeg',94));
const lineup=createCanvas(1280,340),l=lineup.getContext('2d');l.drawImage(gallery,0,0,1280,340,0,0,1280,340);await writeFile(`${output}/lineup.jpg`,lineup.toBuffer('image/jpeg',94));
const movie=createCanvas(960,270),m=movie.getContext('2d'),gif=GIFEncoder();
for(let i=0;i<48;i++){
const phase=i/48*4,part=Math.floor(phase),wave=Math.sin((phase-part)*Math.PI)**2,value=part===0?frame({},[.18*Math.sin(i*.3),.4*Math.sin(i*.5),.1*Math.sin(i*.5)])
:part===1?frame({browDownLeft:wave,browDownRight:wave,mouthFrownLeft:wave,mouthFrownRight:wave})
:part===2?frame({eyeBlinkLeft:wave,eyeBlinkRight:wave,mouthSmileLeft:.6*wave,mouthSmileRight:.6*wave})
:frame({jawOpen:wave,mouthSmileLeft:.5*wave,mouthSmileRight:.5*wave});
m.fillStyle='#f4f1ea';m.fillRect(0,0,960,270);m.font='16px AvatarChinese';
for(const[j,painter]of painters.entries()){painter.draw(ctx,sz,sz,value);m.drawImage(canvas,j*240,30,240,240);m.fillStyle='#243649';m.fillText(PAINTED_CHARACTERS[j].name(),j*240+12,22);}
const rgba=m.getImageData(0,0,960,270).data,palette=quantize(rgba,192);gif.writeFrame(applyPalette(rgba,palette),960,270,{palette,delay:130});}
gif.finish();await writeFile(`${output}/preview.gif`,gif.bytes());
const report={acceptedFoxBaseline:'af2b1f08',acceptedFoxStillMax:acceptedFoxMax,characters:reports,animation:{frames:48,frameDelayMs:130,durationMs:6240},limits:'Actual product painters using deterministic synthetic controls; no camera/browser/TV acceptance. The fox baseline comparison covers still expressions, not the intentionally revised head/ear motion. Original instructor/learner package selection remains a separate integration.'};await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));

/** Four-character ear/hair geometry, idle pixels, spring settling and real painter media. */
import{createRequire}from'node:module';import{mkdir,writeFile}from'node:fs/promises';import{resolve}from'node:path';
import{PAINTED_CHARACTERS}from'../src/learning/avatar/painted-characters';import{createPaintedFoxPainter,paintedHeadPoint,paintedMotionPoint}from'../src/learning/avatar/painted-fox';
import{FOX_MOTION,paintedIdlePose,createPaintedSecondaryMotion}from'../src/learning/avatar/painted-secondary-motion';import{neutralFrame,type FaceFrame}from'../src/learning/avatar/face-frame';
const[toolsDir,output='scratch/avatar-secondary-motion']=process.argv.slice(2);if(!toolsDir)throw Error('Expected authoring tools directory');
const require=createRequire(`${resolve(toolsDir)}/package.json`),{createCanvas,loadImage,GlobalFonts}=require('@napi-rs/canvas'),{GIFEncoder,quantize,applyPalette}=require('gifenc');GlobalFonts.registerFromPath('/System/Library/Fonts/STHeiti Medium.ttc','AvatarChinese');
const surface=(w:number,h:number)=>{const canvas=createCanvas(w,h);return{canvas,context:canvas.getContext('2d')as CanvasRenderingContext2D};},sz=736,canvas=createCanvas(sz,sz),ctx=canvas.getContext('2d');
const frame=(timeMs=0,rotation:FaceFrame['rotation']=[0,0,0]):FaceFrame=>({...neutralFrame(timeMs),tracked:true,rotation});
const difference=(a:Uint8ClampedArray,b:Uint8ClampedArray,where:(x:number,y:number)=>boolean=()=>true)=>{let max=0,changed=0;for(let y=0;y<sz;y++)for(let x=0;x<sz;x++)if(where(x-112,y-208)){let d=0;for(let c=0;c<4;c++)d=Math.max(d,Math.abs(a[(y*sz+x)*4+c]-b[(y*sz+x)*4+c]));max=Math.max(max,d);if(d>8)changed++;}return{max,changed};};
await mkdir(output,{recursive:true});const painters=[],reports:Record<string,unknown>={};
const stills=createCanvas(1280,700),s=stills.getContext('2d');s.fillStyle='#f4f1ea';s.fillRect(0,0,1280,700);s.font='18px AvatarChinese';
for(const[i,character]of PAINTED_CHARACTERS.entries()){
const images=Object.fromEntries(await Promise.all(Object.entries(character.assets).map(async([key,path])=>[key,await loadImage('public/'+path)]))),painter=createPaintedFoxPainter(images as Parameters<typeof createPaintedFoxPainter>[0],surface,character.rig);painters.push(painter);
const render=(time:number,idle:boolean,rotation:FaceFrame['rotation']=[0,0,0])=>{painter.draw(ctx,sz,sz,frame(time,rotation),{timeMs:time,idleMotion:idle});return ctx.getImageData(0,0,sz,sz).data;};
const neutral=render(0,false),profile=character.rig?.motion??FOX_MOTION,tipTravel:number[]=[];
let minimumTriangleArea=Infinity;
// Sweep both twitch phases plus all extreme head signs; clearing/coverage alone
// would miss an inverted background triangle outside the visible ear silhouette.
for(let time=0;time<12000;time+=200)for(const pitch of[-.35,.35])for(const yaw of[-.45,.45])for(const roll of[-.1,.1]){
  const pose=createPaintedSecondaryMotion().sample(pitch,yaw,roll),idle=paintedIdlePose(time,profile);
  for(const key of Object.keys(pose)as Array<keyof typeof pose>)pose[key]+=idle[key];
  const points:Array<[number,number]>=[];
  for(let y=0;y<=22;y++)for(let x=0;x<=22;x++)points.push(paintedMotionPoint([x*32-96,y*32-192],pitch,yaw,roll,pose,profile));
  for(let y=0;y<22;y++)for(let x=0;x<22;x++){
    const a=y*23+x;for(const[ia,ib,ic]of[[a,a+1,a+23],[a+1,a+24,a+23]]){
      const[p,q,r]=[points[ia],points[ib],points[ic]],area=(q[0]-p[0])*(r[1]-p[1])-(r[0]-p[0])*(q[1]-p[1]);
      minimumTriangleArea=Math.min(minimumTriangleArea,area);
    }
  }
}
let maxTime=0,maxAngle=0;for(let time=0;time<12000;time+=50){const pose=paintedIdlePose(time,profile);if(Math.abs(pose.leftEar)>maxAngle){maxAngle=Math.abs(pose.leftEar);maxTime=time;}}
maxTime=(profile.looks[0].start+profile.looks[0].turn+profile.looks[0].hold/2-profile.phase)*1000;
const moving=render(maxTime,true),idleChange=difference(moving,neutral,(_x,y)=>y<140),faceChange=difference(moving,neutral,(x,y)=>x>=150&&x<=375&&y>=190&&y<=300),bodyChange=difference(moving,neutral,(_x,y)=>y>=420);
for(const ear of profile.ears){const p=paintedMotionPoint(ear.tip,.2,.4,.1,undefined,profile),rigid=paintedHeadPoint(ear.tip,.2,.4,.1);tipTravel.push(Math.hypot(p[0]-rigid[0],p[1]-rigid[1]));}
let minAlpha=255;for(const pitch of[-.35,.35])for(const yaw of[-.45,.45])for(const roll of[-.1,.1]){const pixels=render(maxTime+100,true,[pitch,yaw,roll]);for(let y=16;y<720;y++)for(let x=16;x<720;x++)minAlpha=Math.min(minAlpha,pixels[(y*sz+x)*4+3]);}
render(0,false);const holdStart=render(maxTime,true);
const holdMax=difference(render(maxTime+100,true),holdStart).max;
const disabledAtOtherTime=render(11000,false),disabledMax=difference(disabledAtOtherTime,neutral).max;
render(0,false);const repeatA=render(maxTime,true);render(0,false);const repeatMax=difference(render(maxTime,true),repeatA).max;
if(faceChange.max!==0||bodyChange.max!==0||disabledMax!==0||repeatMax!==0||minAlpha!==255||idleChange.changed<300||Math.min(...tipTravel)<.1||holdMax!==0||minimumTriangleArea<=0)throw Error(JSON.stringify({id:character.id,idleChange,faceChange,bodyChange,disabledMax,repeatMax,minAlpha,tipTravel,minimumTriangleArea,holdMax}));
reports[character.id]={leftLookHoldMs:maxTime,holdMax,idleChange,faceChange,bodyChange,disabledMax,repeatMax,minAlpha,minimumTriangleArea,headTurnTipTravelNativePx:tipTravel};
for(const[row,time]of[0,maxTime].entries()){render(time,row===1);s.fillStyle='#243649';s.fillText(character.name()+(row?' · 单耳转向 / 保持':' · 自然'),i*320+10,row*350+23);s.drawImage(canvas,i*320,row*350+30,320,320);}
}
await writeFile(`${output}/idle-poses.jpg`,stills.toBuffer('image/jpeg',94));
const foxDetail=createCanvas(900,370),fd=foxDetail.getContext('2d');fd.fillStyle='#f4f1ea';fd.fillRect(0,0,900,370);fd.font='18px AvatarChinese';
for(const[i,time]of [0,2000,4000].entries()){painters[0].draw(ctx,sz,sz,frame(time),{timeMs:time,idleMotion:true});fd.drawImage(canvas,90,65,250,280,i*300,45,290,325);fd.fillStyle='#243649';fd.fillText(['自然','单耳转向 / 保持','回到自然'][i],i*300+12,27);}
await writeFile(`${output}/fox-ear-detail.jpg`,foxDetail.toBuffer('image/jpeg',95));
const movie=createCanvas(960,300),m=movie.getContext('2d');
for(const mode of['idle','following']as const){const gif=GIFEncoder(),frames=mode==='idle'?120:70;
for(let i=0;i<frames;i++){
const time=i*100;let rotation:FaceFrame['rotation']=[0,0,0];
// Turn, stop, reverse and stop again, to show the settling hair at a fixed pose.
if(mode==='following'){const t=time/1000;const a=t<1?0:t<2?Math.sin((t-1)*Math.PI/2):t<3?1:t<4?Math.cos((t-3)*Math.PI):t<5?-1:t<6?-Math.cos((t-5)*Math.PI/2):0;rotation=[.12*a,.4*a,.1*a];}
m.fillStyle='#f4f1ea';m.fillRect(0,0,960,300);m.font='17px AvatarChinese';m.fillStyle='#243649';m.fillText(mode==='idle'?'单耳转向 → 保持 → 回正 · 四款独立节奏':'摆头 · 耳朵滞后跟随、转向侧耳朵侧转 / 头发惯性',12,23);
for(const[j,painter]of painters.entries()){painter.draw(ctx,sz,sz,frame(time,rotation),{timeMs:time,idleMotion:mode==='idle'});m.drawImage(canvas,j*240,60,240,240);m.fillStyle='#243649';m.font='14px AvatarChinese';m.fillText(PAINTED_CHARACTERS[j].name(),j*240+12,50);}
const rgba=m.getImageData(0,0,960,300).data,palette=quantize(rgba,160);gif.writeFrame(applyPalette(rgba,palette),960,300,{palette,delay:100});}
gif.finish();await writeFile(`${output}/${mode}.gif`,gif.bytes());}
const closeup=createCanvas(360,440),cc=closeup.getContext('2d'),earGif=GIFEncoder();
for(let i=0;i<48;i++){
  const time=i*100;painters[0].draw(ctx,sz,sz,frame(time),{timeMs:time,idleMotion:true});
  cc.fillStyle='#f4f1ea';cc.fillRect(0,0,360,440);cc.font='18px AvatarChinese';cc.fillStyle='#243649';
  cc.fillText(time<1200?'自然':time<1420?'单耳转向':time<2520?'保持朝向':time<3170?'回正':'恢复自然',12,26);
  cc.drawImage(canvas,90,65,250,280,0,36,360,403);
  const rgba=cc.getImageData(0,0,360,440).data,palette=quantize(rgba,160);earGif.writeFrame(applyPalette(rgba,palette),360,440,{palette,delay:100});
}
earGif.finish();await writeFile(`${output}/fox-ear-closeup.gif`,earGif.bytes());
const spring=createPaintedSecondaryMotion();spring.sample(0,0,0,0);spring.sample(0,.4,.1,33);for(let t=66;t<=600;t+=33)spring.sample(0,.4,.1,t);const release=spring.sample(0,0,0,627);let settled=release;for(let t=660;t<2300;t+=33)settled=spring.sample(0,0,0,t);
const report={characters:reports,spring:{release,settled},model:'Ear look / hold / return with ear-plane foreshortening and outward splay; ears trail head turns through a first-order lag (no overshoot); hair is a damped world-space spring pulled by the head',media:{idle:{frames:120,durationMs:12000},following:{frames:70,durationMs:7000}},source:'Actual current Canvas product painters with synthetic neutral and head motion inputs. Facial expressions held fixed; no webcam.',limits:'Native pixel checks/media, no browser/TV performance claim. No reconstructed rear-ear surface or claim of measured animal kinematics. Hair spring history is not serialized; seeks reset it. Idle motion is decorative and not recorded into facial channels.'};await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));

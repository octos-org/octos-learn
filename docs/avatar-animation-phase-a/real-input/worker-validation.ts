// Runs only after the visible local-page button is clicked. No camera API.
import {createPaintedFoxPainter,PAINTED_FOX_ASSETS,type PaintedFoxImages} from '/src/learning/avatar/painted-fox';
import {FaceSmoother,neutralFrame,type FaceFrame} from '/src/learning/avatar/face-frame';
import {PerformanceRecorder,parseAvatarTrack,sampleAvatarTrack,type AvatarTrack} from '/src/learning/avatar/performance-track';
const element=<T extends HTMLElement>(id:string)=>document.getElementById(id)as T;
const canvas=element<HTMLCanvasElement>('avatar'),ctx=canvas.getContext('2d')!,video=element<HTMLVideoElement>('video');
const start=element<HTMLButtonElement>('start'),cancel=element<HTMLButtonElement>('cancel'),replay=element<HTMLButtonElement>('replay'),reportButton=element<HTMLButtonElement>('report'),trackButton=element<HTMLButtonElement>('track');
const status=element('status'),summary=element('summary'),progress=element<HTMLProgressElement>('progress');
let generation=0,worker:Worker|undefined,track:AvatarTrack|undefined,report:unknown,raf=0,painter:ReturnType<typeof createPaintedFoxPainter>;
function say(text:string){status.textContent=text;}
function stop(){generation++;cancelAnimationFrame(raf);worker?.terminate();worker=undefined;video.pause();start.disabled=false;cancel.disabled=true;replay.disabled=!track;reportButton.disabled=!report;trackButton.disabled=!track;}
function download(value:unknown,filename:string){const url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function waitMedia(type:string,token:number){return new Promise<void>((resolve,reject)=>{const fail=()=>finish(new Error('video_failed')),ok=()=>finish();const timer=setTimeout(()=>finish(new Error('media_timeout')),10000);function finish(error?:Error){clearTimeout(timer);video.removeEventListener(type,ok);video.removeEventListener('error',fail);if(token!==generation)reject(new Error('cancelled'));else if(error)reject(error);else resolve();}video.addEventListener(type,ok,{once:true});video.addEventListener('error',fail,{once:true});});}
try{const images=Object.fromEntries(await Promise.all(Object.entries(PAINTED_FOX_ASSETS).map(async([key,file])=>{const im=new Image();im.src='/'+file;await im.decode();return[key,im];})))as PaintedFoxImages;painter=createPaintedFoxPainter(images,(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return{canvas:c,context:c.getContext('2d',{willReadFrequently:true})!};});painter.draw(ctx,536,536,neutralFrame());start.disabled=false;say('素材就绪 · 尚未运行识别');}catch{say('角色素材加载失败。');}
cancel.onclick=()=>{stop();say('已取消 · 没有开启摄像头');};reportButton.onclick=()=>download(report,'avatar-video-worker-report.json');trackButton.onclick=()=>download(track,'avatar-video-worker-track.json');
start.onclick=async()=>{
 stop();const token=generation;start.disabled=true;cancel.disabled=false;replay.disabled=reportButton.disabled=trackButton.disabled=true;track=undefined;report=undefined;progress.value=0;summary.textContent='运行中';
 const observations:Array<{timeMs:number;phase:string;tracked:boolean;processingMs:number}>=[],smoother=new FaceSmoother(),recorder=new PerformanceRecorder();recorder.begin(0);
 try{
  say('准备本地视频和识别模型…');const loaded=waitMedia('loadeddata',token);video.src='/scratch/avatar-single-image/LivePortrait/assets/examples/driving/d10.mp4';video.load();await loaded;
  if(token!==generation)return;
  const ownWorker=new Worker('/avatar-runtime/face-capture.worker.js');worker=ownWorker;
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('model_timeout')),45000);ownWorker.onerror=()=>{clearTimeout(timer);reject(new Error('worker_failed'));};ownWorker.onmessage=event=>{clearTimeout(timer);{if(event.data.type==='ready')resolve();else reject(new Error('model_failed'));};};ownWorker.postMessage({type:'init',assetRoot:location.origin+'/avatar-runtime'});});
  const blank=document.createElement('canvas');blank.width=512;blank.height=512;const bctx=blank.getContext('2d')!;bctx.fillStyle='#888';bctx.fillRect(0,0,512,512);
  for(let i=0;i<220;i++){
   if(token!==generation)return;const phase=i<160?'video':i<200?'blank':'recovery',timeMs=i*50;
   if(i<160&&Math.abs(video.currentTime-i/20)>.001){const seeked=waitMedia('seeked',token);video.currentTime=i/20;await seeked;}
   const image=await createImageBitmap(phase==='blank'?blank:video);if(token!==generation){image.close();return;}
   const result=await new Promise<{frame:FaceFrame;processingMs:number}>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('frame_timeout')),10000);ownWorker.onmessage=event=>{clearTimeout(timer);{if(event.data.type==='frame')resolve(event.data);else reject(new Error('frame_failed'));};};try{ownWorker.postMessage({type:'frame',image,timeMs},[image]);}catch(error){clearTimeout(timer);image.close();reject(error);}});
   if(token!==generation)return;const display=smoother.update(result.frame,timeMs);recorder.append(display,timeMs);painter.draw(ctx,536,536,display);observations.push({timeMs,phase,tracked:result.frame.tracked,processingMs:result.processingMs});progress.value=i+1;say(`已识别 ${i+1}/220 帧 · ${phase==='video'?'视频':phase==='blank'?'空白归位':'恢复'} · ${result.frame.tracked?'检测到人脸':'无人脸'}`);
   await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
  }
  track=parseAvatarTrack(JSON.parse(JSON.stringify(recorder.finish(11000))));const durations=observations.map(o=>o.processingMs).sort((a,b)=>a-b);
  const blankFalsePositives=observations.filter(o=>o.phase==='blank'&&o.tracked).length,recovered=observations.filter(o=>o.phase==='recovery'&&o.tracked).length;
  report={schema:'octos.avatar-video-worker-validation.v1',runtime:'Browser classic Worker @mediapipe/tasks-vision 0.10.32',source:'Local public LivePortrait d10.mp4, 8 seconds then blank/recovery',cameraUsed:false,microphoneUsed:false,frames:observations.length,blankFalsePositives,recoveredFrames:recovered,processingP95Ms:durations[Math.ceil(durations.length*.95)-1],observations};
  summary.textContent=JSON.stringify({frames:observations.length,blankFalsePositives,recoveredFrames:recovered,processingP95Ms:durations[Math.ceil(durations.length*.95)-1]},null,2);stop();say(blankFalsePositives===0&&recovered>0?'本地视频识别完成 · 可回放和下载报告':'识别完成但检查未通过，请查看报告');
 }catch(error){if(token===generation){stop();say('验证未完成：'+(error instanceof Error?error.message:'unknown'));}}
};
replay.onclick=()=>{if(!track)return;stop();start.disabled=true;cancel.disabled=false;replay.disabled=true;const value=track,anchor=performance.now();function tick(now:number){const time=Math.min(value.durationMs,now-anchor);painter.draw(ctx,536,536,sampleAvatarTrack(value,time));say(`回放已识别参数 ${(time/1000).toFixed(1)} / 11.0 秒`);if(time<value.durationMs)raf=requestAnimationFrame(tick);else{stop();say('回放完成');}}raf=requestAnimationFrame(tick);};
document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();say('页面已隐藏，运行已停止');}});window.addEventListener('pagehide',stop);

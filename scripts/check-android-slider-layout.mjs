// On a paused installed lesson, force legend wrapping and observe deferred layout.
// Requires adb forward tcp:9240 localabstract:webview_devtools_remote_<PID>.
// Restores the temporary stylesheet, slider value and wrapped method.
// node scripts/check-android-slider-layout.mjs <output.json>
import { writeFile } from 'node:fs/promises';
const output=process.argv[2];if(!output)throw Error('Provide output.json');
const pages=await(await fetch('http://127.0.0.1:9240/json/list')).json();
const page=pages.find(p=>p.type==='page'&&new URL(p.url).hostname==='learn.pitun.cc');
if(!page)throw Error('Learn WebView not found');
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});
const probe = async()=>{
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let b;const root=document.querySelector('.learning-oll-board');
if(!root)throw Error('Open the saved slope lesson first');
let f=root[Object.keys(root).find(k=>k.startsWith('__reactFiber'))],session,hostRevision;
for(let d=0;f&&d<30;d++,f=f.return)for(let h=f.memoizedState,i=0;h&&i<160;h=h.next,i++){
for(const v of [h.memoizedState,h.memoizedState?.current,Array.isArray(h.memoizedState)?h.memoizedState[0]:null])if(v?.player?.projection?.board&&typeof v.emit==='function')session=v;
const v=h.memoizedState?.current;if(v?.view&&v.elements)b=v.view;if(v&&v.view===b&&'revision'in v)hostRevision=h.memoizedState;
}
if(!session||session.playing||!b||!hostRevision||typeof b.layoutRevision!=='number')throw Error('Optimized runtime refs not found');
const slider=document.querySelector('input[type=range]'),originalValue=Number(slider.value),alias=slider.id.replace('oll-variable-',''),node=Object.values(session.player.projection.board.nodes).find(n=>n.kind==='plot'),id=node?.id;
if(!id||Number(slider.min)>1.25||Number(slider.max)<1.45)throw Error('Use the saved slope lesson with a plot and numeric slider');
const plotElement=b.nodeElements.get(id),plotSvg=plotElement.querySelector('svg'),originalPlotMarkup=plotSvg.outerHTML;
const calls=[];const original=b.getRegionBoundsMap;b.getRegionBoundsMap=function(...args){calls.push({time:performance.now(),revision:b.layoutRevision});return original.apply(this,args)};
const hostNodeBounds=()=>{
 let current=root[Object.keys(root).find(k=>k.startsWith('__reactFiber'))],top=current;
 while(top?.return)top=top.return;
 if(top?.stateNode?.current!==top&&current.alternate)current=current.alternate;
 const candidates=[];
 for(let d=0;current&&d<30;d++,current=current.return)for(let h=current.memoizedState,i=0;h&&i<160;h=h.next,i++){
 const v=h.memoizedState;if(Array.isArray(v)&&v.length===4&&v.every(r=>r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))))candidates.push({depth:d,hook:i,rects:v});
 }
 return candidates;
};
const scene=()=>({hostNodeBounds:hostNodeBounds(),sliderValue:Number(slider.value),plotNodeRetained:b.nodeElements.get(id)===plotElement,plotSvgRetained:plotElement.querySelector('svg')===plotSvg,time:performance.now(),viewRevision:b.layoutRevision,hostRevision:hostRevision.current?.revision,plotHeight:b.layout.nodes[id].height,measurement:b.nodeMeasurements.get(id)?.size,legendHeight:document.querySelector('.plot-legend').offsetHeight,calls:calls.length,cardPositions:Object.fromEntries(Object.entries(b.layout.nodes).map(([id,n])=>[id,{x:n.x,y:n.y,height:n.height}]))});
let gesture,style;
try{
const before=scene();gesture=session.beginStudentVariableOperation(alias,{control:'slider',input:'touch'});
session.updateStudentVariableOperation(gesture,1.25);await sleep(50);
const warmed=scene();style=document.createElement('style');style.textContent='.plot-legend{width:80px!important;max-width:80px!important}.plot-legend-item{max-width:80px!important;overflow-wrap:anywhere!important}';document.head.append(style);
session.updateStudentVariableOperation(gesture,1.35);await sleep(50);
const during=scene();await sleep(550);const afterDeferred=scene();
session.updateStudentVariableOperation(gesture,1.45);await sleep(100);const afterNextInput=scene();
style.remove();style=null;session.commitStudentVariableOperation(gesture,originalValue);gesture=null;await sleep(700);const restoredStyle=scene();await sleep(1500);const afterIdle=scene();
return {syntheticLegendWidthPx:80,originalSliderValue:originalValue,finalSliderValue:Number(slider.value),exactPlotMarkupRestored:plotElement.querySelector('svg').outerHTML===originalPlotMarkup,before,warmed,during,afterDeferred,afterNextInput,restoredStyle,afterIdle,calls};
}finally{style?.remove();if(gesture)session.commitStudentVariableOperation(gesture,originalValue);b.getRegionBoundsMap=original}
};
try {
 const response=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Layout probe timed out')),30000);
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id===1){clearTimeout(timer);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result)}});
  ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:`(${probe})()`,awaitPromise:true,returnByValue:true}}));
 });
 if(response.exceptionDetails)throw Error(JSON.stringify(response.exceptionDetails));
 await writeFile(output,JSON.stringify(response.result.value,null,2)+'\n');
 console.log(JSON.stringify(response.result.value,null,2));
}finally{ws.close()}

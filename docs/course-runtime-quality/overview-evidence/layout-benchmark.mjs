import {readFile,writeFile} from 'node:fs/promises';
import {reduceCanonicalEvents} from '/Users/alan0x/Documents/projects/octos-lesson-language/dist/packages/core/src/index.js';
import {computeBoardLayout} from '/Users/alan0x/Documents/projects/octos-lesson-language/dist/packages/web-runtime/src/layout.js';
const reports=[];
for(const id of ['surface-paraboloid-level-sets','surface-partial-derivative-slice','surface-saddle-point-analysis']){
 const events=(await readFile(`/tmp/teaching-layout-packs/${id}/course.oll.jsonl`,'utf8')).trim().split('\n').map(JSON.parse);
 const state=reduceCanonicalEvents(events),nodeSections={};
 for(const event of events)for(const beat of event.step?.beats??[])for(const actions of Object.values(beat.stage))for(const action of actions)if(action.op==='board.create')nodeSections[action.node.id]=event.step.id;
 const run=x=>computeBoardLayout(state,{}, {regions:Object.fromEntries([...new Set(Object.values(state.nodes).map(n=>n.region_id))].map(region=>[region,{x,y:20,flow:'teaching',nodeSections,composition:{width:1920,height:1080,mode:'overview',insets:{top:92,bottom:120}}}]))});
 const modes={};
 for(const mode of ['uncached','cached']){run(20);const values=[];for(let i=0;i<30;i++){const start=performance.now();run(mode==='cached'?20:100+i);values.push(performance.now()-start);}values.sort((a,b)=>a-b);modes[mode]={p50Ms:values[15],p95Ms:values[28],maxMs:values[29]};}
 reports.push({id,nodes:Object.keys(state.nodes).length,modes});
}
await writeFile('/tmp/overview-benchmark.json',JSON.stringify({scope:'Local layout only, 30 samples; excludes browser measurement, models, network and TTS. Canonical estimated node sizes; no host attachments.',reports},null,2));

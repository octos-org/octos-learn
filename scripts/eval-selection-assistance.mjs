import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const root=process.env.LEARNING_COACH_DIR;
if (!root || !process.env.SELECTION_BASELINE_EXECUTABLE) throw new Error('Set LEARNING_COACH_DIR and SELECTION_BASELINE_EXECUTABLE');
const output=process.env.SELECTION_EVAL_OUTPUT || '/private/tmp/whiteboard-selection-eval';await mkdir(output,{recursive:true});
const env={...process.env,OLL_PROVIDER:process.env.OLL_PROVIDER || 'vertex',OLL_MODEL:process.env.OLL_MODEL || 'gemini-3.6-flash',OCTOS_WORK_DIR:output};
const allCases=[['rewrite','将其更改为可以绘制函数图像的形式','custom-question'],['explain','解释这个式子表示什么','explain'],['plot','画出这个式子表示的三维曲面','generate-plot'],['check','检查这个式子并给出建议','check-and-suggest']];
const requestedCases=new Set((process.env.SELECTION_EVAL_CASES||'').split(',').map(value=>value.trim()).filter(Boolean));
const cases=requestedCases.size?allCases.filter(([id])=>requestedCases.has(id)):allCases;
if(!cases.length)throw new Error(`No matching cases in SELECTION_EVAL_CASES: ${[...requestedCases].join(',')}`);
const runs=[];
for(let repeat=0;repeat<Number(process.env.SELECTION_EVAL_REPEATS || 20);repeat++)for(const [id,question,tool]of cases)for(const version of (repeat%2?['candidate','baseline']:['baseline','candidate'])){
 const turn=`${version}-${id}-${repeat}`;const start=Date.now();
 const input={turn_id:turn,learner_request:question,tool_id:tool,content_hint:'math',recognized_content:'y=x^2+z^3',recognition_confidence:'high',source:{source_id:'source',document_id:'eval',document_version:1,bounds:{x:0,y:0,width:200,height:60},checksum:{algorithm:'sha-256',value:'a'.repeat(64)}},board:{board_id:'eval',revision:1,targets:[]}};
 if(version==='candidate') input.capabilities=['board_writing'];
 const executable=version==='baseline'?process.env.SELECTION_BASELINE_EXECUTABLE:process.env.SELECTION_CANDIDATE_EXECUTABLE || root+'/main';
 const child=spawn(process.execPath,[executable,'oll_enhance_selection'],{cwd:root,env,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.stdin.end(JSON.stringify(input));
 const timer=setTimeout(()=>child.kill(),30000);const code=await new Promise(r=>child.on('close',r));clearTimeout(timer);
 let protocol;try{protocol=JSON.parse(stdout);}catch{}
 const row={id,repeat,version,elapsed_ms:Date.now()-start,success:code===0&&protocol?.success===true};
 if(row.success){const artifact=JSON.parse(await readFile(protocol.files_to_send[0],'utf8'));row.kind=artifact.response.kind;row.text=artifact.response.text;row.response=artifact.response;}
 else {row.error_code=protocol?.error_code??'process-failed';row.error=protocol?.output??'No protocol response';}
 const traces=stderr.split('\n').flatMap(line=>{try{return [JSON.parse(line.slice(line.indexOf('{')))];}catch{return [];}});row.metrics=traces.filter(t=>t.stage==='model-call'&&t.status==='completed');
 runs.push(row);await writeFile(output+'/paired.json',JSON.stringify({provider:env.OLL_PROVIDER,model:env.OLL_MODEL,runs},null,2));console.log(JSON.stringify({id,version,repeat,success:row.success,ms:row.elapsed_ms,kind:row.kind,error:row.error_code}));
 if(!row.success && runs.slice(-4).every(r=>!r.success) && runs.length>=4){console.log('Stopped after repeated provider errors; raw credentials are not logged.');process.exit(1);}
}

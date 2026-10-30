// Existing-account acceptance. Network sends require an approved, pinned plan,
// the model budget gateway, and one exact first-narration gate per sample.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {chromium,request as browserRequest} from 'playwright';
import {createServer as createViteServer} from 'vite';
import {TrialLedger,validateTrialPlan,sha256} from './lib/learning-performance-control.mjs';
import {createLanguageSpeechGate,reserveLanguageInvocation} from './lib/i18n-acceptance-control.mjs';
import {loginExistingTrialOwner} from './lib/learning-performance-auth.mjs';
import {firstPlayableTarget} from './lib/learning-performance-target.mjs';
import {installLivePlayableProbe,readLivePlayable} from './lib/learning-playable-probe.mjs';

const [mode,planPath]=process.argv.slice(2);
assert.ok(['--check','--execute','--fixture','--continue-reviewed'].includes(mode)&&planPath);
const plan=validateTrialPlan(JSON.parse(await readFile(planPath,'utf8')),{execute:['--execute','--continue-reviewed'].includes(mode)});
assert.equal(plan.limits.courses,2);assert.equal(plan.limits.model_requests,6);assert.equal(plan.limits.speech_requests,2);
assert.ok(plan.limits.usd_micros<=5000000&&plan.limits.cny_micros<=2000000);
assert.ok(plan.limits.request_bytes<=131072&&plan.limits.output_tokens<=32768&&plan.limits.speech_utf8_bytes<=1200);
assert.deepEqual(plan.samples.map(s=>s.language),['zh-CN','en-US']);
if(mode==='--check'){console.log(JSON.stringify({approved:plan.status==='approved',model_limit:6,speech_limit:2,usd_limit:5,cny_limit:2,real_supplier_calls:0}));process.exit(0);}
const output=resolve(plan.output_directory);assert.ok(output.startsWith(resolve('.local-dev/i18n-live')+'/'));
await mkdir(output,{recursive:true,mode:0o700});
let fixture=null,ledger=null,context=null,browser=null,vite=null,client=null;
const resultPath=join(output,mode==='--continue-reviewed'?'continued-result.json':'result.json');
const report={scope:'Two existing-account language samples; not a live p50 comparison',status:'preflight',plan_sha256:sha256(JSON.stringify(plan)),rows:[],started_at:new Date().toISOString(),real_supplier_calls:mode==='--fixture'?0:'see persistent ledger'};
await writeFile(resultPath,JSON.stringify(report),{flag:'wx',mode:0o600});
const save=()=>writeFile(resultPath,JSON.stringify(report,null,2)+'\n',{mode:0o600,flush:true});
let origin=plan.origin,backend=plan.backend,gatewayUrl=plan.gateway;
if(mode==='--fixture'){
 const {createLiveTrialFixture}=await import('./lib/learning-performance-fixture.mjs');
 ledger=new TrialLedger(join(output,'ledger.sqlite'),plan);
 fixture=await createLiveTrialFixture({plan,ledger,directory:join(output,'fixture'),languageAware:true});origin=fixture.origin;backend=fixture.origin;gatewayUrl=fixture.gateway;
}else ledger=new TrialLedger(join(output,'ledger.sqlite'),plan);
let samples=plan.samples;
if(mode==='--continue-reviewed'){
 // An explicit renewed authorization and independent read-only evidence are
 // required. Preserve the stopped report and its expenses; never rerun Chinese.
 const originalBytes=await readFile(join(output,'result.json'));const original=JSON.parse(originalBytes);
 const review=JSON.parse(await readFile(join(output,'zh-readonly-review.json'),'utf8'));
 const permission=JSON.parse(await readFile(join(output,'continuation-authorization.json'),'utf8'));
 assert.equal(permission.status,'approved');assert.equal(permission.next_sample_id,'en');assert.deepEqual(permission.limits,plan.limits);assert.ok(permission.authorization_reference?.trim());
 assert.equal(permission.previous_result_sha256,sha256(originalBytes));assert.equal(review.original_result_sha256,sha256(originalBytes));assert.equal(original.status,'stopped');assert.equal(original.rows.length,1);
 const row=original.rows[0];assert.equal(row.id,'zh');assert.equal(row.actions,1);assert.equal(row.turns,0);assert.equal(row.speech_forwarded,1);assert.equal(row.page_errors.length,0);assert.ok(row.audio_ms&&row.visual_ms);assert.match(row.error,/Job reader RPC failed/);
 assert.equal(review.job.status,'succeeded');assert.equal(review.speech.audio_sha256,sha256(await readFile(join(output,'zh-first.mp3'))));assert.equal(review.speech.audio_sha256,row.audio_sha256);
 const snapshot=ledger.snapshot();assert.equal(snapshot.samples.length,1);assert.equal(snapshot.samples[0].id,'zh');assert.equal(snapshot.samples[0].session_id,row.session_id);assert.equal(snapshot.samples[0].state,'reserved');
 const model=snapshot.expenses.filter(x=>x.kind==='model');assert.ok(model.length>0&&model.length<plan.limits.model_requests);assert.equal(review.model_http_attempts,model.length);assert.equal(review.model_trace.reduce((n,x)=>n+x.request_attempts,0),model.length);assert.ok(review.model_trace.every(x=>x.status==='completed'&&x.model===plan.model));assert.equal(snapshot.expenses.filter(x=>x.kind==='speech').length,1);
 report.reviewed_previous_sample={id:'zh',source_result_sha256:sha256(originalBytes),readonly_review_sha256:sha256(await readFile(join(output,'zh-readonly-review.json'))),model_requests:model.length,speech_requests:1};
 ledger.complete('zh',{jobsTerminal:true,measurementValid:true});samples=plan.samples.slice(1);
}else assert.equal(ledger.snapshot().samples.length,0,'A prior attempt exists; do not reset or resubmit');
const en=JSON.parse(await readFile('src/i18n/messages/en.json','utf8'));
let currentRow=null,turnId=null,sessionId=null,invalid=false,ownedSocket=null;
async function readonlyJob(page,wait=true){
 return page.evaluate(async({sessionId,turnId,owner,wait})=>{
  const token=localStorage.getItem('octos_session_token');const url=new URL('/api/ui-protocol/ws',location.href);url.protocol='wss:';url.searchParams.set('token',token);for(const f of ['skill.actions.v1','skill.action_jobs.v1','auxiliary.rest_to_ws.v1'])url.searchParams.append('ui_feature',f);
  const ws=new WebSocket(url);await new Promise((done,fail)=>{ws.onopen=done;ws.onerror=()=>fail(Error('Job reader connection failed'));});let seq=0;
  const rpc=(method,params)=>new Promise((done,fail)=>{const id=`language-read-${++seq}`,timer=setTimeout(()=>fail(Error('Job reader timeout')),10000);ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id!==id)return;clearTimeout(timer);r.error?fail(Error('Job reader RPC failed')):done(r.result);};ws.send(JSON.stringify({jsonrpc:'2.0',id,method,params:{...params,profile_id:owner}}));});
  try{const deadline=Date.now()+(wait?300000:1000);do{const{jobs=[]}=await rpc('skill/action/job/list',{session_id:sessionId});const own=jobs.filter(j=>j.action_id==='learning.lesson.generate');
    if(own.length&&own.every(j=>!['queued','running'].includes(j.status))){const{files=[]}=await rpc('session/files.list',{session_id:sessionId});return{jobs:own.map(j=>({id:j.job_id,status:j.status})),files};}
    if(!wait)return{jobs:own.map(j=>({id:j.job_id,status:j.status})),files:[]};await new Promise(done=>setTimeout(done,500));
   }while(Date.now()<deadline);throw Error('Background generation still running');}finally{ws.close();}
 },{sessionId,turnId,owner:plan.owner,wait});
}
try{
 client=await browserRequest.newContext({ignoreHTTPSErrors:true});
 const response=await client.get(`${gatewayUrl}/trial/status`);assert.equal((await response.json()).policy_sha256,report.plan_sha256);
 const {token,profile}=await loginExistingTrialOwner({owner:plan.owner,registryRoot:mode==='--fixture'?undefined:join(homedir(),'.octos'),request:(p,o)=>client.fetch(backend+p,o)});
 assert.equal(profile.config.llm.primary.model_id,plan.model);
 if(mode!=='--fixture'){
  assert.equal(profile.config.llm.primary.route?.base_url,`${gatewayUrl}/v1beta`);assert.equal(profile.config.llm.primary.route?.api_type,'gemini');assert.equal(profile.config.llm.fallbacks?.length??0,0);
  for(const [path,digest]of Object.entries(plan.artifacts))assert.equal(sha256(await readFile(path)),digest,'Pinned candidate changed');
 }
 const headers={Authorization:`Bearer ${token}`};
 const metadata=await(await client.get(`${origin}/api/learn/byok`,{headers})).json();assert.equal(metadata.services?.tts?.params?.voice,plan.voice);assert.equal(metadata.services?.tts?.params?.resource_id,plan.resource);
 if(mode!=='--fixture')assert.equal(metadata.services.tts.revision,plan.voice_revision);
 vite=await createViteServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
 const {materializeOllLesson}=await vite.ssrLoadModule('/src/learning/oll/oll-materialization.ts');const {ollArtifactIdentity}=await vite.ssrLoadModule('/src/learning/oll/oll-artifacts.ts');
 browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});report.status='running';await save();
 for(const sample of samples){
  currentRow={id:sample.id,language:sample.language,prompt:sample.prompt,state:'opening',actions:0,turns:0,speech_forwarded:0,speech_blocked:0,artifacts:[],page_errors:[]};report.rows.push(currentRow);const row=currentRow;turnId=null;sessionId=null;invalid=false;let target=null,speechGate=null,resolveTarget;
  const targetReady=new Promise(done=>{resolveTarget=done;});const openedSessions=new Set();
  context=await browser.newContext({ignoreHTTPSErrors:true,serviceWorkers:'block',viewport:{width:1440,height:1000}});
  await context.addInitScript(({token,owner,locale,teacher})=>{localStorage.setItem('octos_session_token',token);localStorage.setItem('selected_profile',owner);localStorage.setItem(`octos-learn:setup-skipped:${owner}`,'yes');localStorage.setItem('octos_learning_auto_camera','false');localStorage.setItem('octos_learning_input_mode','text');localStorage.setItem('octos-locale',locale);localStorage.setItem('octos-learn-teacher',teacher);localStorage.setItem('octos-learn-teacher-owner',owner);},{token,owner:plan.owner,locale:sample.language,teacher:plan.teacher_id});
  await context.grantPermissions(['local-network-access'],{origin});
  await context.addInitScript(installLivePlayableProbe);
  await context.routeWebSocket(()=>true,socket=>{
   const u=new URL(socket.url());
   if(u.pathname==='/'){const remote=socket.connectToServer();socket.onMessage(d=>remote.send(d));remote.onMessage(d=>socket.send(d));return;}// Vite HMR, no model route.
   if(u.origin!==origin.replace('https:','wss:')||u.pathname!=='/api/ui-protocol/ws'){invalid=true;socket.close();return;}
   const remote=socket.connectToServer();ownedSocket=socket;
   socket.onMessage(data=>{let method;try{const q=JSON.parse(String(data));method=q.method;if(q.method==='turn/start'){row.turns++;throw Error('Unexpected ordinary model turn');}
    if(q.method==='skill/action/invoke'){
     assert.equal(row.state,'armed');assert.equal(row.actions,0);
     ({sessionId,turnId}=reserveLanguageInvocation({ledger,sample,openedSessions},q));row.session_id=sessionId;row.turn_id=turnId;row.state='reserved';row.actions++;
    }else if(q.method){assert.ok(['session/open','session/hydrate','session/files.list','session/list','skill/action/list','skill/action/job/list','session/status.get','session/workspace.get','session/title.set','loop/list','session/goal/get','memory/overview','session/messages_page','ping'].includes(q.method),'Unreviewed RPC');if(q.method==='session/open')openedSessions.add(q.params.session_id);}remote.send(data);
   }catch(error){row.blocked_rpc=method;row.rpc_error=error.message;invalid=true;socket.close();}});remote.onMessage(data=>socket.send(data));
  });
  const page=await context.newPage();page.on('pageerror',e=>row.page_errors.push(e.message));
  const courseFiles=new Set();
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   try{
    if(url.origin!==origin)return route.abort('blockedbyclient');
    if(url.pathname.startsWith('/api/learn/history/')&&(/\/claim(?:\?|$)/.test(url.pathname)||req.method()!=='GET'))return route.fulfill({status:503,json:{}});
    if(url.pathname==='/api/learn/byok/tts/relay'){
     await Promise.race([targetReady,new Promise((_,fail)=>setTimeout(()=>fail(Error('No first narration target')),30000))]);
     const body=req.postDataJSON();
     (row.speech_requests??=[]).push({text:body.payload?.req_params?.text,speaker:body.payload?.req_params?.speaker,additions:body.payload?.req_params?.additions});
     if(body.payload?.req_params?.text?.trim()!==target.narrationText||row.speech_forwarded){row.speech_blocked++;return route.fulfill({status:503,json:{}});}
     const actual=await speechGate(body);return route.fulfill({response:actual});
    }
    if(url.pathname.startsWith('/api/learn/byok/')&&req.method()!=='GET'&&url.pathname!=='/api/learn/byok/prepare')return route.abort('blockedbyclient');
    if(url.pathname.startsWith('/api/files')&&req.method()==='GET'){
     const file=url.searchParams.get('path')??decodeURIComponent(url.pathname.slice('/api/files/'.length));
     if(turnId&&file.split('/').at(-1).startsWith(turnId+'.')&&file.endsWith('.octos-lesson.json')){
      const response=await route.fetch();assert.equal(response.status(),200);const authoring=await response.json();assert.equal(authoring.lesson.language,sample.language);
      if(!courseFiles.has(file)){courseFiles.add(file);const name=`${sample.id}-part-${courseFiles.size}.json`;await writeFile(join(output,name),JSON.stringify(authoring,null,2)+'\n',{mode:0o600});row.artifacts.push({path:name,sha256:sha256(JSON.stringify(authoring)),language:authoring.lesson.language});}
      if(!target){target=firstPlayableTarget(authoring,{filename:file.split('/').at(-1),sessionId,materializeOllLesson,ollArtifactIdentity});assert.ok(Buffer.byteLength(target.narrationText)<=plan.limits.speech_utf8_bytes);
       await page.evaluate(t=>{window.__livePlayableProbe.target=t;},target);
       speechGate=createLanguageSpeechGate({ledger,sampleId:sample.id,text:target.narrationText,language:sample.language,speaker:plan.course_voice,send:async body=>{
        row.speech_forwarded++;await save();const response=await client.post(`${origin}/api/learn/byok/tts/relay`,{headers,data:body,maxRetries:0});assert.equal(response.status(),200);const data=await response.json();assert.equal(data.status,200);const chunks=data.body.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));assert.ok(chunks.every(x=>x.code===0||x.code===20000000));
        const audio=Buffer.concat(chunks.filter(x=>x.data).map(x=>Buffer.from(x.data,'base64')));assert.ok(audio.length);row.audio_sha256=sha256(audio);row.narration_text=target.narrationText;row.speaker=body.payload.req_params.speaker;row.additions=body.payload.req_params.additions;await writeFile(join(output,sample.id+'-first.mp3'),audio,{mode:0o600});await page.evaluate(hash=>{window.__livePlayableProbe.audioSha256=hash;},row.audio_sha256);await save();return response;
       }});resolveTarget();
      }return route.fulfill({response});
     }
    }
    if(mode==='--fixture' && !url.pathname.startsWith('/api/')) {
      const root=resolve('dist');const relative=req.isNavigationRequest()?'index.html':decodeURIComponent(url.pathname).slice(1);const file=resolve(root,relative);assert.ok(file.startsWith(root+'/'));
      const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
      return route.fulfill({body:await readFile(file),contentType:mime[file.slice(file.lastIndexOf('.'))]??'application/octet-stream'});
    }
    return route.continue();
   }catch(error){row.route_error=error.message;invalid=true;return route.fulfill({status:503,json:{}}).catch(()=>undefined);}
  });
  try{
   await save();await page.goto(`${origin}/board?new-board=1`);
   const input=page.getByRole('textbox',{name:sample.language==='zh-CN'?'输入学习问题':en['输入学习问题'],exact:true});await input.waitFor({state:'visible',timeout:30000});await page.waitForFunction(()=>document.querySelector('input[aria-label],textarea[aria-label]')&&!document.querySelector('input[aria-label],textarea[aria-label]').disabled);
   row.initial_session_id=await page.evaluate(owner=>localStorage.getItem(`octos_learning_current_session_v2:${encodeURIComponent(owner)}`),plan.owner);assert.ok(row.initial_session_id);
   // A known speaker follows this existing teacher; do not select another teacher.
   assert.equal(await page.evaluate(()=>localStorage.getItem('octos-learn-teacher')),plan.teacher_id);
   await input.fill(sample.prompt);row.state='armed';await save();
   await page.getByRole('button',{name:sample.language==='zh-CN'?'发送问题':en['发送问题'],exact:true}).click();
   await page.waitForFunction(()=>window.__livePlayableProbe.audio&&window.__livePlayableProbe.visual,null,{timeout:mode==='--fixture'?7000:180000});
   Object.assign(row,await readLivePlayable(page));row.state='first-playable';await page.screenshot({path:join(output,sample.id+'-course.png'),fullPage:true});await save();
   const before=await page.evaluate(()=>{window.__languageNodes=[...document.querySelectorAll('.board-node')];return{audio:window.__livePlayableProbe.audioSources,nodes:window.__languageNodes.length};});const callsBefore=row.actions;
   await page.getByRole('button',{name:sample.language==='zh-CN'?'English':'中文',exact:true}).click();await page.waitForTimeout(200);
   row.switch_check=await page.evaluate(before=>({same_nodes:window.__languageNodes.every(n=>n.isConnected),same_audio_sources:window.__livePlayableProbe.audioSources===before.audio,nodes:before.nodes}),before);assert.ok(row.switch_check.same_nodes&&row.switch_check.same_audio_sources);assert.equal(row.actions,callsBefore);
   const pause=page.getByRole('button',{name:sample.language==='zh-CN'?en['暂停 OLL 课程']:'暂停 OLL 课程',exact:true});if(await pause.count())await pause.click();
   const final=await readonlyJob(page);row.jobs=final.jobs;assert.ok(final.jobs.length===1&&final.jobs.every(j=>j.status==='succeeded'));
   row.files=final.files.filter(f=>f.filename.startsWith(turnId)).map(f=>({filename:f.filename,path:f.path}));
   for(const file of final.files.filter(f=>f.filename.startsWith(turnId)&&f.filename.endsWith('.generation-trace.jsonl'))){const response=await client.get(`${origin}/api/files?${new URLSearchParams({path:file.path,session:sessionId})}`,{headers});assert.equal(response.status(),200);const trace=(await response.text()).split('\n').filter(Boolean).map(line=>JSON.parse(line));row.model_trace=trace.filter(x=>x.stage==='model-call'&&['completed','failed'].includes(x.status)).map(x=>({status:x.status,model:x.model,label:x.label,request_attempts:x.request_attempts}));}
   assert.equal(row.actions,1);assert.equal(row.turns,0);assert.equal(row.speech_forwarded,1);assert.equal(invalid,false);assert.equal(row.page_errors.length,0);
   const reservations=ledger.snapshot().expenses.filter(x=>x.sample_id===sample.id&&x.kind==='model').length;row.model_http_reservations=reservations;assert.ok(reservations>0);assert.equal(row.model_trace?.reduce((sum,x)=>sum+(x.request_attempts??0),0),reservations);
   ledger.complete(sample.id,{jobsTerminal:true,measurementValid:true});row.state='completed';await save();
  }catch(error){row.error=error.message;row.state='stopped';row.page_diagnostic=await page.evaluate(()=>({text:document.body.innerText.slice(0,1500),url:location.pathname})).catch(()=>null);report.status='stopped';await page.screenshot({path:join(output,sample.id+'-failure.png'),fullPage:true}).catch(()=>undefined);
   if(sessionId&&row.actions)try{row.terminal_after_failure=await readonlyJob(page);}catch(e){row.background_job_error=e.message;}
   await save();throw error;
  }finally{await context.close();context=null;}
 }
 report.status='completed';report.completed_at=new Date().toISOString();await save();console.log(JSON.stringify({status:report.status,rows:report.rows.map(r=>({id:r.id,state:r.state,model_requests:r.model_http_reservations,speech:r.speech_forwarded,playable_ms:r.playable_ms}))}));
}catch(error){report.status='stopped';report.error=error.message;await save();console.error('Language acceptance stopped; inspect protected result.json. No automatic retry.');process.exitCode=1;}
finally{report.reservations=ledger.snapshot().expenses.map(({id,...r})=>r);await save();await context?.close();await browser?.close();await vite?.close();await client?.dispose();await fixture?.close();ledger.close();}

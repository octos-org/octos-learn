import test from 'node:test';
import assert from 'node:assert/strict';
import { TrialLedger } from './lib/learning-performance-control.mjs';
import { createLanguageModelGateway, createLanguageSpeechGate, reserveLanguageInvocation } from './lib/i18n-acceptance-control.mjs';
const plan = () => ({ schema: 'octos.learn.performance-trial.v1', id: 'language-test', status: 'draft', model: 'gemini-3.6-flash', voice: 'saved', resource: 'seed-tts-2.0',
 limits: { courses: 2, model_requests: 6, speech_requests: 2, usd_micros: 5000000, cny_micros: 2000000, model_request_usd_micros: 700000, speech_byte_cny_micros: 800, speech_utf8_bytes: 1200, output_tokens: 32768, request_bytes: 131072 },
 samples: [{ id: 'zh', version: 'candidate', language: 'zh-CN', prompt: '请讲斜率' }, { id: 'en', version: 'candidate', language: 'en-US', prompt: '请讲斜率' }] });
const body = (text, language, speaker = 'teacher') => ({ provider: 'volcano', params: { voice: 'saved', resource_id: 'seed-tts-2.0' }, payload: { req_params: { text, speaker, audio_params: { format: 'mp3', sample_rate: 24000 }, additions: JSON.stringify({ explicit_language: language }) } } });
test('new-board session replacement reserves the actual invocation once before forwarding', () => {
 const p=plan(),ledger=new TrialLedger(':memory:',p);
 const options={ledger,sample:p.samples[0],openedSessions:new Set(['learn-initial','learn-current'])};
 const invoke=session=>({method:'skill/action/invoke',params:{session_id:session,action_id:'learning.lesson.generate',arguments:{language:'zh-CN',learner_request:'请讲斜率',turn_id:'turn-1'}}});
 try {
  assert.throws(()=>reserveLanguageInvocation(options,invoke('learn-unopened')));
  const wrong=invoke('learn-current');wrong.params.arguments.language='en-US';assert.throws(()=>reserveLanguageInvocation(options,wrong));
  assert.equal(ledger.snapshot().samples.length,0);
  assert.deepEqual(reserveLanguageInvocation(options,invoke('learn-current')),{sessionId:'learn-current',turnId:'turn-1'});
  assert.equal(ledger.snapshot().samples[0].session_id,'learn-current');
  assert.throws(()=>reserveLanguageInvocation(options,invoke('learn-current')));
  assert.equal(ledger.snapshot().samples.length,1);
 } finally { ledger.close(); }
});
test('only matching language and existing course voice reach speech transport once', async () => {
 const ledger = new TrialLedger(':memory:', plan());ledger.reserveSample('zh', 'learn-zh');let calls=0;
 try { const gate = createLanguageSpeechGate({ ledger, sampleId:'zh', text:'斜率是二。', language:'zh-CN', speaker:'teacher', send:async payload=>{calls++;assert.equal(payload.payload.req_params.speaker,'teacher');assert.equal(payload.payload.req_params.additions,JSON.stringify({explicit_language:'zh-cn'}));} });
 await assert.rejects(()=>gate(body('斜率是二。','en')));await assert.rejects(()=>gate(body('斜率是二。','zh-cn','other')));await assert.rejects(()=>gate(body('另一句。','zh-cn')));
 await gate(body('斜率是二。','zh-cn'));await assert.rejects(()=>gate(body('斜率是二。','zh-cn')));assert.equal(calls,1);
 } finally {ledger.close();}
});
test('a lost speech response consumes its sole reservation and cannot be retried', async () => {
 const ledger=new TrialLedger(':memory:',plan());ledger.reserveSample('zh','learn-zh');let calls=0;
 try {const gate=createLanguageSpeechGate({ledger,sampleId:'zh',text:'斜率是二。',language:'zh-CN',speaker:'teacher',send:async()=>{calls++;throw Error('lost');}});
 await assert.rejects(gate(body('斜率是二。','zh-cn')));await assert.rejects(()=>gate(body('斜率是二。','zh-cn')));assert.equal(calls,1);assert.equal(ledger.snapshot().expenses.length,1);
 }finally{ledger.close();}
});
test('the seventh model request is blocked even when money remains', () => {
 const p=plan();p.limits.model_request_usd_micros=1;const ledger=new TrialLedger(':memory:',p);ledger.reserveSample('zh','learn-zh');
 try{for(let i=0;i<6;i++)ledger.reserveModel('zh');assert.throws(()=>ledger.reserveModel('zh'),/Model request limit/);assert.equal(ledger.snapshot().expenses.length,6);}finally{ledger.close();}
});
test('completing Chinese preserves all supplier reservations for the English sample', () => {
 const ledger=new TrialLedger(':memory:',plan());
 try {
  ledger.reserveSample('zh','learn-zh');ledger.reserveModel('zh');ledger.reserveModel('zh');ledger.reserveSpeech('zh','中文。');
  ledger.complete('zh',{jobsTerminal:true,measurementValid:true});ledger.reserveSample('en','learn-en');
  for(let i=0;i<4;i++)ledger.reserveModel('en');assert.throws(()=>ledger.reserveModel('en'),/Model request limit/);
  ledger.reserveSpeech('en','Slope is two.');assert.throws(()=>ledger.reserveSpeech('en','Retry.'));
  assert.equal(ledger.snapshot().expenses.filter(x=>x.kind==='model').length,6);assert.equal(ledger.snapshot().expenses.filter(x=>x.kind==='speech').length,2);
  assert.throws(()=>ledger.reserveSample('zh','learn-new-zh'));
 }finally{ledger.close();}
});
test('wrong-language initial request and requests after a supplier failure are blocked before transport', async()=>{
 const ledger=new TrialLedger(':memory:',plan());ledger.reserveSample('zh','learn-zh');let calls=0;
 const gate=createLanguageModelGateway({ledger,activeSample:()=> 'zh',upstreamFetch:async()=>{calls++;return new Response('{}',{status:503});}});await new Promise(done=>gate.server.listen(0,'127.0.0.1',done));
 const payload=language=>({contents:[{parts:[{text:JSON.stringify({course_context:{language,learner_request:'请讲斜率'}})}]}],generationConfig:{maxOutputTokens:32768}});
 const call=language=>fetch(`http://127.0.0.1:${gate.server.address().port}/v1beta/models/gemini-3.6-flash:generateContent`,{method:'POST',headers:{'x-goog-api-key':'synthetic'},body:JSON.stringify(payload(language))});
 try{assert.equal((await call('en-US')).status,402);assert.equal(calls,0);assert.equal((await call('zh-CN')).status,503);assert.equal((await call('zh-CN')).status,402);assert.equal(calls,1);assert.equal(ledger.snapshot().expenses.length,1);}finally{gate.server.closeAllConnections();await new Promise(done=>gate.server.close(done));ledger.close();}
});

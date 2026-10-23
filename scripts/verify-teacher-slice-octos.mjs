// Teacher slice trial through an actual isolated Octos process and the
// installed Learning Coach lesson action. Every model request passes the local
// budget gateway, which reserves the plan's per-request cost before sending.
//
//   --fixture            free: synthetic Key, the gateway answers 503 itself
//   --live --key-file F  paid: needs an approved plan; reads the Key from F
//
// The Key is placed only in the temporary fixture profile, never printed or
// written to results, and the temporary Octos data directory is deleted.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { TrialLedger, createModelBudgetGateway, sha256, validateTrialPlan } from './lib/learning-performance-control.mjs';
import { loginExistingTrialOwner } from './lib/learning-performance-auth.mjs';

const args = process.argv.slice(2);
const [binary, skill, planPath, resultPath] = args;
const live = args.includes('--live'), fixture = args.includes('--fixture');
assert.ok(live !== fixture, 'Pass exactly one of --fixture or --live');
assert.ok(binary?.startsWith('/') && skill?.startsWith('/') && planPath && resultPath, 'Supply absolute Octos binary, Learning Coach directory, plan JSON and NEW result JSON path');
const reviewed = JSON.parse(await readFile(planPath, 'utf8'));
validateTrialPlan(reviewed, { execute: live });
const RULES = ['course_context.teacher_profile 是本次授课预设老师的基础设定', 'course_context.learner_background 是学习应用提供的学生背景'];

let key = 'synthetic-only-not-a-real-key', plan = reviewed, outDir;
if (live) {
  const keyFile = args[args.indexOf('--key-file') + 1];
  assert.ok(keyFile?.startsWith('/'), 'Supply --key-file with an absolute path');
  assert.equal((await stat(keyFile)).mode & 0o077, 0, 'Key file must not be readable by other users (chmod 600)');
  key = (await readFile(keyFile, 'utf8')).trim();
  assert.ok(key && !/\s/.test(key), 'Key file must hold one Key');
  outDir = reviewed.output_directory; await mkdir(outDir, { recursive: true, mode: 0o700 });
} else {
  // One sample, two admitted attempts: proves the route without a supplier.
  plan = { ...reviewed, id: `${reviewed.id}-fixture`, status: 'draft', samples: reviewed.samples.slice(0, 1),
    limits: { ...reviewed.limits, courses: 1, usd_micros: 2 * reviewed.limits.model_request_usd_micros } };
}
await writeFile(resultPath, '{}\n', { flag: 'wx', mode: 0o600 });
const root = await mkdtemp(join(tmpdir(), 'octos-teacher-trial-'));
const ledger = new TrialLedger(live ? join(outDir, 'ledger.sqlite') : join(root, 'ledger.sqlite'), plan);
let active = null;
const calls = [];
const gate = createModelBudgetGateway({ ledger, activeSample: () => active, upstreamFetch: async (url, init) => {
  assert.ok(url.startsWith(`https://generativelanguage.googleapis.com/v1beta/models/${plan.model}:`));
  const body = JSON.parse(init.body);
  const prompt = [body.systemInstruction, ...body.contents].flatMap(content => content?.parts ?? []).map(part => part.text).join('\n');
  const call = { sample: active, request_bytes: Buffer.byteLength(init.body), max_output_tokens: body.generationConfig.maxOutputTokens,
    prompt_has: { teacher_profile: prompt.includes('本次授课老师：'), learner_background: prompt.includes('【Octos 长期记忆】'),
      teacher_rule: prompt.includes(RULES[0]), background_rule: prompt.includes(RULES[1]) } };
  calls.push(call);
  if (!live) return new Response('{}', { status: 503 });
  const response = await fetch(url, init);
  const text = await response.text();
  call.status = response.status;
  const usage = text.match(/"usageMetadata"\s*:\s*(\{[^}]*\})/g)?.at(-1);
  if (usage) call.usage = JSON.parse(usage.replace(/^"usageMetadata"\s*:\s*/, ''));
  const n = calls.filter(c => c.sample === active).length;
  await writeFile(join(outDir, `${active}.call-${n}.request.json`), init.body, { mode: 0o600 });
  await writeFile(join(outDir, `${active}.call-${n}.response.txt`), text, { mode: 0o600 });
  return new Response(text, { status: response.status, headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' } });
} });
await new Promise(done => gate.server.listen(0, '127.0.0.1', done));
const gateway = `http://127.0.0.1:${gate.server.address().port}/v1beta`;
const spare = createServer(); await new Promise(done => spare.listen(0, '127.0.0.1', done)); const port = spare.address().port; await new Promise(done => spare.close(done));
const origin = `http://127.0.0.1:${port}`, data = join(root, 'octos'), config = join(root, 'config.json');
await writeFile(config, JSON.stringify({ provider: 'gemini', model: plan.model, base_url: gateway, api_key_env: 'GEMINI_API_KEY',
  env_vars: { GEMINI_API_KEY: 'synthetic-only-not-a-real-key' }, memory: { refresh: { enabled: false } } }), { mode: 0o600 });
const delay = ms => new Promise(done => setTimeout(done, ms));
const log = [], results = [];
let child, socket, failure;
try {
  const start = async () => {
    child = spawn(resolve(binary), ['serve', '--host', '127.0.0.1', '--port', String(port), '--data-dir', data, '--config', config, '--solo'], {
      cwd: root, env: { PATH: process.env.PATH, TMPDIR: '/private/tmp', GEMINI_BASE_URL: gateway, OCTOS_MEMORY_REFRESH_ENABLED: '0', OCTOS_NO_MODEL_DOWNLOAD: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', c => log.push(c)); child.stderr.on('data', c => log.push(c));
    for (let i = 0; i < 150; i++) {
      assert.equal(child.exitCode, null, 'Isolated Octos exited');
      try { if ((await fetch(`${origin}/api/auth/status`)).ok) return; } catch { /* startup */ }
      await delay(100);
    }
    throw new Error('Isolated Octos startup timed out');
  };
  await start();
  const owner = 'teacher-trial';
  const created = await fetch(`${origin}/api/auth/solo/create`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Teacher trial', username: owner, email: 'teacher-trial@solo.local' }) });
  assert.equal(created.status, 200);
  const installed = join(data, 'profiles', owner, 'data', 'skills', 'learning-coach'); await mkdir(installed, { recursive: true });
  for (const file of ['main', 'lesson-plan.js', 'manifest.json', 'oll-contract.json', 'references']) await cp(join(skill, file), join(installed, file), { recursive: true });
  const profilePath = join(data, 'profiles', `${owner}.json`);
  const profile = JSON.parse(await readFile(profilePath, 'utf8'));
  profile.config.llm = { primary: { family_id: 'google', model_id: plan.model, route: { base_url: gateway, api_type: 'gemini', api_key_env: 'GEMINI_API_KEY' } }, fallbacks: [] };
  profile.config.env_vars = { GEMINI_API_KEY: key };
  profile.config.sandbox.allow_network = true;
  await writeFile(profilePath, JSON.stringify(profile), { mode: 0o600 });
  await new Promise(done => { child.once('exit', done); child.kill('SIGTERM'); });
  await start();
  const { token } = await loginExistingTrialOwner({ request: (path, options) => fetch(origin + path, options), owner, registryRoot: data });
  const ws = new URL(`${origin.replace('http:', 'ws:')}/api/ui-protocol/ws`); ws.searchParams.set('token', token);
  for (const f of ['skill.actions.v1', 'skill.action_jobs.v1']) ws.searchParams.append('ui_feature', f);
  socket = new WebSocket(ws);
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = () => fail(Error('Trial protocol failed')); });
  let seq = 0;
  const rpc = (method, params) => new Promise((done, fail) => {
    const id = `trial-${++seq}`, timer = setTimeout(() => fail(Error(`Trial RPC ${method} timeout`)), 15000);
    socket.onmessage = e => { const r = JSON.parse(e.data); if (r.id !== id) return; clearTimeout(timer); if (r.error) fail(Error(`Trial RPC ${method} ${r.error.code}: ${r.error.message}`)); else done(r.result); };
    socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, profile_id: owner } }));
  });
  for (const sample of plan.samples) {
    const session = `teacher-trial-${sample.id}`, turnId = `teacher-trial-${sample.id}`;
    ledger.reserveSample(sample.id, session); active = sample.id;
    await rpc('session/open', { session_id: session, profile_id: owner });
    const { actions } = await rpc('skill/action/list', { session_id: session });
    const action = actions.find(a => a.id === 'learning.lesson.generate');
    assert.ok(action?.available, 'Lesson action unavailable');
    assert.ok(['teacher_profile', 'learner_background'].every(f => f in (action.input_schema?.properties ?? {})), 'Installed Learning Coach does not declare the teacher fields');
    const startedAt = Date.now();
    const accepted = await rpc('skill/action/invoke', { session_id: session, action_id: 'learning.lesson.generate', arguments: {
      turn_id: turnId, learner_request: sample.prompt, request_source: 'self_contained', input_modality: 'text', language: 'zh-CN',
      teacher_profile: sample.teacher_profile, learner_background: sample.learner_background } });
    assert.equal(accepted.ok, true, 'Octos rejected the lesson arguments'); assert.equal(accepted.jobs.length, 1);
    let job;
    for (let i = 0; i < 6000; i++) {
      const { jobs } = await rpc('skill/action/job/list', { session_id: session }); job = jobs.find(j => j.job_id === accepted.jobs[0].job_id);
      if (job && !['queued', 'running'].includes(job.status)) break;
      await delay(100);
    }
    const terminal = job && !['queued', 'running'].includes(job.status);
    const result = { id: sample.id, teacher: sample.teacher, topic: sample.topic, status: job?.status ?? 'unknown', elapsed_ms: Date.now() - startedAt,
      model_requests: calls.filter(c => c.sample === sample.id).length };
    if (live && job?.status === 'completed') {
      const find = async dir => { for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) { const found = await find(path); if (found) return found; } else if (entry.name === `${turnId}.octos-lesson.json`) return path;
      } };
      const lesson = await find(data);
      assert.ok(lesson, 'Completed job left no lesson file');
      await cp(lesson, join(outDir, `${sample.id}.lesson.json`)); result.lesson_sha256 = sha256(await readFile(lesson));
    }
    results.push(result);
    if (fixture) { assert.equal(terminal && job.status, 'failed', 'Fixture generation must fail at the stand-in supplier'); break; }
    // A failed course stops the trial: inspect before spending more.
    ledger.complete(sample.id, { jobsTerminal: terminal, measurementValid: job?.status === 'completed' });
    active = null;
  }
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  socket?.close();
  if (child?.exitCode === null && child.signalCode === null) await new Promise(done => { child.once('exit', done); child.kill('SIGTERM'); });
  gate.server.closeAllConnections(); await new Promise(done => gate.server.close(done));
  const spent = ledger.snapshot(); ledger.close();
  const octosLog = Buffer.concat(log);
  const logSaved = !octosLog.includes(key);
  if (logSaved) await writeFile(live ? join(outDir, 'octos.log') : `${resultPath}.octos.log`, octosLog, { mode: 0o600 });
  // The fixture profile holds the Key: remove the whole temporary Octos data.
  await rm(root, { recursive: true, force: true });
  const report = { checked_at: new Date().toISOString(), mode: live ? 'live' : 'fixture', passed: !failure, failure,
    plan_id: plan.id, plan_sha256: sha256(JSON.stringify(plan)), model: plan.model,
    octos_binary_sha256: sha256(await readFile(binary)), installed_skill_sha256: sha256(await readFile(join(skill, 'main'))),
    gateway: gate.metrics, admitted_requests: spent.expenses.length, reserved_usd_micros: spent.expenses.reduce((sum, x) => sum + x.usd, 0),
    calls, results, octos_log_saved: logSaved, temporary_octos_data_deleted: true, ...(live ? { output_directory: outDir } : { real_supplier_calls: 0 }) };
  await writeFile(resultPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
  if (failure) process.exitCode = 1;
}

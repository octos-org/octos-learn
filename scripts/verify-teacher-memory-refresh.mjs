// Does Octos' own memory refresh keep track of which preset teacher took part?
// An isolated Octos receives synthetic lessons exactly as Octos Learn
// delivers them (session/append_message, teacher label in the assistant body),
// runs its background extraction and consolidation, and the resulting
// long-term memory is saved for review. A plan with `phases` delivers each
// group of lessons only after the previous group was consolidated, so later
// lessons can change or contradict memory that already exists. Every model request passes a local
// gateway that reserves the plan's per-request cost before sending.
//
//   --fixture            free: synthetic Key; the gateway answers {"items":[]}
//   --live --key-file F  paid: needs an approved plan; reads the Key from F
//
// The Key is placed only in the temporary profile, never written to results,
// and the temporary Octos data directory is deleted.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loginExistingTrialOwner } from './lib/learning-performance-auth.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const args = process.argv.slice(2);
const [binary, planPath, resultPath] = args;
const live = args.includes('--live'), fixture = args.includes('--fixture');
assert.ok(live !== fixture, 'Pass exactly one of --fixture or --live');
assert.ok(binary?.startsWith('/') && planPath && resultPath, 'Supply absolute Octos binary, plan JSON and NEW result JSON path');
const plan = JSON.parse(await readFile(planPath, 'utf8'));
assert.equal(plan.schema, 'octos.learn.teacher-memory-refresh-trial.v1');
const { limits } = plan;
// body-label: the current Octos Learn delivery (label in front of the text);
// participant-field: UPCR-2026-053 `participant` on session/append_message.
assert.ok(['body-label', 'participant-field'].includes(plan.delivery ?? 'body-label'));
const viaField = plan.delivery === 'participant-field';
const phases = plan.phases ?? [plan.lessons];
assert.ok(Array.isArray(phases) && phases.length >= 1 && phases.length <= 3 && phases.every(lessons => Array.isArray(lessons) && lessons.length));
const allLessons = phases.flat();
assert.equal(new Set(allLessons.map(lesson => lesson.session_id)).size, allLessons.length, 'Session ids must be unique');
assert.ok(Number.isSafeInteger(limits.model_http_requests) && limits.model_http_requests <= 12);
assert.ok(limits.request_bytes <= 262144 && limits.output_tokens === 65536);
// Extraction requests may omit an output cap, so each reservation covers the
// largest admitted input plus the model's full output capacity.
assert.ok(limits.request_bytes * 0.75 + limits.output_tokens * 3.75 <= limits.reservation_usd_micros);
assert.equal(limits.usd_micros, limits.model_http_requests * limits.reservation_usd_micros);

let key = 'synthetic-only-not-a-real-key', outDir;
if (live) {
  assert.equal(plan.status, 'approved', 'Paid trial is not authorized');
  assert.ok(plan.authorization_reference?.trim() && plan.output_directory?.startsWith('/'));
  const keyFile = args[args.indexOf('--key-file') + 1];
  assert.ok(keyFile?.startsWith('/'), 'Supply --key-file with an absolute path');
  assert.equal((await stat(keyFile)).mode & 0o077, 0, 'Key file must not be readable by other users (chmod 600)');
  key = (await readFile(keyFile, 'utf8')).trim();
  assert.ok(key && !/\s/.test(key), 'Key file must hold one Key');
  outDir = plan.output_directory; await mkdir(outDir, { recursive: false, mode: 0o700 });
}
await writeFile(resultPath, '{}\n', { flag: 'wx', mode: 0o600 });
const root = await mkdtemp(join(tmpdir(), 'octos-teacher-memory-'));
const calls = [], metrics = { forwarded: 0, refused: 0 };
const kindOf = body => {
  const system = JSON.stringify(body.systemInstruction ?? body.system_instruction ?? '');
  return system.includes('distill ONE past conversation') ? 'extraction' : /consolidat|MEMORY\.md|ops/i.test(system) ? 'consolidation' : 'other';
};

const gate = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://local');
    assert.equal(request.method, 'POST');
    assert.ok([':generateContent', ':streamGenerateContent'].some(suffix => url.pathname === `/v1beta/models/${plan.model}${suffix}`));
    let size = 0; const chunks = [];
    for await (const chunk of request) { size += chunk.length; assert.ok(size <= limits.request_bytes, 'Request too large'); chunks.push(chunk); }
    const text = Buffer.concat(chunks).toString('utf8'), body = JSON.parse(text);
    const max = (body.generationConfig ?? body.generation_config)?.maxOutputTokens ?? (body.generationConfig ?? body.generation_config)?.max_output_tokens;
    assert.ok(max === undefined || max <= limits.output_tokens);
    assert.ok(calls.length < limits.model_http_requests, 'Request cap reached');
    const call = { n: calls.length + 1, kind: kindOf(body), request_bytes: size, teacher_labels: ['阿澜老师', '豆豆老师'].filter(name => text.includes(viaField ? `(participant: ${name})` : `【${name}】`)) };
    calls.push(call);
    if (outDir) await writeFile(join(outDir, `call-${call.n}.request.json`), text, { mode: 0o600 });
    if (fixture) {
      metrics.forwarded++;
      const reply = { candidates: [{ content: { role: 'model', parts: [{ text: '{"items":[]}' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } };
      response.writeHead(200, { 'content-type': url.search === '?alt=sse' ? 'text/event-stream' : 'application/json' });
      response.end(url.search === '?alt=sse' ? `data: ${JSON.stringify(reply)}\n\n` : JSON.stringify(reply));
      return;
    }
    metrics.forwarded++;
    const upstream = await fetch(`https://generativelanguage.googleapis.com${url.pathname}${url.search}`, { method: 'POST', redirect: 'error',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': request.headers['x-goog-api-key'] ?? '' }, body: text, signal: AbortSignal.timeout(180000) });
    const reply = await upstream.text();
    call.status = upstream.status;
    try {
      await writeFile(join(outDir, `call-${call.n}.response.txt`), reply, { mode: 0o600 });
      const parts = reply.trim().startsWith('{') ? [reply] : reply.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5));
      for (const part of parts) { const usage = JSON.parse(part).usageMetadata; if (usage) call.usage = { input: usage.promptTokenCount, output: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0) }; }
    } catch (error) { call.record_error = error instanceof Error ? error.message : String(error); }
    response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' });
    response.end(reply);
  } catch {
    metrics.refused++;
    if (!response.headersSent) { response.writeHead(402, { 'content-type': 'application/json' }); response.end('{"error":"refused by trial gateway"}'); }
  }
});
await new Promise(done => gate.listen(0, '127.0.0.1', done));
const gateway = `http://127.0.0.1:${gate.address().port}/v1beta`;
const spare = createServer(); await new Promise(done => spare.listen(0, '127.0.0.1', done)); const port = spare.address().port; await new Promise(done => spare.close(done));
const origin = `http://127.0.0.1:${port}`, data = join(root, 'octos'), config = join(root, 'config.json'), owner = 'memory-trial';
const delay = ms => new Promise(done => setTimeout(done, ms));
const log = [], report = { checked_at: new Date().toISOString(), mode: live ? 'live' : 'fixture', plan_id: plan.id, delivery: plan.delivery ?? 'body-label', plan_sha256: sha256(JSON.stringify(plan)), model: plan.model };
let child, socket, failure;
try {
  await writeFile(config, JSON.stringify({ provider: 'gemini', model: plan.model, base_url: gateway, api_key_env: 'GEMINI_API_KEY',
    env_vars: { GEMINI_API_KEY: 'synthetic-only-not-a-real-key' }, memory: { refresh: { enabled: false } } }), { mode: 0o600 });
  const start = async () => {
    child = spawn(binary, ['serve', '--host', '127.0.0.1', '--port', String(port), '--data-dir', data, '--config', config, '--solo'], {
      cwd: root, env: { PATH: process.env.PATH, TMPDIR: '/private/tmp', GEMINI_BASE_URL: gateway, OCTOS_NO_MODEL_DOWNLOAD: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', c => log.push(c)); child.stderr.on('data', c => log.push(c));
    for (let i = 0; i < 150; i++) {
      assert.equal(child.exitCode, null, 'Isolated Octos exited');
      try { if ((await fetch(`${origin}/api/auth/status`)).ok) return; } catch { /* startup */ }
      await delay(100);
    }
    throw new Error('Isolated Octos startup timed out');
  };
  const stop = () => new Promise(done => { child.once('exit', done); child.kill('SIGTERM'); });
  await start();
  const created = await fetch(`${origin}/api/auth/solo/create`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Memory trial', username: owner, email: 'memory-trial@solo.local' }) });
  assert.equal(created.status, 200);
  const profilePath = join(data, 'profiles', `${owner}.json`);
  const profile = JSON.parse(await readFile(profilePath, 'utf8'));
  profile.config.llm = { primary: { family_id: 'google', model_id: plan.model, route: { base_url: gateway, api_type: 'gemini', api_key_env: 'GEMINI_API_KEY' } }, fallbacks: [] };
  profile.config.env_vars = { GEMINI_API_KEY: key };
  profile.config.memory = { refresh: { enabled: false } };
  await writeFile(profilePath, JSON.stringify(profile), { mode: 0o600 });
  const memoryDir = join(data, 'profiles', owner, 'data', 'memory');
  const listing = async dir => { try { return await readdir(dir); } catch { return []; } };
  const setRefresh = async enabled => {
    await stop();
    const fresh = JSON.parse(await readFile(profilePath, 'utf8'));
    // Refresh is held off while lessons are written; a restart turns it on.
    fresh.config.memory = { refresh: enabled ? { enabled: true, min_idle_minutes: 0, consolidate_interval_minutes: 1, max_sessions_per_pass: allLessons.length,
      max_extractions_per_day: allLessons.length + 1, max_consolidations_per_day: phases.length + 1, debounce_seconds: 10 } : { enabled: false } };
    await writeFile(profilePath, JSON.stringify(fresh), { mode: 0o600 });
    await start();
  };
  // Same message shape as services/learning-history/store.mjs delivery tasks.
  const deliver = async lessons => {
    const { token } = await loginExistingTrialOwner({ request: (path, options) => fetch(origin + path, options), owner, registryRoot: data });
    const ws = new URL(`${origin.replace('http:', 'ws:')}/api/ui-protocol/ws`); ws.searchParams.set('token', token);
    socket = new WebSocket(ws);
    await new Promise((done, fail) => { socket.onopen = done; socket.onerror = () => fail(Error('Trial protocol failed')); });
    let seq = 0;
    const rpc = (method, params) => new Promise((done, fail) => {
      const id = `trial-${++seq}`, timer = setTimeout(() => fail(Error(`Trial RPC ${method} timeout`)), 15000);
      socket.onmessage = e => { const r = JSON.parse(e.data); if (r.id !== id) return; clearTimeout(timer); if (r.error) fail(Error(`Trial RPC ${method} ${r.error.code}: ${r.error.message}`)); else done(r.result); };
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, profile_id: owner } }));
    });
    for (const lesson of lessons) {
      await rpc('session/open', { session_id: lesson.session_id });
      lesson.exchanges.forEach((exchange, index) => { exchange.id = `${lesson.session_id}-${index + 1}`; });
      for (const exchange of lesson.exchanges) {
        const userId = `learn:user:${exchange.id}`;
        await rpc('session/append_message', { session_id: lesson.session_id, role: 'user', content: exchange.user, media: [], source: 'external_record:octos-learn', client_message_id: userId });
        await rpc('session/append_message', { session_id: lesson.session_id, role: 'assistant', media: [],
          ...(viaField ? { content: exchange.teacher, participant: `${lesson.teacher}老师` } : { content: `【${lesson.teacher}老师】\n${exchange.teacher}` }),
          source: 'external_record:octos-learn', client_message_id: `learn:answer:${exchange.id}`, thread_id: userId });
      }
    }
    socket.close(); socket = null;
  };
  report.phases = [];
  let delivered = 0;
  for (const [index, lessons] of phases.entries()) {
    await setRefresh(false);
    await deliver(lessons);
    delivered += lessons.length;
    await setRefresh(true);
    // The sweep runs on its own schedule; wait for this phase's extractions
    // and, in a live run, a new consolidation that drains the staging area.
    const consolidationsBefore = calls.filter(call => call.kind === 'consolidation').length;
    const deadline = Date.now() + plan.wait_seconds * 1000;
    while (Date.now() < deadline) {
      await delay(5000);
      const extracts = (await listing(join(memoryDir, 'staging', 'extract'))).filter(name => name.endsWith('.md') || name.endsWith('.json'));
      const memory = await readFile(join(memoryDir, 'MEMORY.md'), 'utf8').catch(() => '');
      if (fixture && calls.filter(call => call.kind === 'extraction').length >= delivered) break;
      if (live && memory.trim() && !extracts.length && calls.filter(call => call.kind === 'consolidation').length > consolidationsBefore) { await delay(5000); break; }
    }
    const staging = [];
    for (const name of await listing(join(memoryDir, 'staging', 'extract'))) staging.push({ name, content: await readFile(join(memoryDir, 'staging', 'extract', name), 'utf8') });
    report.phases.push({ sessions: lessons.map(lesson => lesson.session_id), extraction_staging: staging,
      long_term_memory: await readFile(join(memoryDir, 'MEMORY.md'), 'utf8').catch(() => null) });
  }
  const last = report.phases.at(-1);
  report.extraction_staging = last.extraction_staging;
  report.long_term_memory = last.long_term_memory;
  report.refresh_state = JSON.parse(await readFile(join(memoryDir, 'refresh_state.json'), 'utf8').catch(() => 'null'));
  if (report.refresh_state) delete report.refresh_state.watermarks;
  const extractions = calls.filter(call => call.kind === 'extraction');
  assert.ok(extractions.length >= 1, 'Octos memory refresh never called the model');
  assert.ok(extractions.every(call => call.teacher_labels.length === 1), 'Each extraction must see exactly its own lesson teacher label');
  if (live) assert.ok(report.long_term_memory?.trim(), 'Consolidation did not write long-term memory before the wait ended');
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  socket?.close();
  if (child?.exitCode === null && child.signalCode === null) await new Promise(done => { child.once('exit', done); child.kill('SIGTERM'); });
  gate.closeAllConnections(); await new Promise(done => gate.close(done));
  const octosLog = Buffer.concat(log);
  const logSaved = !octosLog.includes(key) && Boolean(outDir);
  if (logSaved) await writeFile(join(outDir, 'octos.log'), octosLog, { mode: 0o600 });
  await rm(root, { recursive: true, force: true });
  const usage = calls.reduce((sum, call) => ({ input: sum.input + (call.usage?.input ?? 0), output: sum.output + (call.usage?.output ?? 0) }), { input: 0, output: 0 });
  Object.assign(report, { passed: !failure, failure, octos_binary_sha256: sha256(await readFile(binary)), gateway: metrics, calls,
    reserved_usd_micros: metrics.forwarded * limits.reservation_usd_micros, ...(live ? { usage, estimated_usd: (usage.input * 0.75 + usage.output * 3.75) / 1e6 } : { real_supplier_calls: 0 }),
    octos_log_saved: logSaved, temporary_octos_data_deleted: true });
  await writeFile(resultPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ passed: report.passed, failure, calls: calls.map(call => `${call.kind}:${call.teacher_labels.join('')}`), reserved_usd: report.reserved_usd_micros / 1e6 }));
  if (failure) process.exitCode = 1;
}

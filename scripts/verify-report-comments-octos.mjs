// Weekly-report comment trial through an actual isolated Octos process, the
// learning-history service and the app's comment adapter. Every model request
// passes the local gateway below, which checks it is the comment request and
// reserves the plan's per-request cost before sending.
//
//   --fixture            free: synthetic Key, the gateway answers 503 itself
//   --live --key-file F  paid: needs an approved plan; reads the Key from F
//
// The Key is placed only in the temporary fixture profile, never printed or
// written to results, and the temporary Octos data directory is deleted.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer as createViteServer } from 'vite';
import { TrialLedger, sha256, validateTrialPlan } from './lib/learning-performance-control.mjs';
import { loginExistingTrialOwner } from './lib/learning-performance-auth.mjs';
import { HistoryStore } from '../services/learning-history/store.mjs';
import { createHistoryHandler } from '../services/learning-history/server.mjs';
import { evaluateAchievements } from '../services/learning-history/achievements.mjs';
import { TOPIC_MAPPINGS } from '../services/learning-history/topic-mappings.mjs';
import { REPORT_COMMENT_INSTRUCTIONS } from '../services/learning-history/report-comment-instructions.mjs';

const args = process.argv.slice(2);
const [binary, planPath, resultPath] = args;
const live = args.includes('--live'), fixture = args.includes('--fixture');
assert.ok(live !== fixture, 'Pass exactly one of --fixture or --live');
assert.ok(binary?.startsWith('/') && planPath && resultPath, 'Supply absolute Octos binary, plan JSON and NEW result JSON path');
assert.equal(-new Date().getTimezoneOffset(), 480, 'Run with TZ=Asia/Shanghai so the learner offset matches the cases');
const reviewed = JSON.parse(await readFile(planPath, 'utf8'));
validateTrialPlan(reviewed, { execute: live });
// Synthetic test content only: the prebuilt course mapping is treated as
// approved inside this trial so the report has topics. No production activation.
const MAPPINGS = TOPIC_MAPPINGS.map(map => ({ ...map, status: 'approved' }));
const COURSE = MAPPINGS[0];

let key = 'synthetic-only-not-a-real-key', plan = reviewed, outDir;
if (live) {
  const keyFile = args[args.indexOf('--key-file') + 1];
  assert.ok(keyFile?.startsWith('/'), 'Supply --key-file with an absolute path');
  assert.equal((await stat(keyFile)).mode & 0o077, 0, 'Key file must not be readable by other users (chmod 600)');
  key = (await readFile(keyFile, 'utf8')).trim();
  assert.ok(key && !/\s/.test(key), 'Key file must hold one Key');
  outDir = reviewed.output_directory; await mkdir(outDir, { recursive: true, mode: 0o700 });
} else {
  plan = { ...reviewed, id: `${reviewed.id}-fixture`, status: 'draft', samples: reviewed.samples.slice(0, 1),
    limits: { ...reviewed.limits, courses: 1, usd_micros: 2 * reviewed.limits.model_request_usd_micros } };
}
await writeFile(resultPath, '{}\n', { flag: 'wx', mode: 0o600 });
const root = await mkdtemp(join(tmpdir(), 'octos-report-trial-'));
const ledger = new TrialLedger(live ? join(outDir, 'ledger.sqlite') : join(root, 'ledger.sqlite'), plan);
let active = null;
const calls = [];
const listen = async server => { await new Promise(done => server.listen(0, '127.0.0.1', done)); return `http://127.0.0.1:${server.address().port}`; };
const fields = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key));
const aliased = (value, snake, camel) => { assert.ok(!(snake in value && camel in value), 'Ambiguous protocol aliases'); return value[snake] ?? value[camel]; };
const MARKER = '[from the app: Weekly report comment] ';
/** Octos's own Gemini request for one comment: text only, no tools, the app's
 * comment prompt present, output cap within the plan. Anything else is refused
 * before a reservation, and nothing about a refused request is recorded. */
function checkCommentRequest(body) {
  assert.ok(fields(body, ['contents', 'system_instruction', 'systemInstruction', 'generation_config', 'generationConfig']), 'Unpriced request field (tools are not allowed)');
  const config = aliased(body, 'generation_config', 'generationConfig');
  assert.ok(fields(config, ['max_output_tokens', 'maxOutputTokens', 'temperature', 'thinkingConfig']));
  const max = aliased(config, 'max_output_tokens', 'maxOutputTokens');
  assert.ok(Number.isSafeInteger(max) && max > 0 && max <= plan.limits.output_tokens, 'Output cap above plan');
  const system = aliased(body, 'system_instruction', 'systemInstruction');
  assert.ok(!system || (fields(system, ['parts']) && system.parts.every(part => fields(part, ['text']) && typeof part.text === 'string')));
  assert.ok(Array.isArray(body.contents) && body.contents.length);
  let prompts = 0;
  for (const content of body.contents) {
    assert.ok(fields(content, ['role', 'parts']) && ['user', 'model'].includes(content.role) && Array.isArray(content.parts));
    for (const part of content.parts) {
      assert.ok(fields(part, ['text', 'thought']) && typeof part.text === 'string', 'Only text parts are priced');
      if (content.role === 'user' && part.text.startsWith(MARKER)) { assert.ok(part.text.slice(MARKER.length).startsWith(REPORT_COMMENT_INSTRUCTIONS), 'Comment instructions missing or changed'); prompts++; }
    }
  }
  assert.equal(prompts, 1, 'Not exactly one app comment request');
  return { max_output_tokens: max, has_system: Boolean(system) };
}
const metrics = { admitted: 0, refused: 0, failed: 0 };
const gate = { server: createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://local'), expected = `/v1beta/models/${plan.model}`;
    assert.equal(request.method, 'POST');
    assert.ok([`${expected}:generateContent`, `${expected}:streamGenerateContent`].includes(url.pathname));
    assert.ok(!url.search || url.search === '?alt=sse');
    let size = 0; const chunks = [];
    for await (const chunk of request) { size += chunk.length; assert.ok(size <= plan.limits.request_bytes, 'Request above byte cap'); chunks.push(chunk); }
    const raw = Buffer.concat(chunks).toString('utf8'), shape = checkCommentRequest(JSON.parse(raw));
    const key = request.headers['x-goog-api-key']; assert.ok(typeof key === 'string' && key);
    ledger.reserveModel(active); metrics.admitted++;
    const call = { sample: active, request_bytes: size, ...shape };
    calls.push(call);
    let status = 503, text = '{}', type = 'application/json';
    if (live) {
      const upstream = await fetch(`https://generativelanguage.googleapis.com${url.pathname}${url.search}`, { method: 'POST', redirect: 'error',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: raw, signal: AbortSignal.timeout(120000) });
      status = upstream.status; text = await upstream.text(); type = upstream.headers.get('content-type') ?? type;
      try {
        const n = calls.filter(c => c.sample === active).length;
        await writeFile(join(outDir, `${active}.call-${n}.request.json`), raw, { mode: 0o600 });
        await writeFile(join(outDir, `${active}.call-${n}.response.txt`), text, { mode: 0o600 });
        const parts = text.trim().startsWith('{') ? [text] : text.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5));
        for (const chunk of parts) { const usage = JSON.parse(chunk).usageMetadata; if (usage) call.usage = usage; }
      } catch (error) { call.record_error = error instanceof Error ? error.message : String(error); }
    }
    call.status = status;
    response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); response.end(text);
  } catch {
    if (response.headersSent) { metrics.failed++; response.destroy(); }
    else { metrics.refused++; response.writeHead(402, { 'content-type': 'application/json' }); response.end('{"error":"Report comment trial refused this request"}'); }
  }
}), metrics };
const gateway = `${await listen(gate.server)}/v1beta`;
const spare = createServer(); await new Promise(done => spare.listen(0, '127.0.0.1', done)); const port = spare.address().port; await new Promise(done => spare.close(done));
const origin = `http://127.0.0.1:${port}`, data = join(root, 'octos'), config = join(root, 'config.json');
await writeFile(config, JSON.stringify({ provider: 'gemini', model: plan.model, base_url: gateway, api_key_env: 'GEMINI_API_KEY',
  env_vars: { GEMINI_API_KEY: 'synthetic-only-not-a-real-key' }, memory: { refresh: { enabled: false } } }), { mode: 0o600 });
const delay = ms => new Promise(done => setTimeout(done, ms));

/** Synthetic facts for one case: each row is [kind, local day, hour, run, extra]. */
function caseEvents(sample) {
  const beatsOf = topic => COURSE.objectives.filter(o => o.topic_id === topic).flatMap(o => o.beat_ids);
  const taskOf = topic => COURSE.objectives.find(o => o.topic_id === topic && o.task_ids.length).task_ids[0];
  return sample.events.map(([kind, day, hour, run, extra = {}], index) => {
    const id = `${sample.id}-${index}`, occurred_at = new Date(Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00+08:00`)).toISOString();
    const base = { version: 1, id, occurred_at, device_id: 'trial', session_id: `board-${run}`, run_id: run, log_id: `log-${run}`, course: COURSE.course };
    if (kind === 'beat') { const beat = beatsOf(extra.topic)[extra.n ?? 0]; return { ...base, kind: 'beat_completed', data: { step_id: beat.split(':beat:')[0], beat_id: beat, presentation: 'text' } }; }
    if (kind === 'attempt') return { ...base, kind: 'task_attempt', data: { task_id: taskOf(extra.topic), operation_id: id, result: extra.result ?? 'succeeded', hints_used: extra.hints ?? 0, value: 1 } };
    assert.equal(kind, 'question');
    return { ...base, kind: 'question_submitted', question_id: `q-${id}`, data: { text: extra.text ?? '斜率是什么意思？', modality: 'text' } };
  });
}

const log = [], results = [];
let child, vite, failure;
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
  const owner = 'report-trial';
  const created = await fetch(`${origin}/api/auth/solo/create`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Report trial', username: owner, email: 'report-trial@solo.local' }) });
  assert.equal(created.status, 200);
  const profilePath = join(data, 'profiles', `${owner}.json`);
  const profile = JSON.parse(await readFile(profilePath, 'utf8'));
  profile.config.llm = { primary: { family_id: 'google', model_id: plan.model, route: { base_url: gateway, api_type: 'gemini', api_key_env: 'GEMINI_API_KEY' } }, fallbacks: [] };
  profile.config.env_vars = { GEMINI_API_KEY: key };
  await writeFile(profilePath, JSON.stringify(profile), { mode: 0o600 });
  await new Promise(done => { child.once('exit', done); child.kill('SIGTERM'); });
  await start();
  const { token } = await loginExistingTrialOwner({ request: (path, options) => fetch(origin + path, options), owner, registryRoot: data });
  vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  const { commentWeeklyReport } = await vite.ssrLoadModule('/src/learning/history/comment-report.ts');
  const { createUiProtocolBridge, getUiProtocolFeatures } = await vite.ssrLoadModule('/src/runtime/ui-protocol-bridge.ts');
  for (const sample of plan.samples) {
    ledger.reserveSample(sample.id, `report-trial-${sample.id}`); active = sample.id;
    const folder = join(root, sample.id); await mkdir(folder);
    const history = new HistoryStore(join(folder, 'history.sqlite'), { now: () => sample.now });
    let product;
    try {
      history.append(owner, caseEvents(sample));
      history.chooseTeacher(owner, sample.teacher);
      evaluateAchievements(history, owner, { utcOffsetMinutes: 480, now: () => sample.now }, MAPPINGS);
      const handler = createHistoryHandler({ store: history, databasePath: join(folder, 'history.sqlite'), octosBaseUrl: origin, mappings: MAPPINGS });
      product = createServer((request, response) => { void handler(request, response); });
      const base = await listen(product), identity = { owner, token };
      const startedAt = Date.now();
      let saved = false, error;
      try {
        saved = await commentWeeklyReport(identity, base, { now: Date.now,
          createBridge: () => createUiProtocolBridge({ origin, getToken: () => token, getProfileId: () => owner, features: [...getUiProtocolFeatures(), 'session.workspace_cwd.v1'] }) });
      } catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
      const job = history.db.prepare('SELECT week_start,teacher_id,state,comment,error,input_json FROM report_comment_jobs').get();
      const result = { id: sample.id, teacher: sample.teacher, case: sample.prompt, saved, error, elapsed_ms: Date.now() - startedAt,
        state: job?.state ?? null, comment: job?.comment ?? null, rejected_reason: job?.error ?? null, input: job ? JSON.parse(job.input_json) : null,
        model_requests: calls.filter(c => c.sample === sample.id).length };
      results.push(result);
      if (fixture) { assert.ok(result.model_requests >= 1, 'Fixture must reach the stand-in supplier'); break; }
      // A transport or Octos failure stops the trial; a rejected comment is a valid measurement.
      ledger.complete(sample.id, { jobsTerminal: true, measurementValid: ['complete', 'blocked'].includes(result.state) });
      active = null;
    } finally {
      if (product?.listening) { product.closeAllConnections(); await new Promise(done => product.close(done)); }
      history.close();
    }
  }
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  await vite?.close();
  if (child?.exitCode === null && child.signalCode === null) await new Promise(done => { child.once('exit', done); child.kill('SIGTERM'); });
  gate.server.closeAllConnections(); await new Promise(done => gate.server.close(done));
  const spent = ledger.snapshot(); ledger.close();
  const octosLog = Buffer.concat(log);
  const logSaved = !octosLog.includes(key);
  if (logSaved && !live) await writeFile(`${resultPath}.octos.log`, octosLog, { mode: 0o600 });
  await rm(root, { recursive: true, force: true });
  const report = { checked_at: new Date().toISOString(), mode: live ? 'live' : 'fixture', passed: !failure, failure,
    plan_id: plan.id, plan_sha256: sha256(JSON.stringify(plan)), model: plan.model, octos_binary_sha256: sha256(await readFile(binary)),
    gateway: gate.metrics, admitted_requests: spent.expenses.length, reserved_usd_micros: spent.expenses.reduce((sum, x) => sum + x.usd, 0),
    calls, results, temporary_octos_data_deleted: true, ...(live ? { output_directory: outDir } : { real_supplier_calls: 0 }) };
  await writeFile(resultPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
  if (failure) process.exitCode = 1;
}

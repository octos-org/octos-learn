// Free real-Octos action test. Uses an isolated temporary profile, synthetic
// credentials and a local supplier replacement; no personal configuration edits.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { TrialLedger, createModelBudgetGateway, sha256 } from './lib/learning-performance-control.mjs';
import { loginExistingTrialOwner } from './lib/learning-performance-auth.mjs';

const [binary, skill, resultPath, model = 'gemini-3.6-flash'] = process.argv.slice(2);
assert.ok(binary?.startsWith('/') && skill?.startsWith('/') && resultPath, 'Supply absolute Octos binary, installed skill directory, NEW result JSON path and optional Gemini model');
assert.match(model, /^gemini-[\w.-]+$/);
const root = await mkdtemp(join(tmpdir(), 'octos-action-budget-fixture-'));
await writeFile(resultPath, '{}\n', { flag: 'wx', mode: 0o600 });
const plan = { schema: 'octos.learn.performance-trial.v1', id: 'octos-route-fixture', status: 'draft', model, voice: 'fixture', resource: 'fixture',
  limits: { courses: 1, speech_requests: 1, usd_micros: 250, cny_micros: 1000, model_request_usd_micros: 100, speech_byte_cny_micros: 1, speech_utf8_bytes: 100, output_tokens: 32768, request_bytes: 1048576 },
  samples: [{ id: 'one', version: 'candidate', prompt: '请解释斜率' }],
};
const ledger = new TrialLedger(join(root, 'ledger.sqlite'), plan); ledger.reserveSample('one', 'learn-route-fixture');
let supplierCalls = 0, child, socket;
const log = [];
const gate = createModelBudgetGateway({ ledger, activeSample: () => 'one', upstreamFetch: async url => {
  assert.ok(url.startsWith(`https://generativelanguage.googleapis.com/v1beta/models/${plan.model}:`));
  supplierCalls++; return new Response('{}', { status: 503 });
} });
await new Promise(done => gate.server.listen(0, '127.0.0.1', done));
const gateway = `http://127.0.0.1:${gate.server.address().port}/v1beta`;
const spare = createServer(); await new Promise(done => spare.listen(0, '127.0.0.1', done)); const port = spare.address().port; await new Promise(done => spare.close(done));
const origin = `http://127.0.0.1:${port}`, data = join(root, 'octos'), config = join(root, 'config.json');
const configValue = { provider: 'gemini', model: plan.model, base_url: gateway, api_key_env: 'GEMINI_API_KEY',
  env_vars: { GEMINI_API_KEY: 'synthetic-only-not-a-real-key' }, memory: { refresh: { enabled: false } } };
await writeFile(config, JSON.stringify(configValue), { mode: 0o600 });
const delay = ms => new Promise(done => setTimeout(done, ms));
try {
  const start = async () => {
    child = spawn(resolve(binary), ['serve', '--host', '127.0.0.1', '--port', String(port), '--data-dir', data, '--config', config, '--solo'], {
      cwd: root, env: { PATH: process.env.PATH, TMPDIR: '/private/tmp', GEMINI_API_KEY: 'synthetic-only-not-a-real-key', GEMINI_BASE_URL: gateway, OCTOS_MEMORY_REFRESH_ENABLED: '0', OCTOS_NO_MODEL_DOWNLOAD: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', c => log.push(c)); child.stderr.on('data', c => log.push(c));
    let ready = false;
    for (let i = 0; i < 150; i++) {
      assert.equal(child.exitCode, null, 'Isolated Octos exited');
      try { if ((await fetch(`${origin}/api/auth/status`)).ok) { ready = true; break; } } catch { /* startup */ }
      await delay(100);
    }
    assert.ok(ready, 'Isolated Octos startup timed out');
  };
  await start();
  const owner = 'budget-route-fixture';
  const response = await fetch(`${origin}/api/auth/solo/create`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Budget route fixture', username: owner, email: 'fixture@solo.local' }) });
  assert.equal(response.status, 200);
  // Make a different user the newest solo default, then prove the runner logs
  // back into the explicitly selected existing account without adding a third.
  const newer = await fetch(`${origin}/api/auth/solo/create`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Other fixture', username: 'other-fixture', email: 'other@solo.local' }) });
  assert.equal(newer.status, 200);
  const installed = join(data, 'profiles', owner, 'data', 'skills', 'learning-coach'); await mkdir(installed, { recursive: true });
  // Bundled executables, contract/references and manifest; do not edit or copy
  // private profile files, credentials or another node_modules installation.
  for (const file of ['main', 'lesson-plan.js', 'manifest.json', 'oll-contract.json', 'references']) await cp(join(skill, file), join(installed, file), { recursive: true });
  const profilePath = join(data, 'profiles', `${owner}.json`);
  const fixtureProfile = JSON.parse(await readFile(profilePath, 'utf8'));
  fixtureProfile.config.llm = { primary: { family_id: 'google', model_id: plan.model, route: { base_url: gateway, api_type: 'gemini', api_key_env: 'GEMINI_API_KEY' } }, fallbacks: [] };
  fixtureProfile.config.env_vars = { GEMINI_API_KEY: 'synthetic-only-not-a-real-key' };
  fixtureProfile.config.sandbox.allow_network = true;
  await writeFile(profilePath, JSON.stringify(fixtureProfile), { mode: 0o600 });
  // Starting from an empty registry uses the legacy no-profile runtime.
  // Restart only this fixture after creating its profile and installed skill.
  await new Promise(done => { child.once('exit', done); child.kill('SIGTERM'); });
  await start();
  const { token, explicitExistingLogin } = await loginExistingTrialOwner({ request: (path, options) => fetch(origin + path, options), owner, registryRoot: data });
  assert.equal(explicitExistingLogin, true);
  const ws = new URL(`${origin.replace('http:', 'ws:')}/api/ui-protocol/ws`); ws.searchParams.set('token', token);
  for (const f of ['skill.actions.v1', 'skill.action_jobs.v1']) ws.searchParams.append('ui_feature', f);
  socket = new WebSocket(ws);
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = () => fail(Error('Fixture protocol failed')); });
  let seq = 0;
  const rpc = (method, params) => new Promise((done, fail) => {
    const id = `fixture-${++seq}`, timer = setTimeout(() => fail(Error('Fixture RPC timeout')), 10000);
    socket.onmessage = e => { const r = JSON.parse(e.data); if (r.id !== id) return; clearTimeout(timer); if (r.error) fail(Error(`Fixture RPC ${method} ${r.error.code}: ${r.error.message}`)); else done(r.result); };
    socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, profile_id: owner } }));
  });
  const session = 'learn-route-fixture'; await rpc('session/open', { session_id: session, profile_id: owner });
  const actions = await rpc('skill/action/list', { session_id: session });
  assert.ok(actions.actions.some(a => a.id === 'learning.lesson.generate' && a.available));
  const accepted = await rpc('skill/action/invoke', { session_id: session, action_id: 'learning.lesson.generate', arguments: { turn_id: 'budget-route-turn', learner_request: '请解释斜率', request_source: 'self_contained', input_modality: 'text', language: 'zh-CN' } });
  assert.equal(accepted.ok, true); assert.equal(accepted.jobs.length, 1);
  let terminal;
  for (let i = 0; i < 150; i++) {
    const { jobs } = await rpc('skill/action/job/list', { session_id: session }); terminal = jobs.find(j => j.job_id === accepted.jobs[0].job_id);
    if (terminal && !['queued', 'running'].includes(terminal.status)) break;
    await delay(100);
  }
  assert.equal(terminal?.status, 'failed', 'Deliberately exhausted fixture generation must fail');
  assert.equal(supplierCalls, 2); assert.ok(gate.metrics.rejected > 0); assert.equal(ledger.snapshot().expenses.length, 2);
  const report = { checked_at: new Date().toISOString(), passed: true, scope: 'Actual isolated Octos process and background learning.lesson.generate action, copied installed skill bundles, synthetic credentials and local budget gateway',
    octos_binary_sha256: sha256(await readFile(binary)), installed_skill_sha256: sha256(await readFile(join(skill, 'main'))),
    model: plan.model, real_supplier_calls: 0, synthetic_supplier_attempts: supplierCalls, rejected_requests: gate.metrics.rejected,
    original_profile_modified: false, original_installation_modified: false, memory_refresh_disabled_for_fixture: true,
    normal_profile_gateway_route_verified: false, selected_existing_owner_login_verified: true, private_fixture_directory: root };
  await writeFile(join(root, 'octos.log'), Buffer.concat(log), { mode: 0o600 });
  await writeFile(resultPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flush: true }); console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(join(root, 'octos.log'), Buffer.concat(log), { mode: 0o600 });
  console.log(JSON.stringify({ private_fixture_directory: root }));
  socket?.close();
  if (child?.exitCode === null && child.signalCode === null) await new Promise(done => { child.once('exit', done); child.kill('SIGTERM'); });
  gate.server.closeAllConnections(); await new Promise(done => gate.server.close(done)); ledger.close();
}

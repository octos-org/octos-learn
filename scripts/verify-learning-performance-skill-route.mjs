// Executes the selected installed Learning Coach with a synthetic credential
// and a local budget gateway. This does NOT verify normal Octos env propagation.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { TrialLedger, createModelBudgetGateway, sha256 } from './lib/learning-performance-control.mjs';

const [skill, resultPath, model = 'gemini-3.6-flash'] = process.argv.slice(2);
assert.ok(skill?.startsWith('/') && resultPath, 'Supply absolute installed Learning Coach executable, NEW result JSON path and optional Gemini model');
assert.match(model, /^gemini-[\w.-]+$/);
const root = await mkdtemp(join(tmpdir(), 'octos-skill-budget-fixture-'));
const plan = { schema: 'octos.learn.performance-trial.v1', id: 'installed-skill-fixture', status: 'draft', model, voice: 'fixture', resource: 'fixture',
  limits: { courses: 1, speech_requests: 1, usd_micros: 250, cny_micros: 1000, model_request_usd_micros: 100, speech_byte_cny_micros: 1, speech_utf8_bytes: 100, output_tokens: 32768, request_bytes: 1048576 },
  samples: [{ id: 'one', version: 'candidate', prompt: '请解释斜率' }],
};
await writeFile(resultPath, '{}\n', { flag: 'wx', mode: 0o600 });
const ledger = new TrialLedger(join(root, 'ledger.sqlite'), plan); ledger.reserveSample('one', 'learn-skill-fixture');
let supplierCalls = 0;
const gateway = createModelBudgetGateway({ ledger, activeSample: () => 'one', upstreamFetch: async url => {
  assert.ok(url.startsWith(`https://generativelanguage.googleapis.com/v1beta/models/${plan.model}:`));
  supplierCalls++; return new Response('{}', { status: 503 });
} });
await new Promise(done => gateway.server.listen(0, '127.0.0.1', done));
let child;
try {
  const endpoint = `http://127.0.0.1:${gateway.server.address().port}/v1beta`;
  // Explicit allowlist: no inherited personal Key, model route or preload.
  child = spawn(process.execPath, [resolve(skill), 'oll_generate_lesson'], { cwd: root, env: {
    PATH: process.env.PATH, OCTOS_PROFILE_LLM_PROVIDER: 'google', OCTOS_PROFILE_LLM_MODEL: plan.model,
    OCTOS_PROFILE_LLM_API_TYPE: 'gemini', OCTOS_PROFILE_LLM_BASE_URL: endpoint,
    GEMINI_API_KEY: 'synthetic-budget-fixture-no-real-key', OCTOS_WORK_DIR: root, OCTOS_SESSION_WORKSPACE: root,
  }, stdio: ['pipe', 'pipe', 'pipe'] });
  const stdout = [], stderr = []; child.stdout.on('data', data => stdout.push(data)); child.stderr.on('data', data => stderr.push(data));
  child.stdin.end(JSON.stringify({ turn_id: 'budget-fixture', learner_request: '请解释斜率', input_modality: 'text', request_source: 'self_contained', language: 'zh-CN' }));
  const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
  const exit = await new Promise((done, fail) => { child.once('error', fail); child.once('exit', (code, signal) => done({ code, signal })); }); clearTimeout(timer);
  await writeFile(join(root, 'stdout.log'), Buffer.concat(stdout), { mode: 0o600 });
  await writeFile(join(root, 'stderr.log'), Buffer.concat(stderr), { mode: 0o600 });
  assert.equal(exit.code, 1, 'The deliberately failed generation must not succeed');
  assert.equal(supplierCalls, 2, 'At most two supplier attempts fit in the fixture budget');
  assert.ok(gateway.metrics.rejected > 0, 'An additional attempt must actually reach the budget check');
  const expenses = ledger.snapshot().expenses;
  assert.equal(expenses.length, 2); assert.equal(expenses.reduce((sum, x) => sum + x.usd, 0), 200);
  const report = { checked_at: new Date().toISOString(), model: plan.model, installed_skill_sha256: sha256(await readFile(skill)),
    scope: 'Installed Learning Coach direct executable with explicit synthetic env, isolated workspace and local supplier replacement; not the normal Octos action environment',
    passed: true, real_supplier_calls: 0, synthetic_supplier_attempts: supplierCalls, rejected_requests: gateway.metrics.rejected,
    reserved_usd_micros_in_fixture: 200, generation_failed_as_expected: true, original_installation_modified: false,
    private_fixture_directory: root };
  await writeFile(resultPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flush: true }); console.log(JSON.stringify(report, null, 2));
} finally {
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  gateway.server.closeAllConnections(); await new Promise(done => gateway.server.close(done)); ledger.close();
}

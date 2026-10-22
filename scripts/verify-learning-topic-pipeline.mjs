// Technical feasibility probe only: actual Octos agent, a local model fixture,
// synthetic account and isolated memory. Does not install or change user skills.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, open, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createHistoryHandler } from '../services/learning-history/server.mjs';
import { HistoryStore } from '../services/learning-history/store.mjs';

const [binary, output] = process.argv.slice(2);
assert.ok(binary?.startsWith('/') && output?.startsWith('/'), 'Supply an absolute Octos binary and NEW result JSON path');
const root = await mkdtemp(join(tmpdir(), 'octos-topic-analysis-'));
await writeFile(output, '{}\n', { flag: 'wx', mode: 0o600 });
const log = await open(join(root, 'octos.log'), 'a', 0o600);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const listen = async server => { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${server.address().port}`; };
const history = new HistoryStore(join(root, 'history.sqlite'));
const snapshot = JSON.stringify([{ event: 'lesson.step', lesson_id: 'fixture', step: { id: 'step-one', beats: [{ id: 'beat-one', narration: { text: '横向增加一格时，纵向增加两格，斜率为二。' } }] } }]);
const snapshotHash = createHash('sha256').update(snapshot).digest('hex');
const delivery = { version: 1, id: 'delivery-one', kind: 'course_delivered', occurred_at: '2026-10-22T00:00:00.000Z', device_id: 'fixture', session_id: 'learn-topic-host', question_id: 'q1', run_id: 'run-one',
  course: { kind: 'generated', id: 'q1', version: 'q1' }, data: { artifact: 'lesson.jsonl', status: 'partial', snapshot_sha256: snapshotHash, event_count: 1 } };
history.append('topic-fixture', [delivery], [{ event_id: delivery.id, snapshot_json: snapshot }]);
const requests = []; let child, vite, product;
let input, providerError, catalogLookups = 0;
const provider = createServer(async (request, response) => {
  try {
  if (request.method === 'POST' && request.url.endsWith('/embeddings')) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: [{ index: 0, embedding: Array(1536).fill(0.01) }] })); return;
  }
  if (request.method !== 'POST' || !request.url.endsWith('/chat/completions')) { response.writeHead(404); response.end(); return; }
  const chunks = []; for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks)); requests.push(body);
  assert.ok(requests.length <= 2, 'Unexpected extra fixture model request');
  const toolReply = body.messages.some(message => message.role === 'tool');
  let message, finish;
  if (!toolReply) {
    message = { role: 'assistant', content: null, tool_calls: [{ id: 'lookup-math', type: 'function', function: { name: 'learning_topics_search', arguments: JSON.stringify({ query: 'linear gradient slope intercept' }) } }] };
    finish = 'tool_calls';
  } else {
    catalogLookups++;
    assert.ok(JSON.stringify(body).includes('mt_WBdHkc2HTf'), 'Real pinned catalog did not reach Octos');
    message = { role: 'assistant', content: JSON.stringify({ schema: 1, input_sha256: input.input_sha256, units: input.units.map(unit => ({ unit_id: unit.unit_id, status: 'mapped', topics: [{ topic_id: 'mt_WBdHkc2HTf', quote: '斜率' }], reason: 'Local scripted answer checks transport, not semantic quality' })) }) };
    finish = 'stop';
  }
  response.writeHead(200, { 'content-type': body.stream ? 'text/event-stream' : 'application/json' });
  if (body.stream) {
    const delta = message.tool_calls ? { role: 'assistant', tool_calls: message.tool_calls.map((call, index) => ({ index, ...call })) } : message;
    response.end(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: finish }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\ndata: [DONE]\n\n`);
  } else response.end(JSON.stringify({ id: 'fixture', object: 'chat.completion', choices: [{ index: 0, message, finish_reason: finish }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
  } catch (error) { providerError = error; response.writeHead(500); response.end('{"error":"Synthetic fixture failed"}'); }
});
try {
  const providerBase = await listen(provider);
  const spare = createServer(); const base = await listen(spare); await new Promise(resolve => spare.close(resolve));
  const config = join(root, 'config.json');
  await writeFile(config, JSON.stringify({ provider: 'openai', model: 'gpt-4o-mini', base_url: `${providerBase}/v1`, api_key_env: 'TOPIC_FIXTURE_KEY',
    env_vars: { TOPIC_FIXTURE_KEY: 'synthetic-not-a-real-key' }, memory: { refresh: { enabled: false } },
    embedding: { provider: 'openai', base_url: `${providerBase}/v1`, api_key_env: 'TOPIC_FIXTURE_KEY', auto_download: false } }), { mode: 0o600 });
  const start = async () => {
    child = spawn(binary, ['serve', '--host', '127.0.0.1', '--port', new URL(base).port, '--data-dir', join(root, 'octos'), '--config', config, '--solo'], {
      cwd: root, env: { PATH: process.env.PATH, TMPDIR: '/private/tmp', TOPIC_FIXTURE_KEY: 'synthetic-not-a-real-key', OCTOS_MEMORY_REFRESH_ENABLED: '0', OCTOS_NO_MODEL_DOWNLOAD: '1' }, stdio: ['ignore', log.fd, log.fd],
    });
    let ready = false;
    for (let n = 0; n < 200; n++) {
      assert.equal(child.exitCode, null, 'Isolated Octos exited');
      try { if ((await fetch(`${base}/api/auth/status`)).ok) { ready = true; break; } } catch { /* startup */ }
      await wait(100);
    }
    assert.ok(ready, 'Isolated startup timeout');
  };
  await start();
  const created = await fetch(`${base}/api/auth/solo/create`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'topic-fixture', name: 'Topic fixture', email: 'topic@solo.local' }) });
  assert.equal(created.status, 200);
  const profilePath = join(root, 'octos', 'profiles', 'topic-fixture.json');
  const profile = JSON.parse(await readFile(profilePath, 'utf8'));
  profile.config.llm = { primary: { family_id: 'openai', model_id: 'gpt-4o-mini', route: { api_type: 'openai', base_url: `${providerBase}/v1`, api_key_env: 'TOPIC_FIXTURE_KEY' } }, fallbacks: [] };
  profile.config.env_vars = { TOPIC_FIXTURE_KEY: 'synthetic-not-a-real-key' };
  await writeFile(profilePath, JSON.stringify(profile), { mode: 0o600 });
  await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
  await start();
  const login = await fetch(`${base}/api/auth/solo`, { method: 'POST' });
  assert.equal(login.status, 200); const { token } = await login.json();
  const identity = { owner: 'topic-fixture', token };
  const handler = createHistoryHandler({ store: history, databasePath: join(root, 'history.sqlite'), octosBaseUrl: base });
  product = createServer((request, response) => { void handler(request, response); });
  const productBase = await listen(product);
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-learning-owner': identity.owner };
  const api = async (path, method = 'GET', body) => {
    const response = await fetch(`${productBase}/api/learn/history${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal(response.status, 200, `Product ${path}: ${response.status}`); return response.json();
  };
  vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  const { analyzeTopics } = await vite.ssrLoadModule('/src/learning/history/analyze-topics.ts');
  const { createUiProtocolBridge } = await vite.ssrLoadModule('/src/runtime/ui-protocol-bridge.ts');
  const bridge = () => {
    const connection = createUiProtocolBridge({ origin: base, getToken: () => token, getProfileId: () => identity.owner });
    const original = connection.callMethod.bind(connection);
    connection.callMethod = async (method, params) => {
      const result = await original(method, params);
      if (method === 'session/hydrate' && result.turns?.some(turn => turn.state === 'completed')) await writeFile(join(root, 'hydration.json'), JSON.stringify(result), { mode: 0o600 });
      return result;
    };
    return connection;
  };
  const off = await analyzeTopics(identity, productBase, { createBridge: () => { throw Error('Disabled analysis opened a connection'); } });
  assert.equal(off.enabled, false); assert.equal(requests.length, 0);
  await api('/analysis/settings', 'POST', { enabled: true, max_daily_tasks: 2 });
  // Observe the frozen task through the real product API before admission.
  let dropped = false;
  await assert.rejects(analyzeTopics(identity, productBase, { createBridge: bridge, fetcher: async (url, options) => {
    const response = await fetch(url, options);
    if (String(url).endsWith('/analysis/claim')) input = (await response.clone().json()).tasks[0]?.input;
    if (!dropped && String(url).endsWith('/result')) { assert.equal(response.status, 200); dropped = true; throw Error('Injected lost saved-result receipt'); }
    return response;
  } }), /Injected lost saved-result receipt/);
  assert.equal(dropped, true);
  assert.equal(requests.length, 2); assert.equal(catalogLookups, 1);
  const saved = await api('/analysis');
  assert.deepEqual(saved.states, [{ state: 'complete', count: 1 }]);
  assert.equal((await api('/analysis/controls')).controls.length, 1, 'Lost receipt must retain cleanup authorization');
  // Drop both services and the first browser bridge before another device resumes.
  await new Promise(resolve => product.close(resolve)); product = undefined;
  await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
  await start();
  product = createServer((request, response) => { void handler(request, response); });
  const restartedBase = await listen(product);
  const reconciled = await analyzeTopics(identity, restartedBase, { createBridge: bridge });
  assert.equal(reconciled.completed, 0); assert.equal(requests.length, 2, 'Result reconciliation repeated a model call');
  const controls = await fetch(`${restartedBase}/api/learn/history/analysis/controls`, { headers }).then(r => r.json());
  assert.deepEqual(controls.controls, [], 'Temporary analysis namespace cleanup not acknowledged');
  history.append(identity.owner, [{ ...delivery, id: 'played', kind: 'beat_completed', log_id: 'log-fixture', data: { step_id: 'step-one', beat_id: 'beat-one', presentation: 'text', delivery_sha256: snapshotHash } }]);
  const topic = await fetch(`${restartedBase}/api/learn/history/topics/mt_WBdHkc2HTf`, { headers }).then(r => r.json());
  assert.equal(topic.automatic.counts.played_runs, 1); assert.equal(topic.automatic.events.length, 1);
  const reader = bridge();
  try {
    await reader.start({ sessionId: `learn-topic-${createHash('sha256').update(identity.owner).digest('hex').slice(0,32)}`, profileId: identity.owner });
    const host = await reader.callMethod('session/hydrate', { session_id: `learn-topic-${createHash('sha256').update(identity.owner).digest('hex').slice(0,32)}`, include: ['messages'] });
    assert.equal(host.messages.length, 0, 'Analysis entered the host classroom');
  } finally { await reader.stop(); }
  if (providerError) throw providerError;
  const report = { checked_at: new Date().toISOString(), passed: true, octos_binary_sha256: createHash('sha256').update(await readFile(binary)).digest('hex'),
    actual_frontend_worker: true, actual_authenticated_product_api: true, actual_octos_app_peer: true, pinned_catalog_topics: 529,
    fixture_model_requests: requests.length, catalog_tool_roundtrips: catalogLookups, real_supplier_calls: 0, original_account_modified: false,
    lost_result_receipt_and_octos_restart: true, cross_device_namespace_cleanup: true, exact_version_playback_count: true,
    classification_quality_verified: false, private_fixture_directory: root };
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); console.log(JSON.stringify(report));
} finally {
  if (product) { product.closeAllConnections(); await new Promise(resolve => product.close(resolve)); }
  await vite?.close();
  if (child?.exitCode === null && child.signalCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
  provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); await log.close(); history.close();
  console.log(JSON.stringify({ private_fixture_directory: root }));
}

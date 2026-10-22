// Run against an explicitly selected, locally built Octos binary:
// node scripts/verify-learning-history-octos.mjs /absolute/path/to/octos
// Uses isolated automated fixtures, not the normal manual acceptance account.
// No turn is started; memory refresh is disabled and the model endpoint is local.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { HistoryStore } from '../services/learning-history/store.mjs';
import { createHistoryHandler } from '../services/learning-history/server.mjs';

const binary = process.argv[2];
if (!binary || !binary.startsWith('/')) throw Error('Supply the absolute path to the Octos binary');
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = await mkdtemp(join(tmpdir(), 'octos-history-acceptance-'));
const fixtureConfig = join(root, 'config.json');
const database = join(root, 'history.sqlite');
let octos, product, vite, storage, log;
let modelCalls = 0;
let succeeded = false;
const provider = createHttpServer((request, response) => {
  if (request.method === 'POST') modelCalls++;
  response.writeHead(503, { 'content-type': 'application/json' });
  response.end('{"error":"No model calls are permitted in this test"}');
});
const listen = async server => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
};
const close = server => server && new Promise(resolve => server.close(resolve));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const freePort = async () => {
  const server = createHttpServer();
  await listen(server); const port = server.address().port; await close(server); return port;
};
const stopOctos = async () => {
  if (!octos || octos.exitCode !== null) return;
  const child = octos;
  await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
  octos = undefined;
};

try {
  const providerBase = await listen(provider);
  await writeFile(fixtureConfig, JSON.stringify({ provider: 'openai', model: 'gpt-4o-mini',
    base_url: `${providerBase}/v1`, api_key_env: 'HISTORY_ACCEPTANCE_MODEL_KEY',
    env_vars: { HISTORY_ACCEPTANCE_MODEL_KEY: 'fixture-only-not-a-real-key' },
    memory: { refresh: { enabled: false } } }), { mode: 0o600 });
  const octosBase = `http://127.0.0.1:${await freePort()}`;
  log = await open(join(root, 'octos.log'), 'a', 0o600);
  const startOctos = async () => {
    octos = spawn(binary, ['serve', '--host', '127.0.0.1', '--port', new URL(octosBase).port,
      '--data-dir', join(root, 'octos'), '--config', fixtureConfig, '--solo'], {
      cwd: root, env: { ...process.env, OCTOS_MEMORY_REFRESH_ENABLED: '0', OCTOS_NO_MODEL_DOWNLOAD: '1' },
      stdio: ['ignore', log.fd, log.fd],
    });
    for (let i = 0; i < 150; i++) {
      if (octos.exitCode !== null) throw Error('Fixture Octos exited; inspect its private fixture log');
      try { if ((await fetch(`${octosBase}/api/auth/status`)).ok) return; } catch { /* starting */ }
      await delay(200);
    }
    throw Error('Fixture Octos did not start');
  };
  await startOctos();
  const created = await fetch(`${octosBase}/api/auth/solo/create`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      name: 'History acceptance', username: 'history-acceptance', email: 'history-acceptance@solo.local',
    }) });
  assert.equal(created.status, 200, 'Automated fixture account creation');
  const { token } = await created.json(); assert.equal(typeof token, 'string');
  const profile = await fetch(`${octosBase}/api/my/profile`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(profile.status, 200);
  const owner = (await profile.json()).id; assert.equal(owner, 'history-acceptance');
  const identity = { owner, token };
  let clock = Date.now();
  const openStorage = () => storage = new HistoryStore(database, { now: () => new Date(clock).toISOString() });
  const startProduct = async () => {
    openStorage(); const handler = createHistoryHandler({ store: storage, octosBaseUrl: octosBase });
    product = createHttpServer((request, response) => { void handler(request, response); });
    return listen(product);
  };
  let productBase = await startProduct();
  const sessionId = 'learn-history-acceptance';
  const common = { version: 1, run_id: 'run-acceptance', question_id: 'question-acceptance',
    session_id: sessionId, device_id: 'fixture', occurred_at: new Date(clock).toISOString() };
  const events = [
    { ...common, id: 'question', kind: 'question_submitted', data: { text: '验收样例：为什么直线不经过原点？', modality: 'text' } },
    { ...common, id: 'route', kind: 'question_routed', data: { conversation_route: 'direct-action' } },
    { ...common, id: 'answer', kind: 'answer_delivered', data: { text: '验收样例回应：观察直线与纵轴的交点。', part_id: 'answer-part' } },
  ];
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Learning-Owner': owner };
  const submitted = await fetch(`${productBase}/api/learn/history/events`, { method: 'POST', headers, body: JSON.stringify({ events }) });
  assert.equal(submitted.status, 200);
  assert.deepEqual((await submitted.json()).results.map(row => row.status), ['accepted', 'accepted', 'accepted']);

  vite = await createViteServer({ root: repo, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  const { deliverHistoryMessages } = await vite.ssrLoadModule('/src/learning/history/deliver-messages.ts');
  const { createUiProtocolBridge } = await vite.ssrLoadModule('/src/runtime/ui-protocol-bridge.ts');
  let fullRetryCapability = false, firstReceipt;
  const bridge = () => createUiProtocolBridge({ origin: octosBase, getToken: () => token, getProfileId: () => owner });
  let once = true;
  await assert.rejects(deliverHistoryMessages(identity, productBase, {
    probeSessionId: sessionId, createBridge: () => {
      const connection = bridge(); const original = connection.callMethod.bind(connection);
      connection.callMethod = async (method, params) => {
        fullRetryCapability = connection.supportsFullHistoryAppendRetry();
        const receipt = await original(method, params);
        if (once && method === 'session/append_message') { once = false; firstReceipt = receipt; throw Error('Injected lost receipt'); }
        return receipt;
      };
      return connection;
    },
  }), /Injected lost receipt/);
  assert.equal(fullRetryCapability, true);
  assert.ok(firstReceipt);
  // The write succeeded, but the product did not record a receipt. Restart
  // both services and expire only the fixture's lease to exercise retry.
  await close(product); product = undefined; storage.close(); storage = undefined;
  await stopOctos(); await startOctos(); clock += 31000; productBase = await startProduct();
  const delivered = await deliverHistoryMessages(identity, productBase, { probeSessionId: sessionId, createBridge: bridge });
  assert.deepEqual(delivered, { status: 'idle', delivered: 2 });
  const reader = bridge();
  try {
    await reader.start({ sessionId });
    const page = await reader.callMethod('session/messages_page', { session_id: sessionId, limit: 100 });
    assert.equal(page.messages.length, 2, 'No duplicate question after restarting and retrying');
    assert.deepEqual(page.messages.map(message => message.content), [events[0].data.text, events[2].data.text]);
    const retry = await reader.callMethod('session/append_message', {
      session_id: sessionId, role: 'user', content: 'Changed retry must not overwrite the original', media: [],
      source: 'external_record:octos-learn', client_message_id: 'learn:user:question-acceptance',
    });
    assert.equal(retry.seq, firstReceipt.seq); assert.equal(retry.thread_id, firstReceipt.thread_id);
    const unchanged = await reader.callMethod('session/messages_page', { session_id: sessionId, limit: 100 });
    assert.deepEqual(unchanged.messages.map(message => message.content), page.messages.map(message => message.content));
    assert.deepEqual(await deliverHistoryMessages(identity, productBase, { probeSessionId: sessionId, createBridge: bridge }), { status: 'idle', delivered: 0 });
    assert.deepEqual(storage.deliveryStatus(owner).map(row => ({ ...row })), [{ state: 'delivered', count: 2 }]);
    assert.equal(modelCalls, 0, 'No requests to the fixture model endpoint');
    console.log(JSON.stringify({ checked_at: new Date().toISOString(), binary, scope: 'Isolated automated fixture, real Octos process and product service, actual delivery client',
      full_history_retry_negotiated: fullRetryCapability, lost_receipt_retried_after_both_services_restart: true,
      original_question_and_answer_preserved: true, message_count: 2, repeated_delivery_added_messages: 0,
      original_seq_and_thread_receipt_retained: true, delivered_tasks: 2, model_calls: modelCalls }, null, 2));
    succeeded = true;
  } finally { await reader.stop(); }
} finally {
  await close(product); storage?.close(); await vite?.close(); await stopOctos(); await close(provider); await log?.close();
  // This directory was created by this invocation and holds fixture data only.
  if (succeeded) await rm(root, { recursive: true, force: true });
  else console.error(`Automated fixture diagnostics retained at ${root}`);
}

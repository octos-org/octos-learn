// Technical feasibility probe only: actual Octos agent, a local model fixture,
// synthetic account and isolated memory. Does not install or change user skills.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, open, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HistoryStore } from '../services/learning-history/store.mjs';

const [binary, output] = process.argv.slice(2);
assert.ok(binary?.startsWith('/') && output?.startsWith('/'), 'Supply an absolute Octos binary and NEW result JSON path');
const root = await mkdtemp(join(tmpdir(), 'octos-topic-analysis-'));
await writeFile(output, '{}\n', { flag: 'wx', mode: 0o600 });
const log = await open(join(root, 'octos.log'), 'a', 0o600);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const listen = async server => { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${server.address().port}`; };
const expected = { question: { status: 'unknown', reason: 'missing-context', topics: [] },
  beats: [{ id: 'beat-one', status: 'mapped', topics: ['fixture-slope'] }] };
const history = new HistoryStore(join(root, 'history.sqlite'));
const snapshot = JSON.stringify([{ event: 'lesson.step', lesson_id: 'fixture', step: { id: 'step-one', beats: [{ id: 'beat-one', narration: { text: '横向增加一格时，纵向增加两格，斜率为二。' } }] } }]);
const snapshotHash = createHash('sha256').update(snapshot).digest('hex');
const delivery = { version: 1, id: 'delivery-one', kind: 'course_delivered', occurred_at: '2026-10-22T00:00:00.000Z', device_id: 'fixture', session_id: 'learn-topic-host', question_id: 'q1', run_id: 'run-one',
  course: { kind: 'generated', id: 'q1', version: 'q1' }, data: { artifact: 'lesson.jsonl', status: 'partial', snapshot_sha256: snapshotHash, event_count: 1 } };
history.append('topic-fixture', [delivery], [{ event_id: delivery.id, snapshot_json: snapshot }]);
const requests = []; let child, socket;
const provider = createServer(async (request, response) => {
  if (request.method === 'POST' && request.url.endsWith('/embeddings')) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: [{ index: 0, embedding: Array(1536).fill(0.01) }] })); return;
  }
  if (request.method !== 'POST' || !request.url.endsWith('/chat/completions')) { response.writeHead(404); response.end(); return; }
  const chunks = []; for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks)); requests.push(body);
  assert.ok(requests.length <= 2, 'Unexpected extra fixture model request');
  const content = JSON.stringify(expected);
  if (body.stream) {
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\ndata: [DONE]\n\n`);
  } else {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ id: 'fixture', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
  }
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
  const ws = new URL(`${base.replace('http:', 'ws:')}/api/ui-protocol/ws`); ws.searchParams.set('token', token);
  ws.searchParams.append('ui_feature', 'state.session_hydrate.v1');
  socket = new WebSocket(ws);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(Error('Fixture WebSocket failed')); });
  let sequence = 0; const pending = new Map(); const notifications = [];
  socket.onmessage = event => {
    const value = JSON.parse(event.data);
    if (value.id && pending.has(value.id)) {
      const item = pending.get(value.id); pending.delete(value.id); clearTimeout(item.timer);
      if (value.error) item.reject(Error(`${item.method}: ${JSON.stringify(value.error)}`)); else item.resolve(value.result);
    } else notifications.push(value);
  };
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = `topic-${++sequence}`;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`Timed out: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer, method });
    socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, profile_id: 'topic-fixture' } }));
  });
  const session = 'learn-topic-host';
  const opened = await rpc('session/open', { session_id: session });
  assert.ok(JSON.stringify(opened).includes('peer/prepare'), 'Peer API not advertised');
  const prepared = await rpc('peer/prepare', { session_id: session, names: ['LearningTopics'],
    brief: 'Analyze observed learning material. Distinguish original questions from delivered explanations. Return JSON and retain unknown when context is missing. Do not infer mastery or student preferences.',
    memory_namespace: 'app/learning-topics/fixture',
  });
  assert.equal(typeof prepared.host_token, 'string');
  const peer = prepared.slug;
  await rpc('peer/tools/register', { session_id: session, peer, host_token: prepared.host_token, tools: [], generic_tools: [] });
  const peerSession = prepared.topic?.startsWith(`${session}#`) ? prepared.topic : `${session}#${prepared.topic}`;
  await rpc('session/open', { session_id: peerSession });
  // The host reads authenticated product records; it does not hand the model
  // a database path, bearer token, or a later mutable lesson artifact.
  const preserved = history.courseMaterial('topic-fixture', delivery.id);
  const input = JSON.stringify({ schema: 'learning-topic-analysis-input-v1', question: { id: 'q1', text: '还是不懂', context: [], media: [] },
    delivered: [{ event_id: preserved.event_id, sha256: preserved.sha256, events: JSON.parse(preserved.snapshot_json) }],
    candidates: [{ id: 'fixture-slope', name: 'Synthetic slope topic for transport verification only' }] });
  await rpc('turn/start', { session_id: peerSession, turn_id: '12345678-1234-4234-8234-123456789abc', origin: { kind: 'app', label: 'Learning material analysis' }, input: [{ kind: 'text', text: input }] });
  let messages;
  for (let n = 0; n < 150; n++) {
    const page = await rpc('session/hydrate', { session_id: peerSession, include: ['messages'] });
    messages = page.messages;
    if (messages.some(message => message.role === 'assistant' && JSON.stringify(message).includes('missing-context'))) break;
    if (notifications.some(item => item.method === 'turn/error')) throw Error('Analysis turn failed; inspect fixture log');
    await wait(100);
  }
  assert.ok(messages.some(message => message.role === 'assistant' && JSON.stringify(message).includes('missing-context')), 'Analysis result not readable');
  const answer = messages.find(message => message.role === 'assistant' && message.content.includes('missing-context'));
  assert.deepEqual(JSON.parse(answer.content), expected, 'Returned analysis JSON changed during persistence or hydration');
  const student = await rpc('session/hydrate', { session_id: session, include: ['messages'] });
  assert.equal(student.messages.length, 0, 'Maintenance input entered the host classroom history');
  const prompt = JSON.stringify(requests);
  assert.ok(prompt.includes('[from the app: Learning material analysis]'), 'Application origin missing from model input');
  assert.ok(prompt.includes('还是不懂'));
  assert.ok(prompt.includes(snapshotHash));
  assert.ok(prompt.includes('横向增加一格'));
  assert.ok(requests.length >= 1);
  const report = { checked_at: new Date().toISOString(), passed: true, octos_binary_sha256: createHash('sha256').update(await readFile(binary)).digest('hex'),
    scope: 'Actual isolated Octos host-owned app peer, app-origin turn, local model replacement, readable result and separate host transcript',
    original_account_modified: false, real_supplier_calls: 0, fixture_model_requests: requests.length,
    automatic_scheduling_verified: false, classification_quality_verified: false, production_integration_complete: false,
    input_origin: 'app', preserved_course_bytes_supplied: true, synthetic_taxonomy: true,
    result_readable: true, classroom_transcript_unchanged: true, private_fixture_directory: root };
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
} finally {
  socket?.close();
  if (child?.exitCode === null && child.signalCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
  provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); await log.close(); history.close();
  console.log(JSON.stringify({ private_fixture_directory: root }));
}

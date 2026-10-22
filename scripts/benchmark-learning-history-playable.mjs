// Free, isolated full-application comparison. No connection to personal Octos,
// real accounts, or suppliers. This measures fixed-response overhead, not LLM speed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, symlink, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { HistoryStore } from '../services/learning-history/store.mjs';
import { createProductHandler } from '../services/product-server.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
const baseline = git('rev-parse', '4973499^{commit}');
const candidate = git('rev-parse', 'HEAD');
execFileSync('git', ['diff', '--quiet', 'HEAD', '--', 'src', 'services', 'build', 'android', 'package.json', 'pnpm-lock.yaml', 'vite.config.ts'], { cwd: repository });
const resultPath = process.env.PLAYABLE_BENCHMARK_RESULT;
assert.ok(resultPath, 'Set PLAYABLE_BENCHMARK_RESULT to a NEW JSON file');
const pairs = Number(process.env.PLAYABLE_BENCHMARK_PAIRS ?? 10);
assert.ok(Number.isSafeInteger(pairs) && pairs > 0 && pairs <= 30);
const conditions = (process.env.PLAYABLE_BENCHMARK_CONDITIONS ?? 'small,large,retry,inflight').split(',');
assert.ok(conditions.length && new Set(conditions).size === conditions.length && conditions.every(c => ['small', 'large', 'retry', 'inflight'].includes(c)));
const hash = value => createHash('sha256').update(value).digest('hex');
const marker = '固定斜率';
const origin = 'https://history-benchmark.invalid';
const owner = 'playable-fixture';
const fixtureToken = 'synthetic-playable-token';
const negativeControl = process.env.PLAYABLE_BENCHMARK_CONTROL;
assert.ok(!negativeControl || ['silent-audio', 'missing-course'].includes(negativeControl));
const root = await mkdtemp(join(tmpdir(), 'octos-playable-fixture-'));
const builds = process.env.PLAYABLE_BENCHMARK_BUILDS ?? await mkdtemp(join(tmpdir(), 'octos-playable-builds-'));
await mkdir(builds, { recursive: true });
const report = {
  started_at: new Date().toISOString(), baseline, candidate, builds,
  scope: 'Full production frontends with fixed progressive course and real Web Audio rendering; isolated account/database; protocol and suppliers replaced. Not a real-provider speed verdict.',
  model_calls: 0, real_supplier_calls: 0, normal_environment_changed: false,
  collector_sha256: hash(await readFile(fileURLToPath(import.meta.url))),
  clock: 'Browser performance.now; visual after two animation frames; audio after nonzero matching-buffer samples are observed in a running AudioContext',
  pairs_per_condition: pairs, conditions, rows: [], warmup_rows: [], status: 'running',
  negative_control: negativeControl ?? null,
};
// Refuse accidental overwriting of historical evidence, including a prior failure.
await writeFile(resultPath, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
const save = () => writeFile(resultPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flush: true });
async function command(executable, args, cwd, log) {
  const child = spawn(executable, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  const output = [];
  child.stdout.on('data', chunk => output.push(chunk)); child.stderr.on('data', chunk => output.push(chunk));
  const code = await new Promise((done, fail) => { child.once('error', fail); child.once('exit', done); });
  await writeFile(log, Buffer.concat(output), { mode: 0o600 });
  assert.equal(code, 0, `Build command failed; see ${log}`);
}
async function prepare(name, ref) {
  const directory = join(builds, name);
  const metadata = join(directory, 'benchmark-build.json');
  let cached;
  try { cached = JSON.parse(await readFile(metadata, 'utf8')); } catch { /* Build below. */ }
  if (!cached) {
    // Archives contain tracked source only. Never switch the user's checkout,
    // reuse dist/, copy local credentials, or run lifecycle scripts with side effects.
    await mkdir(directory, { recursive: true });
    const archive = join(directory, 'source.tar');
    execFileSync('git', ['archive', '--format=tar', '--output', archive, ref], { cwd: repository });
    await command('tar', ['-xf', archive, '-C', directory], repository, join(directory, 'extract.log'));
    assert.equal(await readFile(join(directory, 'pnpm-lock.yaml'), 'utf8'), await readFile(join(repository, 'pnpm-lock.yaml'), 'utf8'), 'Install pinned dependencies separately if lockfiles differ');
    await symlink(join(repository, 'node_modules'), join(directory, 'node_modules'), 'dir');
    console.log(JSON.stringify({ stage: 'building', name, ref }));
    await command(process.execPath, [join(repository, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'public'], directory, join(directory, 'build.log'));
    const html = await readFile(join(directory, 'dist/index.html'), 'utf8');
    const entry = /<script[^>]+src="([^"]+)"/.exec(html)?.[1];
    assert.ok(entry);
    cached = { ref, entry, entry_sha256: hash(await readFile(join(directory, 'dist', entry))) };
    await writeFile(metadata, JSON.stringify(cached, null, 2));
  }
  assert.equal(cached.ref, ref, `Stale ${name} build; choose a new PLAYABLE_BENCHMARK_BUILDS directory`);
  assert.equal(hash(await readFile(join(directory, 'dist', cached.entry))), cached.entry_sha256);
  return { ...cached, source: directory, dist: join(directory, 'dist') };
}
function wave() {
  const samples = 24000, buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(24000, 24); buffer.writeUInt32LE(48000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(600 * Math.sin(2 * Math.PI * 440 * i / 24000)), 44 + 2 * i);
  return buffer;
}
const audio = wave();
const lesson = {
  dsl: 'octos.lesson', version: '0.1', profile: 'authoring',
  lesson: { mode: 'explain', language: 'zh-CN', title: '固定响应性能课程', goals: ['认识斜率'] },
  steps: [{ key: 'observe', purpose: '观察', beats: [{ key: 'first', say: '直线的斜率是二。', actions: [
    { do: 'write', as: 'fixed-card', kind: 'note', role: 'concept', content: { text: marker }, place: { relation: 'new_region' } },
  ] }] }], close: { summary: '观察完成', focus: ['fixed-card'] },
};
const secondLesson = { ...lesson, steps: [...lesson.steps, { key: 'finish', purpose: '小结', beats: [{ key: 'second', actions: [
  { do: 'write', as: 'summary-card', kind: 'note', role: 'concept', content: { text: '继续观察' }, place: { relation: 'below', anchor: 'fixed-card' } },
] }] }] };
report.fixture = { lesson_sha256: hash(JSON.stringify(lesson)), second_part_sha256: hash(JSON.stringify(secondLesson)), audio_sha256: hash(audio), audio_seconds: 1, part_delays_ms: [200, 900], completion_delay_ms: 1600, large_server_events: 10000, large_local_documents: 1000, retry_pending_events: 500, inflight_pending_events: 500, inflight_release_after_invocation_ms: 100 };
const synthetic = n => ({ version: 1, id: `fixture-${n}`, kind: 'question_submitted', occurred_at: '2026-10-21T08:00:00.000Z', device_id: 'fixture', session_id: `fixture-board-${n % 100}`, run_id: `fixture-run-${n % 100}`, question_id: `q-${n}`, data: { text: '合成记录', modality: 'text' } });
const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm' };

// Executed before the app's JavaScript. Wrappers always invoke real native
// methods. The silent analyser branch observes the same decoded buffer that
// the application routes to its real output; it does not substitute playback.
function observeBrowser({ owner, token, marker }) {
  localStorage.setItem('octos_session_token', token); localStorage.setItem('selected_profile', owner);
  localStorage.setItem(`octos-learn:setup-skipped:${owner}`, 'yes');
  localStorage.setItem('octos_learning_auto_camera', 'false'); localStorage.setItem('octos_learning_input_mode', 'text');
  const s = window.__playableBenchmark = { start: 0, visual: 0, audio: 0, sources: 0, audioContexts: [], errors: [] };
  document.addEventListener('submit', () => { if (!s.start) { s.start = performance.now(); requestAnimationFrame(watchVisual); } }, true);
  const visible = () => [...document.querySelectorAll('[data-testid="oll-lesson-board"] .board-node[data-id]')].some(node => {
    const box = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return node.textContent.includes(marker) && box.width > 0 && box.height > 0 && box.right > 0 && box.bottom > 0 && box.left < innerWidth && box.top < innerHeight && style.visibility !== 'hidden' && style.opacity !== '0';
  }) && !!document.querySelector('[data-testid="oll-controls"] button:not([disabled])');
  // Camera transitions can reveal a node without a DOM mutation. Poll actual
  // geometry every frame, then require two frames with the course visible.
  function watchVisual() {
    if (s.visual) return;
    if (!visible()) { requestAnimationFrame(watchVisual); return; }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (visible()) s.visual ||= performance.now(); else requestAnimationFrame(watchVisual);
    }));
  }
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    const result = start.apply(this, args);
    if (!s.start || s.audio) return result;
    s.sources++;
    const c = this.context, analyser = c.createAnalyser(), mute = c.createGain();
    analyser.fftSize = 256; mute.gain.value = 0; this.connect(analyser); analyser.connect(mute); mute.connect(c.destination);
    const data = new Float32Array(analyser.fftSize);
    const beginning = performance.now(); let lastPoll = beginning;
    const poll = () => {
      analyser.getFloatTimeDomainData(data);
      if (c.state === 'running' && data.some(v => Math.abs(v) > 0.001)) {
        s.audio ||= performance.now(); s.audioObservationInterval = [lastPoll - s.start, s.audio - s.start];
        s.audioContexts.push({ state: c.state, sampleRate: c.sampleRate, duration: this.buffer?.duration });
        this.disconnect(analyser); analyser.disconnect(); mute.disconnect();
      } else if (!s.audio && performance.now() - beginning < 5000) requestAnimationFrame(poll);
      lastPoll = performance.now();
    };
    requestAnimationFrame(poll);
    return result;
  };
}

async function sample(browser, artifacts, version, condition, pair) {
  const row = { version, condition, pair, action_invocations: 0, turn_starts: 0, tts_requests: 0, history_requests: 0, failed_uploads: 0, history_failures: [], history_requests_after_invocation: [], unexpected_http: [], unexpected_rpc: [], client_errors: [] };
  const directory = join(root, `${condition}-${pair}-${version}`);
  await mkdir(join(directory, 'profiles'), { recursive: true });
  const profile = { id: owner, name: 'Synthetic Learner', config: { llm: { primary: { family_id: 'google', model_id: 'gemini-2.5-flash' } }, env_vars: { GEMINI_API_KEY: 'synthetic-never-sent', OCTOS_LEARN_TTS_API_KEY: 'synthetic-no-real-key', OCTOS_LEARN_TTS_PARAMS: JSON.stringify({ provider: 'volcano', params: { auth_mode: 'api-key', resource_id: 'fixture', voice: 'fixture' } }) } } };
  await writeFile(join(directory, 'profiles', `${owner}.json`), JSON.stringify(profile), { mode: 0o600 });
  const store = new HistoryStore(join(directory, 'history.sqlite'));
  if (version === 'candidate' && condition === 'large') for (let i = 0; i < 10000; i += 100) store.append(owner, Array.from({ length: 100 }, (_, j) => synthetic(i + j)));
  const options = { registryRoot: directory, store, migrateLegacy: false,
    fetchImpl: async (url, init) => {
      assert.equal(new URL(url).pathname, '/api/my/profile'); assert.equal(init.method ?? 'GET', 'GET');
      assert.equal(init.headers.authorization, `Bearer ${fixtureToken}`);
      return Response.json({ profile: { ...profile, config: { ...profile.config, env_vars: { GEMINI_API_KEY: '********' } } } });
    },
    supplierFetch: async (url, init) => {
      assert.equal(url, 'https://openspeech.bytedance.com/api/v3/tts/unidirectional');
      assert.equal(JSON.parse(init.body).req_params.text, '直线的斜率是二。');
      row.tts_requests++;
      await new Promise(done => setTimeout(done, 50));
      const bytes = Buffer.from(audio); if (negativeControl === 'silent-audio') bytes.fill(0, 44);
      return new Response(JSON.stringify({ code: 0, data: bytes.toString('base64') }), { headers: { 'X-Api-Status-Code': '20000000' } });
    },
  };
  const handler = version === 'candidate' ? createProductHandler(options)
    : (await import(pathToFileURL(join(artifacts.source, 'services/byok/server.mjs')).href)).createByokHandler(options);
  let releaseHistory;
  const server = createServer((request, response) => {
    const dispatch = () => {
      void handler(request, response).then(handled => { if (!handled) { response.writeHead(404); response.end('{}'); } }).catch(error => { row.client_errors.push(`fixture-server:${error.message}`); response.writeHead(500); response.end('{}'); });
    };
    if (request.url.startsWith('/api/learn/history/')) {
      row.history_requests++;
      if (turnId) row.history_requests_after_invocation.push(request.url);
      // Simulate a slow deletion-page response that was already requested
      // before the student submits. The actual handler runs after release.
      if (condition === 'inflight' && request.url.startsWith('/api/learn/history/changes?') && !row.inflight_history_held) {
        row.inflight_history_held = true; releaseHistory = dispatch; return;
      }
      if (condition === 'retry' && request.method === 'POST' && request.url.endsWith('/events')) {
        row.failed_uploads++; request.resume(); response.writeHead(503, { 'content-type': 'application/json' }); response.end('{}'); return;
      }
    }
    dispatch();
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const timers = new Set();
  const later = (delay, fn) => { const timer = setTimeout(() => { timers.delete(timer); fn(); }, delay); timers.add(timer); };
  let sessionId, turnId, page, ready = false, secondReady = false, completed = false;
  const sockets = new Set();
  const part = n => `study/oll/${turnId}.part-00${n}.octos-lesson.json`;
  const files = () => ready ? (secondReady ? [0, 1] : [0]).map(n => ({ filename: part(n).split('/').at(-1), path: part(n), size_bytes: 100, modified_at: '2026-10-21T08:00:00Z' })) : [];
  const job = status => ({ job_id: 'fixed-job', batch_id: 'fixed-batch', profile_id: owner, session_id: sessionId, action_id: 'learning.lesson.generate', skill_id: 'learning-coach', status, created_at: '2026-10-21T08:00:00Z', updated_at: '2026-10-21T08:00:01Z', ...(status === 'succeeded' ? { result: { success: true, output: '课程准备完成' } } : {}) });
  const notify = (method, params) => { for (const socket of sockets) socket.send(JSON.stringify({ jsonrpc: '2.0', method, params })); };
  try {
    await context.addInitScript(observeBrowser, { owner, token: fixtureToken, marker });
    await context.routeWebSocket(() => true, socket => {
      sockets.add(socket); socket.onClose(() => sockets.delete(socket));
      socket.onMessage(raw => {
        const q = JSON.parse(String(raw)); if (!q.id) return;
        const p = q.params ?? {}; let result = {};
        switch (q.method) {
          case 'session/open': sessionId = p.session_id; result = { opened: { session_id: sessionId, active_profile_id: owner, capabilities: { supported_features: ['projection.envelope.v2', 'skill.actions.v1', 'skill.action_jobs.v1', 'state.session_hydrate.v1'] } } }; break;
          case 'session/hydrate': result = { session_id: p.session_id, cursor: { stream: 'fixture', seq: 0 }, messages: [], envelopes: [] }; break;
          case 'session/files.list': result = { files: files() }; break;
          case 'session/list': result = { sessions: [] }; break;
          case 'loop/list': result = { loops: [] }; break;
          case 'session/goal/get': result = { goal: null }; break;
          case 'session/title.set': result = { ok: true }; break;
          case 'skill/action/list': result = { actions: [] }; break;
          case 'skill/action/job/list': result = { jobs: turnId ? [job(completed ? 'succeeded' : 'running')] : [] }; break;
          case 'skill/action/invoke':
            row.action_invocations++; assert.equal(p.action_id, 'learning.lesson.generate');
            sessionId = p.session_id; turnId = p.arguments.turn_id;
            result = { ok: true, action_id: p.action_id, queued: 1, jobs: [job('queued')] };
            if (releaseHistory) later(100, () => { row.inflight_history_released = true; releaseHistory(); releaseHistory = undefined; });
            later(200, () => {
              if (negativeControl === 'missing-course') return;
              ready = true;
              notify('tool/progress', { session_id: sessionId, turn_id: turnId, tool_call_id: 'oll_generate_lesson', message: `[artifact:oll_lesson_part] part=0 (${part(0)})` });
            });
            later(900, () => { if (negativeControl === 'missing-course') return; secondReady = true; notify('tool/progress', { session_id: sessionId, turn_id: turnId, tool_call_id: 'oll_generate_lesson', message: `[artifact:oll_lesson_part] part=1 (${part(1)})` }); });
            later(1600, () => { completed = true; notify('skill/action/job/updated', job('succeeded')); });
            break;
          case 'turn/start': row.turn_starts++; row.unexpected_rpc.push(q.method); break;
          case 'session/status.get': result = { status: { state: 'idle' } }; break;
          case 'session/workspace.get': result = { contracts: [] }; break;
          default: row.unexpected_rpc.push(q.method); socket.send(JSON.stringify({ jsonrpc: '2.0', id: q.id, error: { code: -32601, message: 'Unimplemented fixture RPC' } })); return;
        }
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: q.id, result }));
      });
    });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { row.unexpected_http.push(`${url.origin}${url.pathname}`); return route.abort('blockedbyclient'); }
      const responses = {
        '/api/auth/status': { bootstrap_mode: false, email_login_enabled: true },
        '/api/auth/me': { user: { id: owner, email: 'fixture@example.test', name: 'Synthetic Learner' }, portal: { accessible_profiles: [{ id: owner, name: 'Synthetic Learner' }], home_profile_id: owner, can_access_admin_portal: false } },
        '/api/my/profile': { ...profile, config: { ...profile.config, env_vars: { GEMINI_API_KEY: '********' } } },
        '/api/learn/course-packs': { collections: [], packs: [] },
      };
      if (url.pathname in responses) return route.fulfill({ json: responses[url.pathname] });
      if (url.pathname === '/api/files' || url.pathname.startsWith('/api/files/')) {
        const path = url.searchParams.get('path') ?? decodeURIComponent(url.pathname.slice('/api/files/'.length)); assert.ok(ready && (path === part(0) || secondReady && path === part(1)));
        return route.fulfill({ json: path === part(0) ? lesson : secondLesson });
      }
      if (url.pathname.startsWith('/api/learn/byok/') || url.pathname.startsWith('/api/learn/history/')) {
        const headers = { ...(await request.allHeaders()) }; delete headers.host; delete headers.origin; delete headers['content-length'];
        const response = await fetch(endpoint + url.pathname + url.search, { method: request.method(), headers, ...(['GET', 'HEAD'].includes(request.method()) ? {} : { body: request.postDataBuffer() }), redirect: 'error' });
        if (url.pathname.startsWith('/api/learn/history/') && !response.ok && !(condition === 'retry' && url.pathname.endsWith('/events') && response.status === 503)) row.history_failures.push({ path: url.pathname, status: response.status });
        if (url.pathname === '/api/learn/history/deliveries' && response.ok) row.initial_history_check = true;
        return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
      }
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/private-asr')) { row.unexpected_http.push(url.pathname); return route.fulfill({ status: 503, json: {} }); }
      if (url.pathname === '/seed') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Isolated fixture seed</title>' });
      const target = request.isNavigationRequest() ? join(artifacts.dist, 'index.html') : resolve(artifacts.dist, '.' + decodeURIComponent(url.pathname));
      assert.ok(target.startsWith(artifacts.dist + sep));
      try { assert.ok((await stat(target)).isFile()); return route.fulfill({ body: await readFile(target), contentType: contentTypes[extname(target)] ?? 'application/octet-stream' }); }
      catch { row.unexpected_http.push(url.pathname); return route.fulfill({ status: 404 }); }
    });
    page = await context.newPage();
    page.on('pageerror', error => row.client_errors.push(error.message));
    await page.goto(origin + '/seed');
    row.seed = await page.evaluate(async ({ version, condition, owner, pending }) => {
      const db = await new Promise((done, fail) => {
        const request = indexedDB.open('octos-learning-documents', version === 'candidate' ? 2 : 1);
        request.onupgradeneeded = () => {
          const db = request.result; db.createObjectStore('documents');
          if (version === 'candidate') { const store = db.createObjectStore('history-events'); store.createIndex('owner', 'owner'); db.createObjectStore('history-meta'); }
        };
        request.onsuccess = () => done(request.result); request.onerror = () => fail(request.error);
      });
      const tx = db.transaction([...db.objectStoreNames], 'readwrite');
      if (condition === 'large') for (let i = 0; i < 1000; i++) tx.objectStore('documents').put({ fixture: true, text: '固定的历史检查点'.repeat(100) }, `fixture-checkpoint-${i}`);
      if (version === 'candidate' && ['retry', 'inflight'].includes(condition)) for (const event of pending) tx.objectStore('history-events').put({ owner, event, state: 'pending' }, [owner, event.id]);
      await new Promise((done, fail) => { tx.oncomplete = done; tx.onabort = () => fail(tx.error); }); db.close();
      return { local_documents: condition === 'large' ? 1000 : 0, queued_events: version === 'candidate' && ['retry', 'inflight'].includes(condition) ? pending.length : 0 };
    }, { version, condition, owner, pending: ['retry', 'inflight'].includes(condition) ? Array.from({ length: 500 }, (_, i) => synthetic(i)) : [] });
    console.log(JSON.stringify({ stage: 'open', condition, pair, version }));
    await page.goto(origin + '/board?new-board=1');
    const input = page.getByRole('textbox', { name: '输入学习问题', exact: true });
    await input.waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector('input[aria-label="输入学习问题"]')?.disabled);
    if (version === 'candidate' && condition === 'inflight') {
      const deadline = Date.now() + 10000;
      while (!row.inflight_history_held && Date.now() < deadline) await new Promise(done => setTimeout(done, 25));
      assert.ok(row.inflight_history_held, 'Initial synchronization must be in flight before submission');
    } else if (version === 'candidate' && condition === 'retry') {
      const deadline = Date.now() + 10000;
      while (!row.failed_uploads && Date.now() < deadline) await new Promise(done => setTimeout(done, 50));
      assert.ok(row.failed_uploads, 'Retry condition must actually attempt and fail an upload before measurement');
    } else if (version === 'candidate') {
      const deadline = Date.now() + 10000;
      while (!row.initial_history_check && !row.history_failures.length && Date.now() < deadline) await new Promise(done => setTimeout(done, 25));
      assert.ok(row.initial_history_check, 'Initial history check must finish successfully before measuring a new question');
    }
    await input.fill('请讲解直线 y=2x+1 的斜率。');
    console.log(JSON.stringify({ stage: 'submit', condition, pair, version }));
    await page.getByRole('button', { name: '发送问题', exact: true }).click();
    await page.waitForFunction(() => { const s = window.__playableBenchmark; return s.start && s.visual && s.audio; }, null, { timeout: negativeControl ? 5000 : 30000 });
    Object.assign(row, await page.evaluate(() => {
      const s = window.__playableBenchmark;
      const fileTimings = performance.getEntriesByType('resource').filter(e => e.name.includes('/api/files/')).map(e => ({ part: /part-(\d+)/.exec(e.name)?.[1], start_ms: e.startTime - s.start, response_end_ms: e.responseEnd - s.start }));
      return { visual_ms: s.visual - s.start, audio_ms: s.audio - s.start, playable_ms: Math.max(s.visual, s.audio) - s.start, audio_observation_interval_ms: s.audioObservationInterval, audio_sources: s.sources, audio_contexts: s.audioContexts, file_timings: fileTimings };
    }));
    assert.equal(row.action_invocations, 1); assert.equal(row.turn_starts, 0); assert.equal(row.tts_requests, 1);
    assert.equal(row.audio_sources, 1); assert.equal(row.audio_contexts.length, 1);
    assert.ok(Math.abs(row.audio_contexts[0].duration - 1) < 0.001, 'Only the fixed one-second fixture can qualify as first narration');
    assert.deepEqual(row.client_errors, []); assert.deepEqual(row.unexpected_rpc, []); assert.deepEqual(row.unexpected_http, []);
    assert.deepEqual(row.history_failures, []);
    if (version === 'candidate' && condition === 'inflight') {
      assert.equal(row.inflight_history_released, true);
      assert.deepEqual(row.history_requests_after_invocation, [], 'Already-running maintenance must yield before another request');
      row.pending_fixture_facts = await page.evaluate(() => new Promise((done, fail) => {
        const request = indexedDB.open('octos-learning-documents');
        request.onerror = () => fail(request.error);
        request.onsuccess = () => {
          const db = request.result, tx = db.transaction('history-events'), read = tx.objectStore('history-events').getAll();
          tx.oncomplete = () => { db.close(); done(read.result.filter(r => r.event.id.startsWith('fixture-') && r.state === 'pending').length); };
          tx.onabort = () => fail(tx.error);
        };
      }));
      assert.equal(row.pending_fixture_facts, 500, 'Yielding must retain every unsent original fact');
    }
    row.state = 'completed';
    return row;
  } catch (error) {
    row.state = 'failed'; row.error = error.message;
    row.browser_state = await page?.evaluate(() => ({ metrics: window.__playableBenchmark, text: document.body.innerText.slice(0, 2000) })).catch(() => undefined);
    report.rows.push(row); await save(); throw error;
  }
  finally {
    for (const timer of timers) clearTimeout(timer);
    await context.close(); server.closeAllConnections(); await new Promise(done => server.close(done));
    handler.close?.(); if (version === 'baseline') store.close();
  }
}
function percentile(values, fraction) { const s = [...values].sort((a, b) => a - b); return s[Math.ceil(s.length * fraction) - 1]; }
let browser;
try {
  const artifacts = { baseline: await prepare('baseline', baseline), candidate: await prepare('candidate', candidate) };
  report.frontends = artifacts;
  browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  report.browser = browser.version();
  // One unreported pair warms both complete builds and the audio pipeline.
  for (const version of ['baseline', 'candidate']) report.warmup_rows.push(await sample(browser, artifacts[version], version, 'small', -1));
  for (const condition of conditions) for (let pair = 0; pair < pairs; pair++) {
    for (const version of pair % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
      const row = await sample(browser, artifacts[version], version, condition, pair);
      report.rows.push(row); await save(); console.log(JSON.stringify({ stage: 'sample', condition, pair, version, playable_ms: row.playable_ms }));
    }
  }
  report.summary = Object.fromEntries(conditions.map(condition => {
    const rows = report.rows.filter(r => r.condition === condition);
    const versions = Object.fromEntries(['baseline', 'candidate'].map(v => [v, Object.fromEntries(['visual_ms', 'audio_ms', 'playable_ms'].map(metric => [metric, { min: Math.min(...rows.filter(r => r.version === v).map(r => r[metric])), p50: percentile(rows.filter(r => r.version === v).map(r => r[metric]), .5), p95: percentile(rows.filter(r => r.version === v).map(r => r[metric]), .95) }]))]));
    const deltas = Array.from({ length: pairs }, (_, i) => rows.find(r => r.pair === i && r.version === 'candidate').playable_ms - rows.find(r => r.pair === i && r.version === 'baseline').playable_ms);
    const delta = versions.candidate.playable_ms.p50 - versions.baseline.playable_ms.p50;
    return [condition, { ...versions, p50_difference_ms: delta, paired_delta_p50_ms: percentile(deltas, .5), paired_delta_p95_ms: percentile(deltas, .95), candidate_faster_pairs: deltas.filter(d => d < 0).length, observed_p50_relation: delta > 0 ? 'candidate higher' : 'candidate no higher', conclusion: 'Fixed-response data only. Assess variation and ordering before attributing any difference; no merge performance pass is established.' }];
  }));
  report.status = 'completed'; report.full_planned_matrix = pairs === 10 && conditions.length === 4;
  report.merge_performance_requirement = 'Measurement data only; assess alongside changed call paths and load coverage. A paid supplier run is not mandatory.';
  report.completed_at = new Date().toISOString(); await save();
  console.log(JSON.stringify({ status: report.status, summary: report.summary, result: resultPath }));
} catch (error) { report.status = 'failed'; report.error = error.message; await save(); throw error; }
finally { await browser?.close(); if (report.status === 'completed') await rm(root, { recursive: true }); else console.log(JSON.stringify({ retained_fixture_directory: root })); }

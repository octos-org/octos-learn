// Isolated first-visual benchmark (speed test option B, user 2026-10-26).
// Baseline and candidate production builds run alternately in a real browser
// against one isolated Octos process with the trial Key; every model request
// passes the budget gateway, which reserves the plan's per-request cost before
// sending. Speech is not configured, so the measure is the time from submitting
// the question to the first course node of this lesson being visible and
// playable — not the full audio-and-visual "first playable" of the LIVE runner.
//
//   node scripts/benchmark-playable-isolated.mjs OCTOS_BINARY SKILL_DIR PLAN.json RESULT.json --key-file F [--max-actual-usd N]
//
// A sample may also carry `storage` (localStorage entries set before the app
// loads) and `warmup` (a first question on the same board, played to the end
// and not measured), so a follow-up's context is exercised. --max-actual-usd
// stops before the next sample once the actual cost, from the responses'
// usage, reaches N.
//
// The Key goes only into the temporary Octos profile; it is never printed or
// written to results, and the temporary Octos data directory is deleted.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { TrialLedger, createModelBudgetGateway, sha256, validateTrialPlan } from './lib/learning-performance-control.mjs';
import { loginExistingTrialOwner } from './lib/learning-performance-auth.mjs';
import { firstPlayableTarget } from './lib/learning-performance-target.mjs';
import { installLivePlayableProbe } from './lib/learning-playable-probe.mjs';

const args = process.argv.slice(2);
const [binary, skill, planPath, resultPath] = args;
assert.ok(binary?.startsWith('/') && skill?.startsWith('/') && planPath && resultPath, 'Supply absolute Octos binary, Learning Coach directory, plan JSON and NEW result JSON path');
const plan = validateTrialPlan(JSON.parse(await readFile(planPath, 'utf8')), { execute: true });
const keyFile = args[args.indexOf('--key-file') + 1];
assert.ok(keyFile?.startsWith('/'), 'Supply --key-file with an absolute path');
assert.equal((await stat(keyFile)).mode & 0o077, 0, 'Key file must not be readable by other users (chmod 600)');
const key = (await readFile(keyFile, 'utf8')).trim();
assert.ok(key && !/\s/.test(key), 'Key file must hold one Key');
const maxActualUsd = args.includes('--max-actual-usd') ? Number(args[args.indexOf('--max-actual-usd') + 1]) : Infinity;
assert.ok(maxActualUsd > 0, '--max-actual-usd must be positive');
// Gemini flash standard pricing per token, as in the plan's cost basis.
const actualUsd = metrics => metrics.prompt_tokens * 0.75e-6 + metrics.output_tokens * 3.75e-6;
const outDir = plan.output_directory; await mkdir(outDir, { recursive: true, mode: 0o700 });
await writeFile(resultPath, '{}\n', { flag: 'wx', mode: 0o600 });

const roots = {};
for (const version of ['baseline', 'candidate']) {
  const build = plan.frontends[version], root = resolve(build.dist);
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const entry = /<script[^>]+src="([^"]+)"/.exec(html)?.[1]; assert.ok(entry);
  assert.equal(sha256(await readFile(join(root, entry))), build.entry_sha256, `${version} build changed`);
  roots[version] = root;
}

const delay = ms => new Promise(done => setTimeout(done, ms));
const listen = async server => { await new Promise(done => server.listen(0, '127.0.0.1', done)); return server.address().port; };
const ledger = new TrialLedger(join(outDir, 'ledger.sqlite'), plan);
const gate = createModelBudgetGateway({ ledger, activeSample: () => ledger.activeSampleId(), upstreamFetch: fetch });
const gateway = `http://127.0.0.1:${await listen(gate.server)}/v1beta`;
const spare = createServer(); const octosPort = await listen(spare); await new Promise(done => spare.close(done));
const octos = `http://127.0.0.1:${octosPort}`;
const root = await mkdtemp(join(tmpdir(), 'octos-playable-isolated-'));
const data = join(root, 'octos'), config = join(root, 'config.json'), owner = 'playable-trial';
await writeFile(config, JSON.stringify({ provider: 'gemini', model: plan.model, base_url: gateway, api_key_env: 'GEMINI_API_KEY',
  env_vars: { GEMINI_API_KEY: 'synthetic-only-not-a-real-key' }, memory: { refresh: { enabled: false } } }), { mode: 0o600 });

// The frontend origin: the two production builds plus a proxy to the isolated
// Octos. The app's own product services are absent: history, BYOK and course
// pack requests answer 503, so nothing is recorded and no speech is set up.
let version = 'baseline';
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.wasm': 'application/wasm' };
const front = createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  if (url.pathname.startsWith('/api/learn/')) { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{}'); return; }
  if (url.pathname.startsWith('/api/')) {
    const upstream = httpRequest(`${octos}${req.url}`, { method: req.method, headers: { ...req.headers, host: `127.0.0.1:${octosPort}`, ...(req.headers.origin ? { origin: octos } : {}) } }, answer => {
      res.writeHead(answer.statusCode ?? 502, answer.headers); answer.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(upstream); return;
  }
  const base = roots[version];
  let path = resolve(base, '.' + decodeURIComponent(url.pathname));
  if (!path.startsWith(base + sep) || !extname(path)) path = join(base, 'index.html');
  void readFile(path).then(body => { res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' }); res.end(body); },
    () => { res.writeHead(404); res.end(); });
});
front.on('upgrade', (req, socket, head) => {
  const upstream = connect(octosPort, '127.0.0.1', () => {
    // Octos accepts a protocol connection only from its own origin, as the
    // development server's proxy presents it.
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries({ ...req.headers, host: `127.0.0.1:${octosPort}`, origin: octos }).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`);
    if (head.length) upstream.write(head);
    upstream.pipe(socket); socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy()); socket.on('error', () => upstream.destroy());
});
const origin = `http://127.0.0.1:${await listen(front)}`;

const log = [], rows = [];
let child, browser, vite, failure;
try {
  const start = async () => {
    child = spawn(resolve(binary), ['serve', '--host', '127.0.0.1', '--port', String(octosPort), '--data-dir', data, '--config', config, '--solo'], {
      cwd: root, env: { PATH: process.env.PATH, TMPDIR: '/private/tmp', GEMINI_BASE_URL: gateway, OCTOS_MEMORY_REFRESH_ENABLED: '0', OCTOS_NO_MODEL_DOWNLOAD: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', c => log.push(c)); child.stderr.on('data', c => log.push(c));
    for (let i = 0; i < 150; i++) {
      assert.equal(child.exitCode, null, 'Isolated Octos exited');
      try { if ((await fetch(`${octos}/api/auth/status`)).ok) return; } catch { /* startup */ }
      await delay(100);
    }
    throw new Error('Isolated Octos startup timed out');
  };
  await start();
  const created = await fetch(`${octos}/api/auth/solo/create`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Playable trial', username: owner, email: 'playable-trial@solo.local' }) });
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
  const { token } = await loginExistingTrialOwner({ request: (path, options) => fetch(octos + path, options), owner, registryRoot: data });

  vite = await createViteServer({ configFile: false, resolve: { alias: { '@': resolve('src') } }, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  const { materializeOllLesson } = await vite.ssrLoadModule('/src/learning/oll/oll-materialization.ts');
  const { ollArtifactIdentity } = await vite.ssrLoadModule('/src/learning/oll/oll-artifacts.ts');
  browser = await chromium.launch({ headless: true });

  // Read-only job status over the protocol, outside the page.
  const ws = new URL(`${octos.replace('http:', 'ws:')}/api/ui-protocol/ws`); ws.searchParams.set('token', token);
  for (const f of ['skill.actions.v1', 'skill.action_jobs.v1']) ws.searchParams.append('ui_feature', f);
  const socket = new WebSocket(ws);
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = () => fail(Error('Status connection failed')); });
  let seq = 0;
  const rpc = (method, params) => new Promise((done, fail) => {
    const id = `status-${++seq}`, timer = setTimeout(() => fail(Error(`${method} timeout`)), 15000);
    socket.onmessage = e => { const r = JSON.parse(e.data); if (r.id !== id) return; clearTimeout(timer); if (r.error) fail(Error(`${method} failed`)); else done(r.result); };
    socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, profile_id: owner } }));
  });

  try {
    for (const sample of plan.samples) {
      if (actualUsd(gate.metrics) >= maxActualUsd) { failure = `Stopped before ${sample.id}: actual cost reached USD ${actualUsd(gate.metrics).toFixed(3)}`; break; }
      version = sample.version;
      const row = { id: sample.id, version: sample.version, topic: sample.topic, prompt_sha256: sha256(sample.prompt), state: 'preflight', actions: 0, turns: 0 };
      rows.push(row);
      const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      const notes = [];
      page.on('console', m => { if (m.type() === 'error' && notes.length < 20) notes.push(m.text().slice(0, 200)); });
      page.on('requestfailed', r => { if (notes.length < 20) notes.push(`failed ${r.url().replace(origin, '')} ${r.failure()?.errorText}`); });
      page.on('response', r => { if (r.status() >= 400 && notes.length < 20) notes.push(`${r.status()} ${r.url().replace(origin, '').slice(0, 120)}`); });
      page.on('websocket', w => w.on('close', () => notes.length < 20 && notes.push(`ws closed ${w.url().replace(origin, '').slice(0, 60)}`)));
      let target, sessionId, turnId;
      await context.addInitScript(({ token, owner }) => {
        localStorage.setItem('octos_session_token', token); localStorage.setItem('selected_profile', owner);
        localStorage.setItem(`octos-learn:setup-skipped:${owner}`, 'yes');
        localStorage.setItem('octos_learning_auto_camera', 'false'); localStorage.setItem('octos_learning_input_mode', 'text');
      }, { token, owner });
      if (sample.storage) await context.addInitScript(entries => { for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v); }, sample.storage);
      await context.addInitScript(installLivePlayableProbe);
      page.on('websocket', socketView => socketView.on('framesent', frame => {
        try {
          const q = JSON.parse(String(frame.payload));
          if (q.method === 'turn/start') row.turns++;
          if (q.method === 'skill/action/invoke' && q.params.action_id === 'learning.lesson.generate') {
            row.actions++; turnId = q.params.arguments.turn_id; row.teacher_profile = Boolean(q.params.arguments.teacher_profile);
            row.current_lesson_chars = q.params.arguments.current_lesson?.length ?? 0;
            row.teacher_experiences_chars = q.params.arguments.teacher_experiences?.length ?? 0;
          }
        } catch { /* binary frame */ }
      }));
      await context.route(`${origin}/api/files**`, async route => {
        const url = new URL(route.request().url());
        const path = url.searchParams.get('path') ?? decodeURIComponent(url.pathname.slice('/api/files/'.length));
        const response = await route.fetch();
        if (!target && turnId && path.split('/').at(-1).startsWith(`${turnId}.`) && path.endsWith('.octos-lesson.json') && response.status() === 200) {
          target = firstPlayableTarget(await response.json(), { filename: path.split('/').at(-1), sessionId, materializeOllLesson, ollArtifactIdentity });
          await page.evaluate(t => { window.__livePlayableProbe.target = t; }, target);
        }
        return route.fulfill({ response });
      });
      try {
        await page.goto(`${origin}/board?new-board=1`);
        const input = page.getByRole('textbox', { name: '输入学习问题', exact: true }); await input.waitFor({ state: 'visible', timeout: 30000 });
        await page.waitForFunction(() => !document.querySelector('input[aria-label="输入学习问题"]')?.disabled);
        sessionId = await page.evaluate(owner => localStorage.getItem(`octos_learning_current_session_v2:${encodeURIComponent(owner)}`), owner);
        assert.ok(sessionId); row.session_id = sessionId;
        ledger.reserveSample(sample.id, sessionId); row.state = 'reserved';
        const awaitJobs = async () => {
          for (let i = 0; i < 3000; i++) {
            const { jobs = [] } = await rpc('skill/action/job/list', { session_id: sessionId });
            const own = jobs.filter(j => j.action_id === 'learning.lesson.generate');
            if (own.length && own.every(j => !['queued', 'running'].includes(j.status))) return own;
            await delay(1000);
          }
          return null;
        };
        if (sample.warmup) {
          // The board's first lesson, not measured: let it finish, then step it
          // to the end so the follow-up asks about a lesson the learner has seen.
          await input.fill(sample.warmup);
          await page.getByRole('button', { name: '发送问题', exact: true }).click();
          const warm = await awaitJobs();
          assert.ok(warm?.every(j => j.status === 'succeeded'), 'Warm-up lesson failed');
          await page.waitForFunction(() => window.__livePlayableProbe.visual, null, { timeout: 180000 });
          const next = page.getByRole('button', { name: '下一 OLL Beat', exact: true });
          // Step through what is delivered, then wait for the teacher's closing
          // line, which appears once the lesson has played to the end.
          for (let i = 0; i < 600; i++) {
            if (await page.getByText('这节课讲完').count()) break;
            if (await next.isEnabled().catch(() => false)) await next.click().catch(() => undefined);
            await delay(400);
          }
          assert.ok(await page.getByText('这节课讲完').count(), 'Warm-up lesson did not play to the end');
          await delay(1000);
          await page.evaluate(() => Object.assign(window.__livePlayableProbe, { start: 0, visual: 0, target: null }));
          target = undefined;
        }
        await input.fill(sample.prompt);
        await page.getByRole('button', { name: '发送问题', exact: true }).click();
        // A follow-up's board waits for the earlier lesson's playback before it
        // shows the new one, so it is compared on generation (prefix_ms) only.
        if (!sample.warmup) {
          await page.waitForFunction(() => window.__livePlayableProbe.visual, null, { timeout: 180000 });
          const probe = await page.evaluate(() => { const s = window.__livePlayableProbe; return { visual_ms: s.visual - s.start, beat_id: s.target?.beatId, artifact_sha256: s.target?.artifactSha256 }; });
          Object.assign(row, probe); row.state = 'first-visual';
        }
        // Wait for the generation job itself; closing the page does not stop it.
        const job = await awaitJobs();
        row.turn_id = turnId;
        assert.ok(job, 'Generation remains in flight');
        row.job_status = job.every(j => j.status === 'succeeded') ? 'succeeded' : 'failed';
        row.model_requests = ledger.snapshot().expenses.filter(e => e.sample_id === sample.id && e.kind === 'model').length;
        assert.equal(row.job_status, 'succeeded'); assert.equal(row.actions, sample.warmup ? 2 : 1); assert.equal(row.turns, 0);
        row.state = 'completed'; ledger.complete(sample.id, { jobsTerminal: true, measurementValid: true });
      } catch (error) {
        row.state = 'needs-inspection'; row.error = error instanceof Error ? error.message.slice(0, 300) : String(error);
        row.page_text = await page.evaluate(() => document.body.innerText.slice(0, 600)).catch(() => null);
        row.browser_notes = notes;
        throw error;
      } finally { await context.close(); }
    }
  } finally { socket.close(); }
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  await browser?.close(); await vite?.close();
  if (child?.exitCode === null && child.signalCode === null) await new Promise(done => { child.once('exit', done); child.kill('SIGTERM'); });
  front.closeAllConnections(); await new Promise(done => front.close(done));
  gate.server.closeAllConnections(); await new Promise(done => gate.server.close(done));
  const spent = ledger.snapshot(); ledger.close();
  const octosLog = Buffer.concat(log);
  const logSaved = !octosLog.includes(key);
  if (logSaved) await writeFile(join(outDir, 'octos.log'), octosLog, { mode: 0o600 });
  // Keep the lesson generation traces and job records (they hold no Key) for
  // inspection; the rest of the temporary Octos data, including the Key, goes.
  const kept = join(outDir, 'skill-traces'); await mkdir(kept, { recursive: true, mode: 0o700 });
  const keep = async dir => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await keep(path);
      else if (/\.generation-trace\.jsonl$|\.job\.json$/.test(entry.name)) {
        const body = await readFile(path); if (!body.includes(key)) await writeFile(join(kept, entry.name), body, { mode: 0o600 });
      }
    }
  };
  await keep(join(data, 'profiles'));
  // Server-side time from the lesson tool starting to its first playable
  // prefix, for every measured lesson (the warm-up's turn is not recorded).
  for (const row of rows) {
    if (!row.turn_id) continue;
    const trace = await readFile(join(kept, `${row.turn_id}.generation-trace.jsonl`), 'utf8').catch(() => '');
    const prefix = trace.split('\n').filter(Boolean).map(line => JSON.parse(line)).find(entry => entry.stage === 'lesson-prefix-published');
    if (prefix) row.prefix_ms = prefix.elapsed_ms;
  }
  await rm(root, { recursive: true, force: true });
  const summary = {};
  const p50 = values => values.length ? values[Math.floor((values.length - 1) / 2)] : null;
  for (const v of ['baseline', 'candidate']) {
    const done = rows.filter(r => r.version === v && r.state === 'completed');
    const values = done.filter(r => typeof r.visual_ms === 'number').map(r => r.visual_ms).sort((a, b) => a - b);
    const prefix = done.filter(r => typeof r.prefix_ms === 'number').map(r => r.prefix_ms).sort((a, b) => a - b);
    summary[v] = { n: values.length, p50_ms: p50(values), values_ms: values.map(x => Math.round(x)), prefix_n: prefix.length, prefix_p50_ms: p50(prefix), prefix_values_ms: prefix };
  }
  const report = { checked_at: new Date().toISOString(), passed: !failure, failure, plan_id: plan.id, plan_sha256: sha256(JSON.stringify(plan)), model: plan.model,
    measure: 'submit to first visible course node of this lesson (no speech configured)',
    octos_binary_sha256: sha256(await readFile(binary)), installed_lesson_plan_sha256: sha256(await readFile(join(skill, 'lesson-plan.js'))),
    gateway: gate.metrics, actual_usd: Number(actualUsd(gate.metrics).toFixed(4)), admitted_requests: spent.expenses.length, reserved_usd_micros: spent.expenses.reduce((sum, x) => sum + x.usd, 0),
    rows, summary, octos_log_saved: logSaved, temporary_octos_data_deleted: true, output_directory: outDir };
  await writeFile(resultPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ passed: report.passed, failure, summary, admitted_requests: report.admitted_requests, actual_usd: report.actual_usd }, null, 2));
  if (failure) process.exitCode = 1;
}

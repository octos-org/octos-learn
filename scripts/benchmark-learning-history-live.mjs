// Preparation is free. --execute / --serve-gateway fail before networking
// unless the reviewed plan records new human authorization and verified costs.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, sep, extname, basename } from 'node:path';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { TrialLedger, validateTrialPlan, createFirstSpeechGate, createModelBudgetGateway, sha256 } from './lib/learning-performance-control.mjs';
import { firstPlayableTarget } from './lib/learning-performance-target.mjs';
import { installLivePlayableProbe, readLivePlayable } from './lib/learning-playable-probe.mjs';

const [mode, planPath, output] = process.argv.slice(2);
assert.ok(['--check', '--execute', '--serve-gateway', '--fixture'].includes(mode) && planPath, 'Usage: node scripts/benchmark-learning-history-live.mjs --check|--execute|--serve-gateway|--fixture PLAN.json [PRIVATE_OUTPUT_DIRECTORY]');
const plan = validateTrialPlan(JSON.parse(await readFile(planPath, 'utf8')), { execute: ['--execute', '--serve-gateway'].includes(mode) });
if (mode === '--check') {
  const blockers = [];
  try { validateTrialPlan(plan, { execute: true }); } catch (error) { blockers.push(error.message); }
  console.log(JSON.stringify({ id: plan.id, mode: 'no-network-plan-check', ready_to_execute: !blockers.length,
    samples: plan.samples.length, maximum_courses: plan.limits.courses, maximum_speech_requests: plan.limits.speech_requests,
    maximum_model_requests_at_reserved_upper_cost: Math.floor(plan.limits.usd_micros / plan.limits.model_request_usd_micros), blockers }, null, 2));
} else {
  assert.ok(output?.startsWith('/'), 'Provide a protected absolute output directory');
  if (mode !== '--fixture') assert.equal(resolve(output), plan.output_directory, 'Output directory differs from the approved trial; do not reset its ledger');
  assert.equal(plan.origin, 'https://127.0.0.1:5173'); assert.equal(plan.backend, 'http://127.0.0.1:50080');
  const gateway = new URL(plan.gateway);
  assert.equal(gateway.protocol, 'http:'); assert.equal(gateway.hostname, '127.0.0.1');
  await mkdir(output, { recursive: true, mode: 0o700 });
  const ledgerPath = join(output, 'ledger.sqlite');
  if (mode === '--execute') assert.ok(existsSync(ledgerPath), 'Start and verify the budget gateway first, using this same output directory');
  const ledger = new TrialLedger(ledgerPath, plan);
  if (mode === '--serve-gateway') {
    const { server } = createModelBudgetGateway({ ledger, activeSample: () => ledger.activeSampleId(), upstreamFetch: fetch });
    server.listen(Number(gateway.port), gateway.hostname, () => console.log(JSON.stringify({ budget_gateway: plan.gateway, plan_sha256: sha256(JSON.stringify(plan)) })));
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { server.closeAllConnections(); server.close(() => ledger.close()); });
  } else {
    let browser, vite, fixture;
    if (mode === '--fixture') assert.equal(ledger.snapshot().samples.length, 0, 'Fixture ledger already exists; use a new directory');
    const reportPath = join(output, 'result.json');
    // Do not silently continue a previously submitted sample. Reopening the
    // ledger retains its reservations; diagnosis/recovery is a separate action.
    assert.equal(ledger.snapshot().samples.length, 0, 'This trial already submitted a sample; inspect existing ledger/results before any further invocation');
    const report = { plan_sha256: sha256(JSON.stringify(plan)), started_at: new Date().toISOString(), status: 'running', rows: [], normal_account: mode !== '--fixture', fees_incurred: 'not inferred from playback; conservative reservations retained in ledger' };
    await writeFile(reportPath, JSON.stringify(report), { flag: 'wx', mode: 0o600 });
    const save = () => writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flush: true });
    try {
      if (mode === '--fixture') {
        const { createLiveTrialFixture } = await import('./lib/learning-performance-fixture.mjs');
        fixture = await createLiveTrialFixture({ plan, ledger, directory: join(output, 'fixture'), scenario: plan.fixture_scenario });
      }
      const origin = fixture?.origin ?? plan.origin, backend = fixture?.origin ?? plan.backend, gatewayOrigin = fixture?.gateway ?? plan.gateway;
      report.fixture_only = mode === '--fixture';
      const check = await fetch(`${gatewayOrigin}/trial/status`, { signal: AbortSignal.timeout(5000) });
      assert.equal((await check.json()).policy_sha256, report.plan_sha256, 'Wrong budget gateway');
      const authClient = mode === '--fixture' ? (await import('playwright')).request : null;
      const fixtureClient = authClient && await authClient.newContext({ ignoreHTTPSErrors: true });
      const get = async (path, options) => fixtureClient ? fixtureClient.fetch(backend + path, options) : fetch(backend + path, options);
      const auth = await get('/api/auth/solo', { method: 'POST' }); assert.equal(typeof auth.status === 'function' ? auth.status() : auth.status, 200);
      const { token } = await auth.json();
      const headers = { Authorization: `Bearer ${token}` };
      const profileResponse = await get('/api/my/profile', { headers }); assert.equal(typeof profileResponse.status === 'function' ? profileResponse.status() : profileResponse.status, 200);
      const payload = await profileResponse.json(), profile = payload.profile?.profile ?? payload.profile ?? payload;
      assert.equal(profile.id, plan.owner); assert.equal(profile.config.llm.primary.model_id, plan.model);
      // Read-only metadata request. Never prepares/migrates or exports a Key.
      await fixtureClient?.dispose();
      const api = await browserRequestMetadata(origin, headers);
      assert.equal(api.services?.tts?.params?.voice, plan.voice); assert.equal(api.services?.tts?.params?.resource_id, plan.resource);
      if (!fixture) assert.equal(api.services?.tts?.revision, plan.voice_revision);
      const roots = {};
      for (const version of ['baseline', 'candidate']) {
        const build = plan.frontends[version], root = resolve(build.dist);
        const html = await readFile(join(root, 'index.html'), 'utf8');
        const entry = /<script[^>]+src="([^"]+)"/.exec(html)?.[1]; assert.ok(entry);
        assert.equal(sha256(await readFile(join(root, entry))), build.entry_sha256, 'Frontend candidate changed'); roots[version] = root;
      }
      vite = await createViteServer({ configFile: false, resolve: { alias: { '@': resolve('src') } }, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
      const { materializeOllLesson } = await vite.ssrLoadModule('/src/learning/oll/oll-materialization.ts');
      const { ollArtifactIdentity } = await vite.ssrLoadModule('/src/learning/oll/oll-artifacts.ts');
      browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
      for (const sample of plan.samples) {
        const row = { id: sample.id, version: sample.version, prompt_sha256: sha256(sample.prompt), state: 'preflight', actions: 0, turns: 0, speech_forwarded: 0, speech_blocked: 0 };
        const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
        const page = await context.newPage();
        let target, speechGate, sessionId, turnId, invalid = false;
        await context.grantPermissions(['local-network-access'], { origin });
        await context.addInitScript(({ token, owner }) => {
          localStorage.setItem('octos_session_token', token); localStorage.setItem('selected_profile', owner);
          localStorage.setItem(`octos-learn:setup-skipped:${owner}`, 'yes');
          localStorage.setItem('octos_learning_auto_camera', 'false'); localStorage.setItem('octos_learning_input_mode', 'text');
        }, { token, owner: plan.owner });
        await context.addInitScript(installLivePlayableProbe);
        // Gate the actual outgoing WebSocket frames, not a counter observing
        // them after transmission. Never forward an unexpected second action.
        await context.routeWebSocket(() => true, socket => {
          const url = new URL(socket.url());
          if (url.origin !== origin.replace('https:', 'wss:') || url.pathname !== '/api/ui-protocol/ws') { invalid = true; socket.close(); return; }
          const remote = socket.connectToServer();
          socket.onMessage(data => {
            try {
              const q = JSON.parse(String(data));
              if (q.method === 'turn/start') { row.turns++; throw Error('Ordinary turn blocked'); }
              if (q.method === 'skill/action/invoke') {
                assert.equal(row.state, 'reserved'); assert.equal(row.actions, 0);
                assert.equal(q.params.session_id, sessionId); assert.equal(q.params.action_id, 'learning.lesson.generate');
                assert.equal(q.params.arguments.learner_request, sample.prompt); turnId = q.params.arguments.turn_id; row.actions++;
              } else if (q.method) assert.ok(['session/open', 'session/hydrate', 'session/files.list', 'session/list', 'skill/action/list', 'skill/action/job/list', 'session/status.get', 'session/workspace.get', 'session/title.set', 'loop/list', 'session/goal/get', 'ping'].includes(q.method), 'Unexpected trial RPC');
              remote.send(data);
            } catch { invalid = true; socket.close(); }
          });
          remote.onMessage(data => socket.send(data));
        });
        await context.route('**/*', async route => {
          try {
            const request = route.request(), url = new URL(request.url());
            if (url.origin !== origin) return route.abort('blockedbyclient');
            // No synthetic study facts are written to personal memory. The
            // benchmark's unsent device queue disappears with this context.
            if (url.pathname.startsWith('/api/learn/history/')) return route.fulfill({ status: 503, json: {} });
            if (url.pathname === '/api/learn/byok/tts/relay') {
              try {
                assert.ok(speechGate);
                const response = await speechGate(request.postDataJSON()); row.speech_forwarded++;
                return route.fulfill({ response });
              } catch { row.speech_blocked++; return route.fulfill({ status: 503, json: {} }); }
            }
            if (url.pathname.startsWith('/api/learn/byok/') && request.method() !== 'GET' && url.pathname !== '/api/learn/byok/prepare') return route.abort('blockedbyclient');
            if (url.pathname.startsWith('/api/files') && request.method() === 'GET') {
              const path = url.searchParams.get('path') ?? decodeURIComponent(url.pathname.slice('/api/files/'.length));
              if (turnId && basename(path).startsWith(`${turnId}.`) && path.endsWith('.octos-lesson.json') && !target) {
                const response = await route.fetch(); assert.equal(response.status(), 200);
                const authoring = await response.json();
                target = firstPlayableTarget(authoring, { filename: basename(path), sessionId, materializeOllLesson, ollArtifactIdentity });
                await page.evaluate(t => { window.__livePlayableProbe.target = t; }, target);
                speechGate = createFirstSpeechGate(ledger, sample.id, target.narrationText, async body => {
                  const response = await context.request.post(`${origin}/api/learn/byok/tts/relay`, { headers, data: body, maxRetries: 0 });
                  assert.equal(response.status(), 200);
                  const payload = await response.json(); assert.equal(payload.status, 200);
                  const chunks = payload.body.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
                  assert.ok(chunks.every(x => x.code === 0 || x.code === 20000000), 'Speech provider reported a failure');
                  const audio = Buffer.concat(chunks.filter(x => x.data).map(x => Buffer.from(x.data, 'base64')));
                  assert.ok(audio.length); const audioSha = sha256(audio);
                  await page.evaluate(hash => { window.__livePlayableProbe.audioSha256 = hash; }, audioSha);
                  row.audio_sha256 = audioSha; return response;
                });
                return route.fulfill({ response });
              }
              return route.continue();
            }
            if (url.pathname.startsWith('/api/')) return route.continue();
            const root = roots[sample.version];
            const path = request.isNavigationRequest() ? join(root, 'index.html') : resolve(root, '.' + decodeURIComponent(url.pathname));
            assert.ok(path.startsWith(root + sep));
            const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json' };
            return route.fulfill({ body: await readFile(path), contentType: mime[extname(path)] ?? 'application/octet-stream' });
          } catch (error) { invalid = true; if (fixture) row.fixture_route_error = error.message; return route.abort('blockedbyclient').catch(() => undefined); }
        });
        try {
          await page.goto(`${origin}/board?new-board=1`);
          const input = page.getByRole('textbox', { name: '输入学习问题', exact: true }); await input.waitFor({ state: 'visible', timeout: 30000 });
          await page.waitForFunction(() => !document.querySelector('input[aria-label="输入学习问题"]')?.disabled);
          sessionId = await page.evaluate(owner => localStorage.getItem(`octos_learning_current_session_v2:${encodeURIComponent(owner)}`), plan.owner);
          assert.ok(sessionId); row.session_id = sessionId;
          await input.fill(sample.prompt); ledger.reserveSample(sample.id, sessionId); row.state = 'reserved'; report.rows.push(row); await save();
          await page.getByRole('button', { name: '发送问题', exact: true }).click();
          await page.waitForFunction(() => { const s = window.__livePlayableProbe; return s.audio && s.visual; }, null, { timeout: fixture ? 7000 : 180000 });
          Object.assign(row, await readLivePlayable(page)); row.state = 'first-playable'; await save();
          // Continue to await the actual persisted job's completion. Closing
          // this page alone would not stop model work or remove its cost.
          const final = await waitForJob(page, sessionId, turnId, plan.owner);
          row.job_status = final.status; row.models = final.models;
          assert.equal(final.status, 'succeeded'); assert.equal(row.actions, 1); assert.equal(row.turns, 0);
          assert.equal(row.speech_forwarded, 1); assert.equal(invalid, false);
          assert.ok(row.models.length && row.models.every(m => ['completed', 'failed'].includes(m.status)));
          row.model_http_reservations = ledger.snapshot().expenses.filter(e => e.sample_id === sample.id && e.kind === 'model').length;
          row.traced_model_http_attempts = row.models.reduce((sum, m) => sum + (Number.isSafeInteger(m.request_attempts) ? m.request_attempts : 0), 0);
          assert.ok(row.model_http_reservations > 0, 'No model requests passed the budget gateway');
          assert.equal(row.traced_model_http_attempts, row.model_http_reservations, 'Trace and budget-gateway request counts disagree');
          row.state = 'completed'; ledger.complete(sample.id, { jobsTerminal: true, measurementValid: true }); await save();
        } catch (error) {
          if (fixture) {
            row.fixture_error = error.message;
            row.fixture_browser = await page.evaluate(() => ({ text: document.body.innerText.slice(0, 1500), probe: window.__livePlayableProbe })).catch(() => null);
          }
          row.state = 'needs-inspection'; report.status = 'stopped'; await save();
          throw Error('Trial stopped; inspect protected results and ledger. No sample is automatically retried; its background generation may still be running.');
        } finally { await context.close(); }
      }
      if (fixture) report.fixture_metrics = fixture.metrics;
      report.status = 'completed'; report.completed_at = new Date().toISOString(); await save();
    } finally {
      if (fixture) { report.fixture_metrics = fixture.metrics; await save(); }
      await browser?.close(); await vite?.close(); await fixture?.close(); ledger.close();
    }
  }
}

// A separate browser request context accepts the local development certificate.
async function browserRequestMetadata(origin, headers) {
  const { request } = await import('playwright'); const client = await request.newContext({ ignoreHTTPSErrors: true, extraHTTPHeaders: headers });
  try { const response = await client.get(`${origin}/api/learn/byok`); assert.equal(response.status(), 200); return await response.json(); }
  finally { await client.dispose(); }
}

async function waitForJob(page, sessionId, turnId, owner) {
  // Read-only RPC through the app's existing WebSocket using a separate
  // narrowly scoped connection; no turn/action/delete request is sent.
  return page.evaluate(async ({ sessionId, turnId, owner }) => {
    const token = localStorage.getItem('octos_session_token');
    const url = new URL('/api/ui-protocol/ws', location.href); url.protocol = 'wss:'; url.searchParams.set('token', token);
    for (const f of ['skill.actions.v1', 'skill.action_jobs.v1', 'auxiliary.rest_to_ws.v1']) url.searchParams.append('ui_feature', f);
    const socket = new WebSocket(url); let sequence = 0;
    await new Promise((done, fail) => { socket.onopen = done; socket.onerror = () => fail(Error('Read-only job connection failed')); });
    const rpc = (method, params) => new Promise((done, fail) => {
      const id = `trial-read-${++sequence}`, timer = setTimeout(() => fail(Error('Job status timeout')), 10000);
      socket.onmessage = e => { const r = JSON.parse(e.data); if (r.id !== id) return; clearTimeout(timer); if (r.error) fail(Error('Job RPC failed')); else done(r.result); };
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, profile_id: owner } }));
    });
    try {
      const deadline = Date.now() + 300000;
      while (Date.now() < deadline) {
        const { jobs = [] } = await rpc('skill/action/job/list', { session_id: sessionId });
        const own = jobs.filter(j => j.action_id === 'learning.lesson.generate');
        if (own.length && own.every(j => !['queued', 'running'].includes(j.status))) {
          const { files = [] } = await rpc('session/files.list', { session_id: sessionId }); const models = [];
          for (const file of files.filter(f => f.filename.startsWith(turnId) && f.filename.endsWith('.generation-trace.jsonl'))) {
            const path = `/api/files?${new URLSearchParams({ path: file.path, session: sessionId })}`;
            const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw Error('Trace read failed');
            for (const line of (await response.text()).split('\n').filter(Boolean)) {
              const item = JSON.parse(line);
              if (item.stage === 'model-call' && ['completed', 'failed'].includes(item.status)) models.push({ status: item.status, model: item.model, label: item.label, request_attempts: item.request_attempts,
                lesson_plan_part: item.lesson_plan_part, lesson_plan_section: item.lesson_plan_section, prompt_tokens: item.prompt_tokens, candidate_tokens: item.candidate_tokens, thought_tokens: item.thought_tokens });
            }
          }
          return { status: own.every(j => j.status === 'succeeded') ? 'succeeded' : 'failed', models };
        }
        await new Promise(done => setTimeout(done, 1000));
      }
      throw Error('Generation remains in flight');
    } finally { socket.close(); }
  }, { sessionId, turnId, owner });
}

// Explicitly authorized, paid local course-generation comparison. Never run
// implicitly from unit tests. Tokens stay in memory; metrics omit user content.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const origin = "https://127.0.0.1:5173";
const backend = "http://127.0.0.1:50080";
const roots = { baseline: process.env.BASELINE_DIST, candidate: process.env.CANDIDATE_DIST };
const resultPath = process.env.GENERATION_BENCHMARK_RESULT;
if (!roots.baseline || !roots.candidate || !resultPath) throw new Error("Set BASELINE_DIST, CANDIDATE_DIST and GENERATION_BENCHMARK_RESULT");
const report = existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, "utf8")) : { limit: 6, reserved: 0, rows: [] };
assert.equal(report.limit, 6); assert.equal(report.reserved, report.rows.length);
report.frontend_artifacts = Object.fromEntries(Object.entries(roots).map(([name, directory]) => {
  const html = readFileSync(join(directory, 'index.html'), 'utf8');
  const entry = /<script[^>]+src="([^"]+)"/.exec(html)?.[1];
  if (!entry) throw new Error('Frontend entry module is missing');
  return [name, { entry, sha256: createHash('sha256').update(readFileSync(join(directory, entry))).digest('hex') }];
}));
const save = () => writeFileSync(resultPath, JSON.stringify(report, null, 2), { mode: 0o600, flush: true });
const login = await fetch(`${backend}/api/auth/solo`, { method: "POST" });
assert.equal(login.status, 200, "Existing solo owner required; this script never creates an account");
const { token } = await login.json();
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const profileResponse = await fetch(`${backend}/api/my/profile`, { headers });
assert.equal(profileResponse.status, 200);
const profilePayload = await profileResponse.json();
const profile = profilePayload.profile?.profile ?? profilePayload.profile ?? profilePayload;
assert.equal(typeof profile.id, "string");
report.model = { family: profile.config?.llm?.primary?.family_id, model: profile.config?.llm?.primary?.model_id };
report.scope = "Existing local account; normal HTTPS 5173 / candidate Octos 50080. First visible OLL course node after submit, not first audio. TTS supplier calls and learning-event uploads are blocked for benchmark sessions only; unsent local facts are discarded with the isolated browser context. Generated Octos sessions/artifacts are retained. No deletion API is called.";
const mime = { ".js": "application/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2", ".wasm": "application/wasm" };
async function inspectGeneration(sessionId) {
  const url = new URL(`${backend.replace('http:', 'ws:')}/api/ui-protocol/ws`);
  url.searchParams.set('token', token);
  for (const feature of ['skill.actions.v1', 'skill.action_jobs.v1', 'auxiliary.rest_to_ws.v1']) url.searchParams.append('ui_feature', feature);
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(new Error('Read-only generation status connection failed')); });
  let sequence = 0;
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = `benchmark-read-${++sequence}`;
    const timer = setTimeout(() => reject(new Error('Read-only generation status timed out')), 10000);
    socket.onmessage = message => {
      const response = JSON.parse(String(message.data));
      if (response.id !== id) return;
      clearTimeout(timer);
      if (response.error) reject(new Error(`Generation status RPC failed: ${response.error.code}`));
      else resolve(response.result);
    };
    socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  });
  try {
    const { jobs = [] } = await rpc('skill/action/job/list', { session_id: sessionId });
    if (!jobs.length || jobs.some(job => ['queued', 'running'].includes(job.status))) return null;
    const { files = [] } = await rpc('session/files.list', { session_id: sessionId });
    const models = [];
    for (const file of files.filter(file => file.filename.endsWith('.generation-trace.jsonl'))) {
      const query = new URLSearchParams({ path: file.path, session: sessionId });
      const response = await fetch(`${backend}/api/files?${query}`, { headers: { ...headers, 'X-Profile-Id': profile.id } });
      if (!response.ok) throw new Error(`Generation trace unavailable: ${response.status}`);
      for (const line of (await response.text()).split('\n').filter(Boolean)) {
        const item = JSON.parse(line);
        if (item.stage === 'model-call') models.push({ status: item.status, model: item.model, label: item.label,
          request_attempts: item.request_attempts, lesson_plan_part: item.lesson_plan_part,
          recorded_at_epoch_ms: item.recorded_at_epoch_ms, elapsed_ms: item.elapsed_ms });
      }
    }
    return { statuses: jobs.map(job => job.status), models };
  } finally { socket.close(); }
}

for (const row of report.rows.filter(row => row.state !== 'completed' && row.first_node_ms)) {
  const final = await inspectGeneration(row.session_id);
  if (!final || final.statuses.some(status => status !== 'succeeded')) throw new Error('Earlier paid sample still needs diagnosis; do not start another');
  row.collection_note = 'Initial collector waited for a legacy progress terminal; persisted job and trace confirm completion without repeating generation.';
  row.job_statuses = final.statuses; row.model_stages = final.models;
  row.provider_http_attempts = final.models.filter(item => ['completed', 'failed'].includes(item.status)).reduce((sum, item) => sum + (item.request_attempts ?? 0), 0);
  row.state = 'completed'; save();
}
const browser = await chromium.launch({ headless: true });
try {
  for (const version of ["baseline", "candidate", "candidate", "baseline", "baseline", "candidate"].slice(report.reserved)) {
    const root = resolve(roots[version]);
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } });
    await context.grantPermissions(['local-network-access'], { origin });
    const page = await context.newPage();
    const row = { version, index: report.reserved + 1, state: "preflight", action_invocations: 0, turn_starts: 0, protocol_errors: [], websocket_connections: 0 };
    let sessionId;
    await context.addInitScript(({ token, owner }) => {
      localStorage.setItem('octos_session_token', token); localStorage.setItem('selected_profile', owner);
      localStorage.setItem(`octos-learn:setup-skipped:${owner}`, 'yes');
      const state = { started: 0, first: 0 };
      window.__historyGenerationBenchmark = state;
      document.addEventListener('submit', () => { if (!state.started) state.started = performance.now(); }, true);
      new MutationObserver(() => {
        if (state.started && !state.first && document.querySelector('[data-testid="oll-lesson-board"] .board-node[data-id]')) state.first = performance.now();
      }).observe(document, { subtree: true, childList: true });
    }, { token, owner: profile.id });
    await page.route(url => url.origin === origin, async route => {
      const url = new URL(route.request().url());
      // This benchmark must not send synthetic study requests into long-term
      // memory or incur speech charges. All actual course actions remain real.
      if (url.pathname === '/api/learn/history/events' || url.pathname === '/api/learn/history/deliveries/claim' || url.pathname === '/api/learn/byok/tts/relay') return route.abort('blockedbyclient');
      if (url.pathname.startsWith('/api/')) return route.continue();
      const target = route.request().isNavigationRequest() ? join(root, 'index.html') : resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!target.startsWith(`${root}/`) || !existsSync(target) || !statSync(target).isFile()) return route.continue();
      await route.fulfill({ status: 200, body: readFileSync(target), contentType: mime[extname(target)] ?? 'application/octet-stream' });
    });
    page.on('pageerror', error => console.log(JSON.stringify({ stage: 'client-error', name: error.name, message: error.message.replace(/https?:\/\/\S+/g, '[url]').slice(0, 180) })));
    page.on('console', message => { if (message.type() === 'error' && /ui-protocol|Illegal invocation/.test(message.text())) console.log(JSON.stringify({ stage: 'client-console', message: message.text().replace(/(?:https?|wss?):\/\/\S+/g, '[url]').slice(0, 200) })); });
    page.on('websocket', socket => {
      row.websocket_connections++; console.log(JSON.stringify({ stage: 'application-websocket', version }));
      socket.on('framereceived', ({ payload }) => { try { const value = JSON.parse(String(payload)); if (value.error) row.protocol_errors.push({ code: value.error.code, message: String(value.error.message).slice(0, 120) }); } catch {} });
      socket.on('framesent', ({ payload }) => {
      try { const value = JSON.parse(String(payload));
        if (value.method === 'skill/action/invoke') row.action_invocations++;
        if (value.method === 'turn/start') row.turn_starts++;
      } catch { /* No credentials or full websocket frames are retained. */ }
      });
    });
    try {
      await page.goto(`${origin}/board?new-board=1`);
      const input = page.getByRole('textbox', { name: '输入学习问题', exact: true });
      await input.waitFor({ state: 'visible', timeout: 120000 });
      await page.waitForFunction(() => !document.querySelector('input[aria-label="输入学习问题"]')?.disabled, null, { timeout: 30000 });
      if (!row.websocket_connections) throw new Error('Application never created a protocol WebSocket; no paid action submitted');
      sessionId = await page.evaluate(owner => localStorage.getItem(`octos_learning_current_session_v2:${encodeURIComponent(owner)}`), profile.id);
      assert.ok(sessionId, "New board identifier must be known before a paid action");
      row.session_id = sessionId;
      await input.fill('请用一张简单的函数图，讲清楚 y=2x+1 中斜率 2 和截距 1 分别是什么意思。内容简短，给出完整的小课程。');
      // Reserve durably BEFORE the only submission. Interrupted attempts count
      // against the cap and cannot be silently repeated on a script rerun.
      if (report.reserved >= 6) throw new Error('Six-course budget exhausted');
      row.state = 'reserved'; report.rows.push(row); report.reserved++; save();
      console.log(JSON.stringify({ index: row.index, version, stage: 'submitting' }));
      await page.getByRole('button', { name: '发送问题', exact: true }).click();
      await page.waitForFunction(() => window.__historyGenerationBenchmark.first > 0, null, { timeout: 180000 });
      const first = await page.evaluate(() => { const s = window.__historyGenerationBenchmark; return { first_node_ms: s.first - s.started }; });
      row.first_node_ms = first.first_node_ms; row.state = 'first-fragment'; save();
      console.log(JSON.stringify({ index: row.index, version, first_node_ms: row.first_node_ms }));
      // Complete each paid action before the next sample so background model
      // work from one sample does not overlap the next sample.
      let final;
      const deadline = Date.now() + 240000;
      while (Date.now() < deadline && !final) {
        final = await inspectGeneration(sessionId);
        if (!final) await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (!final) throw new Error('Generation job did not finish within the collection deadline');
      row.job_statuses = final.statuses;
      row.model_stages = final.models;
      row.provider_http_attempts = final.models.filter(item => ['completed', 'failed'].includes(item.status)).reduce((sum, item) => sum + (item.request_attempts ?? 0), 0);
      if (final.statuses.some(status => status !== 'succeeded')) throw new Error('The authorized generation job failed');
      assert.equal(row.action_invocations, 1, 'One course action per authorized sample');
      assert.equal(row.turn_starts, 0, 'No additional ordinary model turn');
      assert.ok(final.models.length, 'Provider count requires the actual generation trace');
      row.state = 'completed'; save();
    } catch (error) {
      row.state = 'failed'; row.error = String(error.message).slice(0, 250);
      await page.screenshot({ path: '/private/tmp/octos-phase2-generation-preflight.png', fullPage: true }).catch(() => undefined);
      row.page_url = page.url();
      if (report.rows.includes(row)) save();
      console.log(JSON.stringify({ index: row.index, version, state: row.state, error: row.error, page_url: row.page_url, websocket_connections: row.websocket_connections, protocol_errors: row.protocol_errors }));
      // Preflight failures have not spent a paid generation; stop for diagnosis.
      throw error;
    } finally {
      // Keep all generated Octos sessions and artifacts. Closing this isolated
      // browser context discards its unsent benchmark-only device queue.
      await context.close();
    }
  }
} finally { await browser.close(); save(); }
console.log(JSON.stringify({ reserved: report.reserved, completed: report.rows.filter(row => row.state === 'completed').length, result: resultPath }));

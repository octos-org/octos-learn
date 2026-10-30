// Free transport fixture for the LIVE runner. Same browser routes, speech
// gate, ledger, job polling and target compiler as --execute; no real Octos,
// credentials, or supplier fetches. HTTPS + WS exercise the actual bridge.
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createByokHandler } from '../../services/byok/server.mjs';
import { createModelBudgetGateway } from './learning-performance-control.mjs';
const { WebSocketServer } = createRequire(import.meta.resolve('jsdom'))('ws');

export async function createLiveTrialFixture({ plan, ledger, directory, scenario = 'success', languageAware = false }) {
  const metrics = { model_supplier_calls: 0, speech_supplier_calls: 0, actions: 0 };
  const gateway = createModelBudgetGateway({ ledger, activeSample: () => ledger.activeSampleId(), upstreamFetch: async url => {
    assert.ok(url.startsWith('https://generativelanguage.googleapis.com/v1beta/'));
    metrics.model_supplier_calls++; return Response.json({ fixture: true });
  } });
  await new Promise(done => gateway.server.listen(0, '127.0.0.1', done));
  const gatewayUrl = `http://127.0.0.1:${gateway.server.address().port}`;
  const voice = { provider: 'volcano', params: { auth_mode: 'api-key', voice: plan.voice, resource_id: plan.resource } };
  const profile = { id: plan.owner, name: 'Fixture', config: { llm: { primary: { family_id: 'google', model_id: plan.model } }, env_vars: {
    GEMINI_API_KEY: 'synthetic-no-real-key', OCTOS_LEARN_TTS_API_KEY: 'synthetic-no-real-key', OCTOS_LEARN_TTS_PARAMS: JSON.stringify(voice),
  } } };
  const maskedProfile = { ...profile, config: { ...profile.config, env_vars: { GEMINI_API_KEY: '********' } } };
  await mkdir(join(directory, 'profiles'), { recursive: true });
  await writeFile(join(directory, 'profiles', `${plan.owner}.json`), JSON.stringify(profile), { mode: 0o600 });
  const wav = Buffer.alloc(48044); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(48000, 40);
  if (scenario !== 'silent-audio') for (let i = 0; i < 24000; i++) wav.writeInt16LE(Math.round(600 * Math.sin(2 * Math.PI * 440 * i / 24000)), 44 + 2 * i);
  const byok = createByokHandler({ registryRoot: directory, migrateLegacy: false,
    fetchImpl: async url => { assert.equal(new URL(url).pathname, '/api/my/profile'); return Response.json({ profile: maskedProfile }); },
    supplierFetch: async url => {
      assert.equal(url, 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'); metrics.speech_supplier_calls++;
      if (scenario === 'voice-failure') return new Response('{}', { status: 503 });
      return new Response(JSON.stringify({ code: 0, data: wav.toString('base64') }), { headers: { 'X-Api-Status-Code': '20000000' } });
    },
  });
  const sessions = new Map(), sockets = new Set(), pending = new Set();
  let origin;
  const file = s => `study/oll/${s.turn}.part-000.octos-lesson.json`;
  const lesson = {
    dsl: 'octos.lesson', version: '0.1', profile: 'authoring', lesson: { mode: 'explain', language: 'zh-CN', title: '完整前端执行器检查', goals: ['斜率'] },
    steps: [{ key: 'observe', purpose: '观察', beats: [
      { key: 'first', say: '这是第一段旁白。', actions: [{ do: 'write', as: 'first-card', kind: 'note', role: 'concept', content: { text: '第一段画面' }, place: { relation: 'new_region' } }] },
      { key: 'second', say: '这是第二段旁白，应该被拦截。', actions: [{ do: 'write', as: 'second-card', kind: 'note', role: 'concept', content: { text: '第二段画面' }, place: { relation: 'below', anchor: 'first-card' } }] },
    ] }], close: { summary: '结束', focus: ['first-card'] },
  };
  const courseFor = s => {
    if (!languageAware) return lesson;
    const course = structuredClone(lesson), en = s.language === 'en-US';
    course.lesson.language = s.language;
    course.lesson.title = en ? 'Slope and intercept' : '斜率与截距';
    course.lesson.goals = [en ? 'Understand y=2x+1' : '理解 y=2x+1'];
    course.steps[0].purpose = en ? 'Observe' : '观察';
    course.steps[0].beats[0].say = en ? 'The slope is two.' : '斜率是二。';
    course.steps[0].beats[1].say = en ? 'This next sentence must be blocked.' : '这一句应该被拦截。';
    course.steps[0].beats[0].actions[0].content.text = 'y=2x+1';
    course.steps[0].beats[1].actions[0].content.text = en ? 'Intercept' : '截距';
    course.close.summary = en ? 'Finished' : '结束';
    return course;
  };
  const traces = () => [0, 1].map(i => ({ stage: 'model-call', status: 'completed', model: plan.model, label: i ? 'lesson-plan-section' : 'lesson-plan-bootstrap', lesson_plan_part: i ? 'section' : 'bootstrap', request_attempts: 1 }));
  const files = s => s?.ready ? [
    { filename: file(s).split('/').at(-1), path: file(s), size_bytes: 100, modified_at: '2026-10-21T00:00:00Z' },
    { filename: `${s.turn}.generation-trace.jsonl`, path: `study/oll/${s.turn}.generation-trace.jsonl`, size_bytes: 100, modified_at: '2026-10-21T00:00:00Z' },
  ] : [];
  const job = s => ({ job_id: s.job, batch_id: s.job, profile_id: plan.owner, session_id: s.id, action_id: 'learning.lesson.generate', skill_id: 'learning-coach', status: s.status,
    created_at: '2026-10-21T00:00:00Z', updated_at: '2026-10-21T00:00:01Z', ...(s.status === 'succeeded' ? { result: { success: true, output: '完成' } } : {}) });
  const notify = (method, params) => { for (const socket of sockets) if (socket.readyState === 1) socket.send(JSON.stringify({ jsonrpc: '2.0', method, params })); };
  const model = () => fetch(`${gatewayUrl}/v1beta/models/${plan.model}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': 'synthetic-never-exported' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Fixture-only model request' }] }], generationConfig: { maxOutputTokens: 32768 } }) });
  const generate = async s => {
    assert.equal((await model()).status, 200); s.ready = true;
    notify('tool/progress', { session_id: s.id, turn_id: s.turn, tool_call_id: 'oll_generate_lesson', message: `[artifact:oll_lesson_part] part=0 (${file(s)})` });
    // While browser playback finishes the first beat, fake model work remains
    // in progress; the runner must await this before allowing the next course.
    await new Promise(done => setTimeout(done, 1800));
    assert.equal((await model()).status, 200); s.status = 'succeeded'; notify('skill/action/job/updated', job(s));
  };
  const server = createServer({ cert: await readFile('.cert/octos-learn.pem'), key: await readFile('.cert/octos-learn-key.pem') }, (req, res) => {
    const handle = async () => {
      const url = new URL(req.url, origin);
      if (await byok(req, res)) return;
      const json = value => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
      if (url.pathname === '/api/auth/solo') return json({ token: 'synthetic-live-trial-token' });
      if (url.pathname === '/api/auth/status') return json({ bootstrap_mode: false, email_login_enabled: true });
      if (url.pathname === '/api/auth/me') return json({ user: { id: plan.owner, name: 'Fixture', email: 'fixture@example.test' }, portal: { home_profile_id: plan.owner, accessible_profiles: [{ id: plan.owner, name: 'Fixture' }], can_access_admin_portal: false } });
      if (url.pathname === '/api/my/profile') return json(maskedProfile);
      if (url.pathname === '/api/learn/course-packs') return json({ collections: [], packs: [] });
      if (url.pathname.startsWith('/api/files')) {
        const path = url.searchParams.get('path') ?? decodeURIComponent(url.pathname.slice('/api/files/'.length));
        const s = [...sessions.values()].find(s => s.turn && path.includes(s.turn));
        assert.ok(s?.ready);
        if (path.endsWith('.generation-trace.jsonl')) { res.writeHead(200); res.end(traces(s).map(x => JSON.stringify(x)).join('\n')); return; }
        return json(courseFor(s));
      }
      res.writeHead(503, { 'content-type': 'application/json' }); res.end('{}');
    };
    void handle().catch(() => { res.writeHead(500); res.end('{}'); });
  });
  const wss = new WebSocketServer({ server });
  wss.on('connection', socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.on('message', data => {
      const q = JSON.parse(String(data)), p = q.params ?? {}; let result = {};
      if (!q.id) return;
      switch (q.method) {
        case 'session/open': result = { opened: { session_id: p.session_id, active_profile_id: plan.owner, capabilities: { supported_features: ['projection.envelope.v2', 'skill.actions.v1', 'skill.action_jobs.v1', 'state.session_hydrate.v1'] } } }; break;
        case 'session/hydrate': result = { session_id: p.session_id, cursor: { stream: 'fixture', seq: 0 }, messages: [], envelopes: [] }; break;
        case 'session/files.list': result = { files: files(sessions.get(p.session_id)) }; break;
        case 'session/list': result = { sessions: [] }; break;
        case 'loop/list': result = { loops: [] }; break;
        case 'session/goal/get': result = { goal: null }; break;
        case 'session/title.set': result = { ok: true }; break;
        case 'skill/action/list': result = { actions: languageAware ? [{ id: 'learning.lesson.generate', skill_id: 'learning-coach', available: true, surfaces: ['learning.composer'], tags: [], label: 'Generate lesson', execution: 'background', input_schema: { type: 'object', properties: { turn_id: {}, learner_request: {}, request_source: {}, language: {}, input_modality: {}, client_timing: {}, teacher_profile: {} } } }] : [] }; break;
        case 'skill/action/job/list': result = { jobs: sessions.has(p.session_id) ? [job(sessions.get(p.session_id))] : [] }; break;
        case 'skill/action/invoke': {
          metrics.actions++;
          const s = { language: p.arguments.language, id: p.session_id, job: `fixture-${metrics.actions}`, turn: p.arguments.turn_id, status: 'running', ready: false };
          sessions.set(s.id, s); result = { ok: true, action_id: p.action_id, queued: 1, jobs: [job(s)] };
          const work = new Promise(done => setTimeout(done, 100)).then(() => generate(s)).catch(() => { s.status = 'failed'; notify('skill/action/job/updated', job(s)); });
          pending.add(work); void work.finally(() => pending.delete(work));
          break;
        }
        default: result = {};
      }
      socket.send(JSON.stringify({ jsonrpc: '2.0', id: q.id, result }));
    });
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done)); origin = `https://127.0.0.1:${server.address().port}`;
  return { origin, gateway: gatewayUrl, metrics, async close() {
    for (const socket of sockets) socket.terminate(); await Promise.allSettled([...pending]);
    await new Promise(done => wss.close(done)); server.closeAllConnections(); await new Promise(done => server.close(done));
    gateway.server.closeAllConnections(); await new Promise(done => gateway.server.close(done));
  } };
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TopicTrialLedger, validateTopicTrial, checkTopicModelRequest, createTopicTrialGateway } from './lib/learning-topic-trial-control.mjs';
import { stageTopicCase, inspectTopicCandidate, retainTopicTrialOutput } from './lib/learning-topic-trial-cases.mjs';
import { listenLocal, closeLocal } from './lib/learning-topic-trial-fixture.mjs';
import { HistoryStore } from '../services/learning-history/store.mjs';
import { buildAnalysisInput } from '../services/learning-history/topic-analysis.mjs';
import { buildTopicAnalysisPrompt } from '../services/learning-history/topic-analysis-instructions.mjs';

const plan = { ...JSON.parse(await readFile('docs/personalized-teachers-phase2/TOPIC_ACCURACY_TRIAL.json')),
  status: 'prepared-not-approved', authorization_reference: '' };
const casesBytes = await readFile('docs/personalized-teachers-phase2/TOPIC_ACCURACY_CASES.json');
const cases = validateTopicTrial(plan, casesBytes);
function inputFor(sample = cases[0]) {
  const store = new HistoryStore(':memory:');
  try { stageTopicCase(store, 'alan0x', sample); return buildAnalysisInput(store, 'alan0x', sample.id); } finally { store.close(); }
}
function bodyFor(input = inputFor()) {
  return { contents: [{ role: 'user', parts: [{ text: `[from the app: Learning topic analysis] ${buildTopicAnalysisPrompt(input)}` }] }],
    generation_config: { max_output_tokens: 32768, thinkingConfig: { thinkingBudget: 1024 } },
    tools: [{ function_declarations: [{ name: 'learning_topics_search', description: 'Pinned definitions', parameters: { type: 'object' } }] }] };
}

test('paid execution refuses missing authorization, changed samples and expired price before networking', () => {
  assert.throws(() => validateTopicTrial(plan, casesBytes, { execute: true }), /not authorized/);
  const approved = { ...plan, status: 'approved', authorization_reference: 'synthetic-test-only' };
  assert.equal(validateTopicTrial(approved, casesBytes, { execute: true, now: new Date(`${plan.pricing.verified_at}T00:00:00Z`) }).length, 9);
  assert.throws(() => validateTopicTrial(approved, Buffer.from('changed')));
  assert.throws(() => validateTopicTrial({ ...approved, pricing: { ...plan.pricing, verified_at: '2027-01-01' } }, casesBytes, { execute: true, now: new Date('2027-01-01') }), /expired/);
});

test('a fresh first-source diagnosis has its own one-source, three-request, USD3.30 policy', () => {
  const single = { ...plan, scope: 'first-source-diagnosis',
    limits: { ...plan.limits, tasks: 1, model_http_requests: 3, usd_micros: 3300000 } };
  assert.deepEqual(validateTopicTrial(single, casesBytes).map(sample => sample.id), ['q-direction']);
  assert.throws(() => validateTopicTrial({ ...single, limits: plan.limits }, casesBytes));
  assert.throws(() => validateTopicTrial({ ...single, scope: 'arbitrary-input' }, casesBytes));
  assert.throws(() => validateTopicTrial(single, casesBytes, { execute: true }), /not authorized/);
  const ledger = new TopicTrialLedger(':memory:', single), input = inputFor();
  try {
    ledger.start('q-direction', input.input_sha256);
    for (let i = 0; i < 3; i++) ledger.reserve(input.input_sha256);
    assert.throws(() => ledger.reserve(input.input_sha256), /budget exhausted/);
    ledger.finish('q-direction');
    assert.throws(() => ledger.start('another-source', 'd'.repeat(64)), /Task limit reached/);
  } finally { ledger.close(); }
});

test('all nine fixed sources stage through the actual contracts; expected answers never reach model inputs', () => {
  const store = new HistoryStore(':memory:');
  try {
    for (const sample of cases) {
      stageTopicCase(store, 'alan0x', sample);
      const input = buildAnalysisInput(store, 'alan0x', sample.id);
      assert.ok(!JSON.stringify(input).includes('acceptable_topics'));
      if (sample.id === 'q-image') assert.equal(input.units[0].missing_media, true);
    }
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM topic_analysis_jobs').get().n, 9);
    assert.equal(store.db.prepare("SELECT COUNT(DISTINCT run_id) n FROM events WHERE event_id LIKE 'course-version-%'").get().n, 1);
    const reviewed = inspectTopicCandidate(cases[3], { units: [{ unit_id: 'question', status: 'unknown', topics: [] }] });
    assert.equal(reviewed.semantic_pass, null); assert.equal(reviewed.human_review_required, true);
  } finally { store.close(); }
});

test('failed terminal output remains reviewable before purge, without RPC tokens, profile config or reasoning fields', () => {
  const row = { id: 'one' };
  assert.equal(retainTopicTrialOutput(row, 'host#peer-topics-one', { turns: [{ turn_id: 'turn', state: 'active' }] }), false);
  assert.equal(retainTopicTrialOutput(row, 'ordinary-classroom', { turns: [{ turn_id: 'turn', state: 'completed' }] }), false);
  assert.equal(retainTopicTrialOutput(row, 'host#peer-topics-one', { host_token: 'never-retain', config: { api_key: 'never-retain' },
    turns: [{ turn_id: 'turn', state: 'completed', host_token: 'never-retain' }],
    messages: [{ role: 'assistant', content: 'Invalid JSON answer', reasoning_content: 'never-retain', turn_id: 'turn' }] }), true);
  assert.equal(row.octos_observation.messages[0].content, 'Invalid JSON answer');
  assert.ok(!JSON.stringify(row).includes('never-retain'));
});

test('material alone cannot pass the gateway when the analysis instructions are absent', () => {
  const input = inputFor(), body = bodyFor(input);
  body.contents[0].parts[0].text = `[from the app: Learning topic analysis] ${JSON.stringify(input)}`;
  assert.throws(() => checkTopicModelRequest(body, plan), /instructions missing/);
});

test('Gemini catalog tool history is accepted, while unpriced tools, media, aliases and changed material are refused', () => {
  const input = inputFor(), body = bodyFor(input);
  body.contents.push({ role: 'model', parts: [{ functionCall: { name: 'learning_topics_search', args: { query: 'slope' } }, thoughtSignature: 'synthetic' }] },
    { role: 'user', parts: [{ functionResponse: { name: 'learning_topics_search', response: { topics: [] } } }] });
  assert.equal(checkTopicModelRequest(body, plan), input.input_sha256);
  for (const change of [
    value => { value.tools = [{ googleSearch: {} }]; },
    value => { value.contents[0].parts.push({ inlineData: { mimeType: 'image/png', data: 'fake' } }); },
    value => { value.cachedContent = 'billable-cache'; },
    value => { value.generationConfig = value.generation_config; },
    value => { value.generation_config.max_output_tokens = 65536; },
    value => { value.contents[0].parts[0].text = value.contents[0].parts[0].text.replace('为什么', '凭空改写'); },
    value => { value.tools[0].function_declarations[0].name = 'shell'; },
  ]) { const bad = structuredClone(body); change(bad); assert.throws(() => checkTopicModelRequest(bad, plan)); }
});

test('per-task and global request reservations survive restart and never refund failure or reset changed policy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'topic-budget-')), path = join(root, 'budget.sqlite');
  let ledger = new TopicTrialLedger(path, plan);
  try {
    ledger.start('first', 'a'.repeat(64));
    for (let i = 0; i < 3; i++) ledger.reserve('a'.repeat(64));
    assert.throws(() => ledger.reserve('a'.repeat(64)), /Task request cap/);
    ledger.close(); ledger = new TopicTrialLedger(path, plan);
    assert.equal(ledger.snapshot().requests.length, 3);
    assert.throws(() => ledger.start('second', 'b'.repeat(64)), /unfinished/);
    ledger.finish('first');
    for (let i = 1; i < 6; i++) { const hash = String(i).repeat(64); ledger.start(`source-${i}`, hash); for (let n = 0; n < 3; n++) ledger.reserve(hash); ledger.finish(`source-${i}`); }
    ledger.start('last', 'f'.repeat(64)); assert.throws(() => ledger.reserve('f'.repeat(64)), /budget exhausted/);
    assert.equal(ledger.snapshot().requests.reduce((sum, row) => sum + row.usd, 0), 19800000);
    assert.throws(() => new TopicTrialLedger(path, { ...plan, id: 'new-policy' }), /policy changed/);
  } finally { ledger.close(); await rm(root, { recursive: true, force: true }); }
});

test('actual forwarding pins endpoint, strips account auth, preserves reservations on supplier failure and blocks non-analysis traffic', async () => {
  const ledger = new TopicTrialLedger(':memory:', plan), input = inputFor(); ledger.start('one', input.input_sha256);
  let calls = 0;
  const gateway = createTopicTrialGateway({ ledger, upstreamFetch: async (url, options) => {
    calls++; assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    assert.equal(options.redirect, 'error'); assert.equal(options.headers.authorization, undefined); assert.equal(options.headers.cookie, undefined);
    assert.equal(ledger.snapshot().requests.length, calls, 'Reservation must precede network send');
    throw Error('Synthetic upstream timeout including a synthetic key that must never be logged');
  } });
  const base = await listenLocal(gateway.server);
  try {
    const request = body => fetch(`${base}/v1beta/models/gemini-3.8-flash:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': 'synthetic-key', authorization: 'Bearer never-forward', cookie: 'never-forward' }, body: JSON.stringify(body) });
    const unrelated = bodyFor(); unrelated.contents[0].parts[0].text = 'ordinary classroom question';
    assert.equal((await request(unrelated)).status, 402); assert.equal(calls, 0);
    const response = await request(bodyFor(input)); assert.equal(response.status, 402); assert.ok(!(await response.text()).includes('synthetic-key'));
    assert.equal(calls, 1); assert.equal(ledger.snapshot().requests.length, 1);
    await request(bodyFor(input)); await request(bodyFor(input));
    assert.equal((await request(bodyFor(input))).status, 402); assert.equal(calls, 3);
  } finally { await closeLocal(gateway.server); ledger.close(); }
});

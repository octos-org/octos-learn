import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TrialLedger, createFirstSpeechGate, createModelBudgetGateway, validateTrialPlan } from './lib/learning-performance-control.mjs';

export const fixturePlan = () => ({ schema: 'octos.learn.performance-trial.v1', id: 'fixture', status: 'draft',
  cost_basis_verified: false, route_verified: false, output_directory: '/private/tmp/non-executing-unit-fixture', model: 'gemini-3.6-flash', voice: 'fixture-voice', resource: 'fixture-resource',
  limits: { courses: 2, speech_requests: 2, usd_micros: 250, cny_micros: 1000, model_request_usd_micros: 100, speech_byte_cny_micros: 1, speech_utf8_bytes: 30, output_tokens: 32768, request_bytes: 65536 },
  samples: [{ id: 'one', version: 'baseline', prompt: '合成问题' }, { id: 'two', version: 'candidate', prompt: '合成问题' }],
});

test('draft and unverified route/cost cannot authorize a paid trial', () => {
  const p = fixturePlan(); assert.throws(() => validateTrialPlan(p, { execute: true }), /not authorized/);
  p.status = 'approved'; assert.throws(() => validateTrialPlan(p, { execute: true }), /Cost bounds/);
  p.cost_basis_verified = true; assert.throws(() => validateTrialPlan(p, { execute: true }), /gateway/);
  p.route_verified = true; assert.throws(() => validateTrialPlan(p, { execute: true }), /Human authorization/);
  p.authorization_reference = 'synthetic test approval, not human authorization'; validateTrialPlan(p, { execute: true });
});

test('reservations survive reopening, cannot be resubmitted or refunded after interruption', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trial-ledger-'));
  const path = join(dir, 'ledger.sqlite'), plan = fixturePlan();
  let ledger = new TrialLedger(path, plan);
  try {
    ledger.reserveSample('one', 'learn-fixture-one'); ledger.reserveModel('one'); ledger.reserveSpeech('one', '第一句');
    ledger.close(); ledger = new TrialLedger(path, plan);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal(ledger.snapshot().expenses.length, 2);
    assert.throws(() => ledger.reserveSample('one', 'learn-fixture-one'), /unfinished/);
    assert.throws(() => ledger.reserveSample('two', 'learn-fixture-two'), /unfinished/);
    assert.throws(() => ledger.complete('one', { jobsTerminal: false, measurementValid: true }), /generation stopped/);
    assert.throws(() => ledger.complete('one', { jobsTerminal: true, measurementValid: false }), /failed measurement/);
    assert.throws(() => ledger.reserveSpeech('one', '第一句'), /one speech/);
    assert.throws(() => new TrialLedger(path, { ...plan, limits: { ...plan.limits, usd_micros: 1000 } }), /Plan changed/);
    ledger.complete('one', { jobsTerminal: true, measurementValid: true });
    assert.throws(() => ledger.reserveSample('one', 'another-id'), /order/);
    ledger.reserveSample('two', 'learn-fixture-two'); ledger.reserveModel('two');
    assert.throws(() => ledger.reserveModel('two'), /cost limit/);
    assert.equal(ledger.snapshot().expenses.filter(r => r.kind === 'model').length, 2);
  } finally { ledger.close(); await rm(dir, { recursive: true }); }
});

const speechBody = text => ({ provider: 'volcano', params: { voice: 'fixture-voice', resource_id: 'fixture-resource' }, payload: { req_params: { text, speaker: 'fixture-voice', audio_params: { format: 'mp3', sample_rate: 24000 } } } });
test('only the actual first narration is admitted, including simultaneous prefetches and lost receipts', async () => {
  const ledger = new TrialLedger(':memory:', fixturePlan()); ledger.reserveSample('one', 'learn-fixture-one');
  let sent = 0;
  try {
    const gate = createFirstSpeechGate(ledger, 'one', '第一句', async () => { sent++; await Promise.resolve(); throw Error('lost receipt'); });
    await assert.rejects(gate(speechBody('第二句')), /first narrated/); assert.equal(sent, 0);
    const results = await Promise.allSettled([gate(speechBody('第一句')), gate(speechBody('第一句')), gate(speechBody('第二句'))]);
    assert.ok(results.every(r => r.status === 'rejected')); assert.equal(sent, 1);
    assert.equal(ledger.snapshot().expenses.length, 1);
    const reopenedGate = createFirstSpeechGate(ledger, 'one', '第一句', async () => { sent++; });
    await assert.rejects(reopenedGate(speechBody('第一句')), /one speech/); assert.equal(sent, 1);
  } finally { ledger.close(); }
});

test('speech text and voice limits are checked before transmission', async () => {
  const ledger = new TrialLedger(':memory:', fixturePlan()); ledger.reserveSample('one', 'learn-fixture-one'); let calls = 0;
  try {
    const gate = createFirstSpeechGate(ledger, 'one', '字'.repeat(11), async () => { calls++; });
    await assert.rejects(gate(speechBody('字'.repeat(11))), /reviewed limit/);
    const other = speechBody('字'.repeat(11)); other.params.voice = 'other'; await assert.rejects(gate(other));
    const padded = speechBody('字'.repeat(11) + ' '); await assert.rejects(gate(padded), /exact first/);
    const otherSpeaker = speechBody('字'.repeat(11)); otherSpeaker.payload.req_params.speaker = 'other'; await assert.rejects(gate(otherSpeaker), /voice/);
    const otherCredential = speechBody('字'.repeat(11)); otherCredential.key = 'synthetic-other-key'; await assert.rejects(gate(otherCredential), /saved account/);
    const extra = speechBody('字'.repeat(11)); extra.payload.req_params.additions = '{}'; await assert.rejects(gate(extra), /synthesis option/);
    assert.equal(calls, 0); assert.equal(ledger.snapshot().expenses.length, 0);
  } finally { ledger.close(); }
});

async function modelFixture(run, reply = async () => new Response('{"ok":true}')) {
  const ledger = new TrialLedger(':memory:', fixturePlan()); ledger.reserveSample('one', 'learn-fixture-one');
  const calls = [];
  const gate = createModelBudgetGateway({ ledger, activeSample: () => 'one', upstreamFetch: async (url, init) => { calls.push({ url, init }); return reply(url, init); } });
  await new Promise(done => gate.server.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${gate.server.address().port}/v1beta/models/gemini-3.6-flash:generateContent`;
  const body = { contents: [{ role: 'user', parts: [{ text: 'synthetic question' }] }], generationConfig: { maxOutputTokens: 32768, temperature: 0 } };
  const call = (data = body, target = url) => fetch(target, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': 'synthetic-not-a-real-key', Authorization: 'Bearer should-not-forward' }, body: JSON.stringify(data) });
  try { await run({ ledger, calls, gate, call, body, url }); }
  finally { gate.server.closeAllConnections(); await new Promise(done => gate.server.close(done)); ledger.close(); }
}

test('simultaneous requests reserve cost before send; the request that exceeds the cap never leaves', async () => {
  await modelFixture(async ({ call, calls, ledger, gate }) => {
    const responses = await Promise.all([call(), call(), call()]);
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 200, 402]);
    assert.equal(calls.length, 2); assert.equal(gate.metrics.admitted, 2);
    assert.equal(ledger.snapshot().expenses.reduce((n, r) => n + r.usd, 0), 200);
    assert.equal(calls[0].init.headers.Authorization, undefined);
    assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');
    assert.equal(calls[0].init.redirect, 'error');
  });
});

test('failed supplier responses still consume reservations, including retries', async () => {
  await modelFixture(async ({ call, calls, ledger }) => {
    assert.equal((await call()).status, 503); assert.equal((await call()).status, 503); assert.equal((await call()).status, 402);
    assert.equal(calls.length, 2); assert.equal(ledger.snapshot().expenses.length, 2);
  }, async () => new Response('{}', { status: 503 }));
});

test('unknown model, extra billing features, multimedia and excessive output are rejected before send', async () => {
  await modelFixture(async ({ call, calls, body, url, ledger }) => {
    for (const data of [{ ...body, tools: [{}] }, { ...body, generationConfig: { maxOutputTokens: 32769 } },
      { ...body, contents: [{ parts: [{ inlineData: { data: 'fake' } }] }] }]) assert.equal((await call(data)).status, 402);
    assert.equal((await call(body, url.replace('gemini-3.6-flash', 'unknown'))).status, 402);
    assert.equal((await call(body, url + '?key=do-not-accept-query-key')).status, 402);
    assert.equal(calls.length, 0); assert.equal(ledger.snapshot().expenses.length, 0);
  });
});

test('streaming response bytes are forwarded without waiting for the stream to finish', async () => {
  let finish;
  await modelFixture(async ({ call, body, url }) => {
    const response = await call(body, url.replace(':generateContent', ':streamGenerateContent?alt=sse'));
    const reader = response.body.getReader(); assert.equal(new TextDecoder().decode((await reader.read()).value), 'data: first\n\n');
    finish(); assert.equal(new TextDecoder().decode((await reader.read()).value), 'data: last\n\n'); assert.equal((await reader.read()).done, true);
  }, async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('data: first\n\n'));
    finish = () => { controller.enqueue(new TextEncoder().encode('data: last\n\n')); controller.close(); };
  } }), { headers: { 'content-type': 'text/event-stream' } }));
});

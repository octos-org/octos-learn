// --check is offline. --fixture uses real isolated Octos plus a synthetic
// Gemini replacement. --execute requires an explicitly approved policy and
// pre-routed normal Octos; it never exports/copies supplier credentials.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { HistoryStore } from '../services/learning-history/store.mjs';
import { createHistoryHandler } from '../services/learning-history/server.mjs';
import { buildAnalysisInput } from '../services/learning-history/topic-analysis.mjs';
import { digest, validateTopicTrial, TopicTrialLedger, createTopicTrialGateway } from './lib/learning-topic-trial-control.mjs';
import { stageTopicCase, inspectTopicCandidate, requireAllStagedJobs, stageObservedTrialPlayback } from './lib/learning-topic-trial-cases.mjs';
import { queryTopic } from '../services/learning-history/topic-query.mjs';
import { topicOctosFixture, listenLocal, closeLocal } from './lib/learning-topic-trial-fixture.mjs';
import { loginExistingTrialOwner } from './lib/learning-performance-auth.mjs';

const [mode, planFile, output, binary] = process.argv.slice(2);
assert.ok(['--check', '--fixture', '--execute'].includes(mode) && planFile, 'Supply --check|--fixture|--execute PLAN.json [PRIVATE_OUTPUT] [ABSOLUTE_OCTOS_BINARY]');
const planBytes = await readFile(planFile), plan = JSON.parse(planBytes);
const casesBytes = await readFile('docs/personalized-teachers-phase2/TOPIC_ACCURACY_CASES.json');
const samples = validateTopicTrial(plan, casesBytes, { execute: mode === '--execute' });
assert.ok(plan.code_sha256 && Object.keys(plan.code_sha256).length >= 7, 'Trial source fingerprints missing');
for (const [path, expected] of Object.entries(plan.code_sha256)) {
  assert.ok(/^(src\/learning\/history|src\/runtime|services\/learning-history|scripts)\/[A-Za-z0-9_./-]+$/.test(path) && !path.includes('..'), 'Invalid pinned source path');
  assert.equal(digest(await readFile(path)), expected, 'Trial source changed; revalidate before execution');
}
if (mode === '--check') {
  console.log(JSON.stringify({ ready_for_paid_execution: plan.status === 'approved', tasks: samples.length,
    max_actual_model_http_requests_including_retries: plan.limits.model_http_requests, max_reserved_usd: plan.limits.usd_micros / 1e6,
    approval_required: true, supplier_calls: 0, plan_sha256: digest(planBytes) }));
} else {
  assert.ok(output?.startsWith('/'), 'Provide a new protected output directory');
  if (mode === '--execute') {
    assert.equal(resolve(output), plan.output_directory);
    assert.equal(digest(await readFile(plan.octos.binary)), plan.octos.sha256, 'Reviewed Octos binary changed; recheck profile bootstrap and billing paths');
  }
  else assert.ok(binary?.startsWith('/'), 'Fixture requires an absolute local Octos binary');
  // No fresh directory or changed policy is used to refill an existing trial.
  await mkdir(output, { recursive: false, mode: 0o700 });
  const ledger = new TopicTrialLedger(join(output, 'budget.sqlite'), plan);
  let fixture, vite, product, gateway, activeInput, activeSample, originalHttp = 0, history;
  const report = { plan_sha256: digest(planBytes), mode, supplier_calls: mode === '--fixture' ? 0 : null,
    rows: [], semantic_quality: 'requires independent human review', state: 'preflight' };
  const save = () => writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flush: true });
  try {
    const upstreamFetch = mode === '--execute' ? fetch : async (_url, options) => {
      originalHttp++;
      const body = JSON.parse(options.body);
      const hasTool = body.contents.some(content => content.parts.some(part => part.functionResponse));
      const parts = hasTool ? [{ text: JSON.stringify({ schema: 1, input_sha256: activeInput.input_sha256,
        units: activeInput.units.map(unit => { const expected = activeSample.expectations[unit.unit_id]; return { unit_id: unit.unit_id, status: expected.status,
          topics: expected.status === 'mapped' ? [{ topic_id: expected.acceptable_topics[0], quote: unit.content.slice(0, Math.min(24, unit.content.length)) }] : [], reason: 'Fixture only; expectations never reach a real model' }; }) }) }]
        : [{ functionCall: { name: 'learning_topics_search', args: { query: 'linear gradient intercept triangle angle sum', limit: 12 } } }];
      return new Response(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts }, finishReason: hasTool ? 'STOP' : 'STOP' }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 20, totalTokenCount: 40 } })}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    };
    gateway = createTopicTrialGateway({ ledger, upstreamFetch });
    const gatewayBase = await listenLocal(gateway.server, mode === '--execute' ? Number(new URL(plan.gateway).port) : 0);
    if (mode === '--fixture') fixture = await topicOctosFixture({ binary, root: output, gateway: gatewayBase, plan });
    const backend = fixture?.base ?? plan.backend;
    const { token, profile } = await loginExistingTrialOwner({ owner: plan.owner, registryRoot: fixture ? undefined : join(homedir(), '.octos'), request: (path, options) => fetch(backend + path, options) });
    assert.equal(profile.config.llm.primary.model_id, plan.model);
    const route = profile.config.llm.primary.route;
    assert.equal(route?.api_type, 'gemini'); assert.equal(route?.base_url, `${gatewayBase}/v1beta`);
    assert.equal(profile.config.llm.fallbacks?.length ?? 0, 0, 'Fallback routing could bypass this trial');
    // The reviewed Octos profile bootstrap hard-codes embedding:None, which
    // resolves only to bundled local embedding or keyword-only mode. The
    // profile API does not expose effective embeddings today; this additional
    // check is merely conservative for a future API, not runtime attestation.
    if (!fixture) assert.ok(!profile.config.embedding || profile.config.embedding.provider === 'llamacpp', 'Remote embeddings are outside this model budget');
    history = new HistoryStore(join(output, 'trial-history.sqlite'));
    const handler = createHistoryHandler({ store: history, databasePath: join(output, 'trial-history.sqlite'), octosBaseUrl: backend });
    product = createServer((request, response) => { void handler(request, response); });
    const productBase = await listenLocal(product), identity = { owner: plan.owner, token };
    vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
    const { analyzeTopics, createTopicAnalysisBridge } = await vite.ssrLoadModule('/src/learning/history/analyze-topics.ts');
    history.db.prepare('INSERT INTO topic_analysis_settings VALUES(?,?,?)').run(plan.owner, 1, 9);
    report.state = 'running'; await save();
    for (const sample of samples) {
      activeSample = sample; stageTopicCase(history, plan.owner, sample);
      requireAllStagedJobs(history, plan.owner, sample);
      activeInput = buildAnalysisInput(history, plan.owner, sample.id);
      ledger.start(sample.id, activeInput.input_sha256);
      const row = { id: sample.id, input_sha256: activeInput.input_sha256, state: 'started' }; report.rows.push(row); await save();
      const progress = await analyzeTopics(identity, productBase, { createBridge: () => createTopicAnalysisBridge(identity, backend) });
      assert.equal(progress.completed, 1, 'Trial stopped: source did not complete');
      const saved = history.db.prepare('SELECT result_json FROM topic_analysis_results WHERE owner=? AND source_event_id=?').get(plan.owner, sample.id);
      assert.ok(saved, 'Trial stopped: result not saved');
      const result = JSON.parse(saved.result_json);
      row.result = result; row.review = inspectTopicCandidate(sample, result); row.state = 'saved-needs-human-review';
      ledger.finish(sample.id); await save();
      assert.equal(row.review.expectation_issues.length, 0, 'Trial stopped at a predeclared expectation mismatch; do not auto-repeat');
    }
    stageObservedTrialPlayback(history, plan.owner);
    report.playback_evidence = queryTopic(history, plan.owner, 'mt_WBdHkc2HTf').automatic;
    assert.equal(report.playback_evidence.counts.played_runs, 2); assert.equal(report.playback_evidence.counts.played_beats, 2);
    const revised = history.db.prepare('SELECT seq FROM topic_analysis_results WHERE owner=? AND source_event_id=?').get(plan.owner, 'course-version-b').seq;
    assert.ok(report.playback_evidence.events.every(row => row.associations.every(link => link.result_seq !== revised)), 'New material relabeled the old playback');
    const controls = await fetch(`${productBase}/api/learn/history/analysis/controls`, { headers: { authorization: `Bearer ${token}`, 'x-learning-owner': plan.owner } }).then(r => r.json());
    assert.deepEqual(controls.controls, [], 'Temporary namespaces still need cleanup');
    report.state = 'completed-needs-human-review';
    if (mode === '--fixture') { assert.equal(originalHttp, 18); assert.equal(gateway.metrics.forwarded, 18); report.fixture_model_http_requests = originalHttp; }
  } catch (error) {
    // Do not serialize provider bodies, request headers or account config.
    report.state = 'stopped'; report.failure = 'Inspect protected results and durable reservations; no automatic continuation';
    if (mode === '--execute') throw Error('Topic trial stopped; retain the private report and budget ledger for inspection. Do not automatically retry or restore direct routing.');
    throw error;
  } finally {
    report.budget = ledger.snapshot(); report.gateway_metrics = gateway?.metrics; await save();
    await closeLocal(product); await vite?.close(); await fixture?.close();
    await closeLocal(gateway?.server); history?.close(); ledger.close();
  }
  console.log(JSON.stringify({ state: report.state, samples: report.rows.length, supplier_calls: report.supplier_calls,
    model_http_requests: report.budget.requests.length, reserved_usd: report.budget.requests.reduce((sum, r) => sum + r.usd, 0) / 1e6,
    semantic_quality_verified: false, report: join(output, 'report.json') }));
}

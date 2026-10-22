// --check is offline. --fixture uses real isolated Octos plus a synthetic
// Gemini replacement. --execute requires an explicitly approved policy and
// pre-routed normal Octos; it never exports/copies supplier credentials.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createServer as createViteServer } from 'vite';
import { HistoryStore } from '../services/learning-history/store.mjs';
import { createHistoryHandler } from '../services/learning-history/server.mjs';
import { buildAnalysisInput } from '../services/learning-history/topic-analysis.mjs';
import { ANALYSIS_INSTRUCTIONS } from '../services/learning-history/topic-analysis-instructions.mjs';
import { digest, validateTopicTrial, validateUnadmittedResume, TopicTrialLedger, createTopicTrialGateway } from './lib/learning-topic-trial-control.mjs';
import { stageTopicCase, inspectTopicCandidate, requireAllStagedJobs, stageObservedTrialPlayback, retainTopicTrialOutput } from './lib/learning-topic-trial-cases.mjs';
import { queryTopic } from '../services/learning-history/topic-query.mjs';
import { topicOctosFixture, listenLocal, closeLocal } from './lib/learning-topic-trial-fixture.mjs';
import { loginExistingTrialOwner } from './lib/learning-performance-auth.mjs';

const [mode, planFile, output, binary, fixtureScenario = 'valid'] = process.argv.slice(2);
const execute = mode === '--execute' || mode === '--resume-preflight';
assert.ok(['--check', '--fixture', '--execute', '--resume-preflight'].includes(mode) && planFile, 'Supply --check|--fixture|--execute PLAN.json [PRIVATE_OUTPUT] [ABSOLUTE_OCTOS_BINARY]');
assert.ok(fixtureScenario === 'valid' || (mode === '--fixture' && ['invalid-json', 'resumed-host', 'three-lookups'].includes(fixtureScenario)), 'Invalid fixture scenario');
const planBytes = await readFile(planFile), plan = JSON.parse(planBytes);
const casesBytes = await readFile('docs/personalized-teachers-phase2/TOPIC_ACCURACY_CASES.json');
const samples = validateTopicTrial(plan, casesBytes, { execute });
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
  if (execute) {
    assert.equal(resolve(output), plan.output_directory);
    assert.equal(digest(await readFile(plan.octos.binary)), plan.octos.sha256, 'Reviewed Octos binary changed; recheck profile bootstrap and billing paths');
  }
  else assert.ok(binary?.startsWith('/'), 'Fixture requires an absolute local Octos binary');
  // No fresh directory or changed policy is used to refill an existing trial.
  let ledger, resumeEvidence;
  if (mode === '--resume-preflight') {
    // Never create a replacement budget. Inspect both durable stores before
    // connecting, retain the prior approved policy/report, and reuse the same
    // active task only when no Octos execution or supplier attempt existed.
    const previousBytes = await readFile(join(output, 'policy-executed.json'));
    const previousPlan = JSON.parse(previousBytes), previousReportBytes = await readFile(join(output, 'report.json'));
    const previousReport = JSON.parse(previousReportBytes);
    const previousDb = new DatabaseSync(join(output, 'trial-history.sqlite'), { readOnly: true });
    try {
      const jobs = previousDb.prepare('SELECT source_event_id,state,input_sha256,octos_session_id,octos_turn_id FROM topic_analysis_jobs').all();
      const results = previousDb.prepare('SELECT COUNT(*) n FROM topic_analysis_results').get().n;
      let controlCount = 0;
      try { controlCount = (await readdir(join(output, 'analysis-host-controls', plan.owner))).length; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      ledger = new TopicTrialLedger(join(output, 'budget.sqlite'), previousPlan);
      validateUnadmittedResume(plan, previousPlan, previousReport, ledger.snapshot(), jobs, results, controlCount);
      await writeFile(join(output, 'pre-admission-report.json'), previousReportBytes, { flag: 'wx', mode: 0o600, flush: true });
      await writeFile(join(output, 'policy-resumed.json'), planBytes, { flag: 'wx', mode: 0o600, flush: true });
      resumeEvidence = { previous_policy_sha256: digest(previousBytes), previous_report_sha256: digest(previousReportBytes), original_ledger_preserved: true };
    } catch (error) { ledger?.close(); throw error; }
    finally { previousDb.close(); }
  } else {
    await mkdir(output, { recursive: false, mode: 0o700 });
    ledger = new TopicTrialLedger(join(output, 'budget.sqlite'), plan);
  }
  let fixture, vite, product, gateway, activeInput, activeSample, originalHttp = 0, history;
  const report = { plan_sha256: digest(planBytes), mode, supplier_calls: mode === '--fixture' ? 0 : null,
    ...(resumeEvidence ? { preflight_resume: resumeEvidence } : {}), rows: [], semantic_quality: 'requires independent human review', state: 'preflight' };
  const save = () => writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flush: true });
  try {
    const upstreamFetch = execute ? fetch : async (_url, options) => {
      originalHttp++;
      const body = JSON.parse(options.body);
      const promptTexts = [body.system_instruction, body.systemInstruction, ...body.contents].filter(Boolean)
        .flatMap(message => message.parts ?? []).map(part => part.text ?? '').join('\n');
      report.fixture_instructions_present = promptTexts.includes(ANALYSIS_INSTRUCTIONS);
      assert.ok(report.fixture_instructions_present, 'Analysis instructions did not reach the actual Octos model request');
      assert.ok(!promptTexts.includes('acceptable_topics'), 'Expected answers leaked into model input');
      report.fixture_instruction_requests_checked = (report.fixture_instruction_requests_checked ?? 0) + 1;
      const hasTool = body.contents.some(content => content.parts.some(part => part.functionResponse));
      let parts = hasTool ? [{ text: JSON.stringify({ schema: 1, input_sha256: activeInput.input_sha256,
        units: activeInput.units.map(unit => { const expected = activeSample.expectations[unit.unit_id]; return { unit_id: unit.unit_id, status: expected.status,
          topics: expected.status === 'mapped' ? [{ topic_id: expected.acceptable_topics[0], quote: unit.content.slice(0, Math.min(24, unit.content.length)) }] : [], reason: 'Fixture only; expectations never reach a real model' }; }) }) }]
        : [{ functionCall: { name: 'learning_topics_search', args: { query: 'linear gradient intercept triangle angle sum', limit: 12 } } }];
      if (fixtureScenario === 'three-lookups') {
        const replies = body.contents.flatMap(content => content.parts).filter(part => part.functionResponse).length;
        if (replies < 3) parts = [{ functionCall: { name: 'learning_topics_search', args: replies === 2 ? { ids: ['mt_WBdHkc2HTf'] } : { query: replies === 0 ? 'unfindablesyntheticterm' : 'linear gradient intercept' } } }];
      }
      if (hasTool && fixtureScenario === 'invalid-json') parts[0].text = 'Synthetic invalid JSON answer; preserve this before cleanup.';
      return new Response(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts }, finishReason: hasTool ? 'STOP' : 'STOP' }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 20, totalTokenCount: 40 } })}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    };
    gateway = createTopicTrialGateway({ ledger, upstreamFetch });
    const gatewayBase = await listenLocal(gateway.server, execute ? Number(new URL(plan.gateway).port) : 0);
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
    if (fixtureScenario === 'resumed-host') {
      const preflight = createTopicAnalysisBridge(identity, backend);
      try {
        await preflight.start({ profileId: plan.owner });
        await preflight.callMethod('session/open', { session_id: 'learn-topic-' + digest(plan.owner).slice(0, 32), profile_id: plan.owner, cwd: output });
      } finally { await preflight.stop(); }
      await fixture.restart();
      report.fixture_persisted_host_restarted = true;
    }
    if (!resumeEvidence) history.db.prepare('INSERT INTO topic_analysis_settings VALUES(?,?,?)').run(plan.owner, 1, samples.length);
    report.state = 'running'; await save();
    for (const sample of samples) {
      activeSample = sample; if (!resumeEvidence) stageTopicCase(history, plan.owner, sample);
      requireAllStagedJobs(history, plan.owner, sample);
      activeInput = buildAnalysisInput(history, plan.owner, sample.id);
      if (!resumeEvidence) ledger.start(sample.id, activeInput.input_sha256);
      const row = { id: sample.id, input_sha256: activeInput.input_sha256, state: 'started' }; report.rows.push(row); await save();
      const progress = await analyzeTopics(identity, productBase, { createBridge: () => {
        const connection = createTopicAnalysisBridge(identity, backend), original = connection.callMethod.bind(connection);
        let registeredSession;
        const subscribe = connection.onPeerToolCall.bind(connection);
        connection.onPeerToolCall = callback => subscribe(event => {
          if (event.name === 'learning_topics.search' && event.session_id === registeredSession) {
            const args = event.args ?? {}, safe = {};
            if (typeof args.query === 'string' && args.query.length <= 256) safe.query = args.query;
            if (Array.isArray(args.ids) && args.ids.length <= 12 && args.ids.every(id => typeof id === 'string' && /^mt_[A-Za-z0-9_-]+$/.test(id))) safe.ids = args.ids;
            if (Number.isInteger(args.limit)) safe.limit = args.limit;
            (row.catalog_calls ??= []).push({ name: event.name, args: safe });
          }
          callback(event);
        });
        connection.callMethod = async (method, params) => {
          const result = await original(method, params);
          if (method === 'peer/tools/register') registeredSession = `${params.session_id}#peer-${params.peer}`;
          if (method === 'session/hydrate' && retainTopicTrialOutput(row, params.session_id, result)) await save();
          return result;
        };
        return connection;
      } });
      assert.equal(progress.completed, 1, 'Trial stopped: source did not complete');
      const saved = history.db.prepare('SELECT result_json FROM topic_analysis_results WHERE owner=? AND source_event_id=?').get(plan.owner, sample.id);
      assert.ok(saved, 'Trial stopped: result not saved');
      const result = JSON.parse(saved.result_json);
      row.result = result; row.review = inspectTopicCandidate(sample, result); row.state = 'saved-needs-human-review';
      ledger.finish(sample.id); await save();
      assert.equal(row.review.expectation_issues.length, 0, 'Trial stopped at a predeclared expectation mismatch; do not auto-repeat');
    }
    if (['course-supplement', 'course-version-a', 'course-version-b'].every(id => samples.some(sample => sample.id === id))) {
      stageObservedTrialPlayback(history, plan.owner);
      report.playback_evidence = queryTopic(history, plan.owner, 'mt_WBdHkc2HTf').automatic;
      assert.equal(report.playback_evidence.counts.played_runs, 2); assert.equal(report.playback_evidence.counts.played_beats, 2);
      const revised = history.db.prepare('SELECT seq FROM topic_analysis_results WHERE owner=? AND source_event_id=?').get(plan.owner, 'course-version-b').seq;
      assert.ok(report.playback_evidence.events.every(row => row.associations.every(link => link.result_seq !== revised)), 'New material relabeled the old playback');
    } else report.playback_check = 'Not exercised by the first-source-only diagnosis';
    const controls = await fetch(`${productBase}/api/learn/history/analysis/controls`, { headers: { authorization: `Bearer ${token}`, 'x-learning-owner': plan.owner } }).then(r => r.json());
    assert.deepEqual(controls.controls, [], 'Temporary namespaces still need cleanup');
    report.state = 'completed-needs-human-review';
    if (mode === '--fixture') { const expected = samples.length * (fixtureScenario === 'three-lookups' ? 4 : 2); assert.equal(originalHttp, expected); assert.equal(gateway.metrics.forwarded, expected); report.fixture_model_http_requests = originalHttp; }
  } catch (error) {
    // Do not serialize provider bodies, request headers or account config.
    report.state = 'stopped'; report.failure = 'Inspect protected results and durable reservations; no automatic continuation';
    if (execute) throw Error('Topic trial stopped; retain the private report and budget ledger for inspection. Do not automatically retry or restore direct routing.');
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

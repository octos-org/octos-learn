// Trial-only. Never imported by the product or used to classify learning data.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { analysisHash } from '../../services/learning-history/topic-analysis.mjs';
import { ANALYSIS_MATERIAL_PREFIX } from '../../services/learning-history/topic-analysis-instructions.mjs';

export const digest = value => createHash('sha256').update(value).digest('hex');
const fields = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key));
export function validateTopicTrial(plan, casesBytes, { execute = false, now = new Date() } = {}) {
  assert.equal(plan.schema, 'octos.learn.topic-accuracy-trial.v1');
  assert.equal(plan.owner, 'alan0x'); assert.equal(plan.model, 'gemini-3.8-flash');
  assert.equal(plan.backend, 'http://127.0.0.1:50080'); assert.equal(plan.gateway, 'http://127.0.0.1:50189');
  assert.equal(plan.cases_sha256, digest(casesBytes));
  assert.equal(plan.taxonomy_sha256, '27e8e6d7ffe82f9ec86e374aa7edacd5ba758886d0ae92b9abadf3fff05a4522');
  assert.match(plan.id, /^[a-z0-9-]+$/); assert.ok(plan.output_directory.startsWith('/private/tmp/'));
  const cases = JSON.parse(casesBytes).cases;
  assert.equal(cases.length, 9); assert.equal(new Set(cases.map(c => c.id)).size, 9);
  assert.ok(plan.scope === undefined || ['first-source-diagnosis', 'first-source-completion', 'remaining-fixed-cases', 'final-seven-fixed-cases'].includes(plan.scope), 'Unsupported trial scope');
  const diagnostic = plan.scope !== undefined;
  const completion = plan.scope === 'first-source-completion';
  const remaining = plan.scope === 'remaining-fixed-cases';
  const finalSeven = plan.scope === 'final-seven-fixed-cases';
  assert.deepEqual(plan.limits, { tasks: finalSeven ? 7 : remaining ? 8 : diagnostic ? 1 : 9, model_http_requests: finalSeven ? 13 : remaining ? 18 : completion ? 9 : diagnostic ? 3 : 18, model_http_requests_per_task: completion || remaining || finalSeven ? 9 : 3, usd_micros: finalSeven ? 14300000 : remaining ? 20000000 : completion ? 9900000 : diagnostic ? 3300000 : 20000000,
    reservation_usd_micros: 1100000, request_bytes: 1048576, output_tokens: 32768 });
  const p = plan.pricing;
  assert.equal(p.input_per_million_usd, 0.75); assert.equal(p.output_including_thinking_per_million_usd, 3.75);
  assert.equal(p.max_input_tokens, 1048576); assert.equal(p.max_output_tokens, 65536);
  assert.equal(p.valid_until, '2026-12-31');
  assert.ok((p.max_input_tokens * p.input_per_million_usd + p.max_output_tokens * p.output_including_thinking_per_million_usd) <= plan.limits.reservation_usd_micros);
  if (execute) {
    assert.equal(plan.status, 'approved', 'Topic accuracy trial is not authorized');
    assert.ok(typeof plan.authorization_reference === 'string' && plan.authorization_reference.trim(), 'Human authorization missing');
    assert.equal(p.verified_at, now.toISOString().slice(0, 10), 'Recheck the public price on execution day');
    assert.ok(now.toISOString().slice(0, 10) <= p.valid_until, 'Pricing basis expired');
  }
  return finalSeven ? cases.slice(2) : remaining ? cases.slice(1) : diagnostic ? cases.slice(0, 1) : cases;
}

// A connection failure before Octos admission has not spent the authorization.
// Only the same first source and its original, empty ledger can be resumed.
// Code fingerprints may advance after a reviewed repair; every other approved
// field and all previous evidence must remain intact.
export function validateUnadmittedResume(plan, previousPlan, report, snapshot, jobs, resultCount, controlCount) {
  const { code_sha256: currentCode, ...current } = plan;
  const { code_sha256: previousCode, ...previous } = previousPlan;
  assert.ok(currentCode && previousCode);
  assert.deepEqual(current, previous, 'Preflight recovery cannot change approved scope or limits');
  assert.equal(plan.status, 'approved'); assert.equal(plan.scope, 'first-source-diagnosis');
  assert.equal(report.state, 'stopped'); assert.equal(report.mode, '--execute');
  assert.equal(report.gateway_metrics?.forwarded, 0); assert.equal(report.gateway_metrics?.failed, 0);
  assert.equal(report.rows.length, 1); assert.equal(report.rows[0].id, 'q-direction');
  assert.equal(report.budget.requests.length, 0); assert.equal(snapshot.requests.length, 0, 'An attempted model request cannot be resumed');
  assert.equal(snapshot.tasks.length, 1); const task = snapshot.tasks[0];
  assert.equal(task.id, 'q-direction'); assert.equal(task.state, 'active'); assert.equal(task.input_hash, report.rows[0].input_sha256);
  assert.equal(jobs.length, 1); const job = jobs[0];
  assert.equal(job.source_event_id, task.id); assert.equal(job.state, 'pending'); assert.equal(job.input_sha256, task.input_hash);
  assert.equal(job.octos_session_id, null, 'Octos admission may already have occurred'); assert.equal(job.octos_turn_id, null);
  assert.equal(resultCount, 0); assert.equal(controlCount, 0, 'Unreconciled control must not be replaced');
}

/** Reservations are written before forwarding. Missing/failed replies are never
 * refunded; changing the plan or restarting cannot reset the ledger. */
export class TopicTrialLedger {
  constructor(path, plan) {
    this.plan = structuredClone(plan); this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=0;
      CREATE TABLE IF NOT EXISTS policy(id INTEGER PRIMARY KEY CHECK(id=1),digest TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,input_hash TEXT UNIQUE NOT NULL,state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,usd INTEGER NOT NULL);`);
    try {
      const hash = digest(JSON.stringify(plan)), old = this.db.prepare('SELECT digest FROM policy').get();
      if (old) assert.equal(old.digest, hash, 'Trial policy changed; retain original ledger');
      else this.db.prepare('INSERT INTO policy VALUES(1,?)').run(hash);
    } catch (error) { this.db.close(); throw error; }
  }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const value = fn(); this.db.exec('COMMIT'); return value; } catch (error) { this.db.exec('ROLLBACK'); throw error; } }
  start(id, inputHash) {
    return this.transaction(() => {
      assert.equal(this.db.prepare("SELECT COUNT(*) n FROM tasks WHERE state='active'").get().n, 0, 'An earlier task is unfinished');
      assert.ok(this.db.prepare('SELECT COUNT(*) n FROM tasks').get().n < this.plan.limits.tasks, 'Task limit reached');
      assert.match(inputHash, /^[a-f0-9]{64}$/);
      this.db.prepare('INSERT INTO tasks VALUES(?,?,?)').run(id, inputHash, 'active');
    });
  }
  reserve(inputHash) {
    return this.transaction(() => {
      const task = this.db.prepare("SELECT id FROM tasks WHERE input_hash=? AND state='active'").get(inputHash);
      assert.ok(task, 'Request is not the active pinned analysis');
      const total = this.db.prepare('SELECT COUNT(*) n,COALESCE(SUM(usd),0) usd FROM requests').get();
      assert.ok(total.n < this.plan.limits.model_http_requests && total.usd + this.plan.limits.reservation_usd_micros <= this.plan.limits.usd_micros, 'Trial budget exhausted');
      assert.ok(this.db.prepare('SELECT COUNT(*) n FROM requests WHERE task_id=?').get(task.id).n < this.plan.limits.model_http_requests_per_task, 'Task request cap reached');
      this.db.prepare('INSERT INTO requests VALUES(?,?,?)').run(randomUUID(), task.id, this.plan.limits.reservation_usd_micros);
    });
  }
  finish(id) { assert.equal(this.db.prepare("UPDATE tasks SET state='finished' WHERE id=? AND state='active'").run(id).changes, 1); }
  snapshot() { return { tasks: this.db.prepare('SELECT * FROM tasks ORDER BY rowid').all(), requests: this.db.prepare('SELECT * FROM requests ORDER BY rowid').all() }; }
  close() { this.db.close(); }
}

const aliased = (value, snake, camel) => {
  assert.ok(!(Object.hasOwn(value, snake) && Object.hasOwn(value, camel)), 'Ambiguous protocol aliases');
  return value[snake] ?? value[camel];
};
export function checkTopicModelRequest(body, plan) {
  assert.ok(fields(body, ['contents', 'system_instruction', 'systemInstruction', 'generation_config', 'generationConfig', 'tools', 'toolConfig']));
  const config = aliased(body, 'generation_config', 'generationConfig');
  assert.ok(fields(config, ['max_output_tokens', 'maxOutputTokens', 'temperature', 'thinkingConfig', 'responseMimeType', 'responseSchema']));
  const max = aliased(config, 'max_output_tokens', 'maxOutputTokens');
  assert.ok(Number.isSafeInteger(max) && max > 0 && max <= plan.limits.output_tokens);
  if (config.thinkingConfig) assert.ok(fields(config.thinkingConfig, ['thinkingBudget', 'thinkingLevel']));
  assert.ok(!body.toolConfig || (fields(body.toolConfig, ['functionCallingConfig']) && fields(body.toolConfig.functionCallingConfig, ['mode', 'allowedFunctionNames'])));
  const system = aliased(body, 'system_instruction', 'systemInstruction');
  assert.ok(!system || (fields(system, ['parts']) && Array.isArray(system.parts) && system.parts.every(part => fields(part, ['text']) && typeof part.text === 'string')));
  assert.ok(Array.isArray(body.contents) && body.contents.length);
  let inputHash;
  for (const content of body.contents) {
    assert.ok(fields(content, ['role', 'parts']) && ['user', 'model'].includes(content.role) && Array.isArray(content.parts));
    for (const part of content.parts) {
      if (typeof part.text === 'string') {
        assert.ok(fields(part, ['text', 'thought']) && (part.thought === undefined || typeof part.thought === 'boolean'));
        const marker = '[from the app: Learning topic analysis] ';
        if (content.role === 'user' && part.text.startsWith(marker)) {
          assert.equal(inputHash, undefined, 'Multiple analysis inputs');
          const prompt = part.text.slice(marker.length);
          assert.ok(prompt.startsWith(ANALYSIS_MATERIAL_PREFIX), 'Analysis instructions missing or changed');
          const input = JSON.parse(prompt.slice(ANALYSIS_MATERIAL_PREFIX.length));
          assert.equal(input.schema, 1); assert.match(input.input_sha256, /^[a-f0-9]{64}$/);
          const { input_sha256, ...original } = input;
          assert.equal(analysisHash(original), input_sha256, 'Pinned input content changed'); inputHash = input_sha256;
        }
      } else if (part.functionCall) {
        assert.ok(content.role === 'model' && fields(part, ['functionCall', 'thoughtSignature']));
        assert.ok(fields(part.functionCall, ['name', 'args']) && part.functionCall.name === 'learning_topics_search');
      } else {
        assert.ok(content.role === 'user' && fields(part, ['functionResponse']) && fields(part.functionResponse, ['name', 'response']));
        assert.equal(part.functionResponse.name, 'learning_topics_search');
        // Opaque tool data may contain JSON strings; no media parts or URI
        // inputs are permitted anywhere in the actual Gemini request.
      }
    }
  }
  if (body.tools) {
    assert.ok(Array.isArray(body.tools) && body.tools.length === 1);
    const tool = body.tools[0]; assert.ok(fields(tool, ['function_declarations', 'functionDeclarations']));
    const declarations = aliased(tool, 'function_declarations', 'functionDeclarations');
    assert.ok(Array.isArray(declarations) && declarations.length === 1);
    assert.ok(fields(declarations[0], ['name', 'description', 'parameters']) && declarations[0].name === 'learning_topics_search');
  }
  assert.ok(inputHash, 'No app-origin analysis input'); return inputHash;
}

/** Only a fixed Google endpoint is forwarded. The caller must inject fetch;
 * synthetic checks never get a default path to the real provider. */
export function createTopicTrialGateway({ ledger, upstreamFetch }) {
  assert.equal(typeof upstreamFetch, 'function');
  const metrics = { forwarded: 0, refused: 0, failed: 0, refused_by_stage: {} };
  const server = createServer(async (request, response) => {
    let stage = 'protocol';
    try {
      const url = new URL(request.url, 'http://local');
      const expected = `/v1beta/models/${ledger.plan.model}`;
      assert.equal(request.method, 'POST');
      assert.ok([`${expected}:generateContent`, `${expected}:streamGenerateContent`].includes(url.pathname));
      assert.ok(!url.search || url.search === '?alt=sse');
      let size = 0; const chunks = [];
      for await (const chunk of request) { size += chunk.length; assert.ok(size <= ledger.plan.limits.request_bytes); chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      stage = 'input';
      const inputHash = checkTopicModelRequest(body, ledger.plan);
      stage = 'authorization';
      const key = request.headers['x-goog-api-key']; assert.ok(typeof key === 'string' && key);
      stage = 'reservation';
      ledger.reserve(inputHash); metrics.forwarded++;
      stage = 'supplier';
      const upstream = await upstreamFetch(`https://generativelanguage.googleapis.com${url.pathname}${url.search}`, {
        method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
      response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' });
      if (upstream.body) await pipeline(Readable.fromWeb(upstream.body), response); else response.end();
    } catch {
      if (response.headersSent) { metrics.failed++; response.destroy(); }
      else { metrics.refused++; metrics.refused_by_stage[stage] = (metrics.refused_by_stage[stage] ?? 0) + 1; response.writeHead(402, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end('{"error":"Topic trial refused; inspect pinned policy and reservations"}'); }
    }
  });
  return { server, metrics };
}

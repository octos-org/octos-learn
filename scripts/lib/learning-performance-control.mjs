// Benchmark-only controls. Never imported by the application or installed skill.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const sha256 = text => createHash('sha256').update(text).digest('hex');
const integer = (n, label) => assert.ok(Number.isSafeInteger(n) && n > 0, `Invalid ${label}`);

export function validateTrialPlan(plan, { execute = false } = {}) {
  assert.equal(plan.schema, 'octos.learn.performance-trial.v1');
  assert.ok(typeof plan.id === 'string' && /^[a-z0-9-]+$/.test(plan.id));
  assert.ok(Array.isArray(plan.samples) && plan.samples.length > 0);
  assert.ok(new Set(plan.samples.map(s => s.id)).size === plan.samples.length);
  for (const sample of plan.samples) {
    assert.ok(typeof sample.id === 'string' && sample.id.length > 0);
    assert.ok(['baseline', 'candidate'].includes(sample.version));
    assert.ok(typeof sample.prompt === 'string' && sample.prompt.trim());
  }
  for (const [k, n] of Object.entries(plan.limits)) integer(n, k);
  for (const k of ['courses', 'speech_requests', 'usd_micros', 'cny_micros', 'model_request_usd_micros', 'speech_byte_cny_micros', 'speech_utf8_bytes', 'output_tokens', 'request_bytes']) integer(plan.limits[k], k);
  assert.ok(plan.samples.length <= plan.limits.courses);
  assert.ok(plan.model && /^gemini-[\w.-]+$/.test(plan.model));
  assert.ok(typeof plan.voice === 'string' && plan.voice && typeof plan.resource === 'string' && plan.resource);
  if (execute) {
    assert.equal(plan.status, 'approved', 'Trial is not authorized');
    assert.equal(plan.cost_basis_verified, true, 'Cost bounds are not verified');
    assert.equal(plan.route_verified, true, 'All skill requests must pass the budget gateway');
    assert.ok(typeof plan.authorization_reference === 'string' && plan.authorization_reference.trim(), 'Human authorization must be recorded');
    assert.ok(typeof plan.output_directory === 'string' && plan.output_directory.startsWith('/'), 'Reviewed output directory must be pinned');
  }
  return plan;
}

/** Atomic reservations survive process interruption. Never refund a request:
 * cancellation and missing provider receipts do not prove it was unbilled.
 * SQLite's transaction serializes concurrent callers before any network send.
 */
export class TrialLedger {
  constructor(path, plan) {
    validateTrialPlan(plan);
    this.plan = structuredClone(plan);
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=0;
      CREATE TABLE IF NOT EXISTS policy (id INTEGER PRIMARY KEY CHECK(id=1), digest TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS samples (id TEXT PRIMARY KEY, ordinal INTEGER UNIQUE NOT NULL, session_id TEXT UNIQUE NOT NULL, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, sample_id TEXT NOT NULL, kind TEXT NOT NULL, usd INTEGER NOT NULL, cny INTEGER NOT NULL, units INTEGER NOT NULL);
    `);
    const digest = sha256(JSON.stringify(plan));
    try {
      this.transaction(() => {
        const old = this.db.prepare('SELECT digest FROM policy WHERE id=1').get();
        if (old) assert.equal(old.digest, digest, 'Plan changed: existing reservations cannot be reset');
        else this.db.prepare('INSERT INTO policy VALUES (1,?)').run(digest);
      });
    } catch (error) { this.db.close(); throw error; }
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  reserveSample(id, sessionId) {
    assert.ok(typeof sessionId === 'string' && /^[\w-]+$/.test(sessionId));
    return this.transaction(() => {
      const old = this.db.prepare('SELECT * FROM samples WHERE state<>?').all('completed');
      assert.equal(old.length, 0, 'Earlier sample is unfinished; inspect it, never automatically resubmit');
      const ordinal = this.db.prepare('SELECT COUNT(*) n FROM samples').get().n;
      assert.ok(ordinal < this.plan.limits.courses, 'Course limit exhausted');
      assert.equal(this.plan.samples[ordinal]?.id, id, 'Sample order changed or sample already consumed');
      this.db.prepare('INSERT INTO samples VALUES (?,?,?,?)').run(id, ordinal, sessionId, 'reserved');
      return { id, ordinal, session_id: sessionId };
    });
  }
  expense(sampleId, kind, { usd = 0, cny = 0, units = 1 }) {
    return this.transaction(() => {
      const sample = this.db.prepare('SELECT state FROM samples WHERE id=?').get(sampleId);
      assert.equal(sample?.state, 'reserved', 'No active reserved sample');
      const total = this.db.prepare('SELECT COALESCE(SUM(usd),0) usd, COALESCE(SUM(cny),0) cny FROM expenses').get();
      assert.ok(total.usd + usd <= this.plan.limits.usd_micros && total.cny + cny <= this.plan.limits.cny_micros, 'Reserved cost limit exhausted');
      if (kind === 'speech') {
        assert.equal(this.db.prepare("SELECT COUNT(*) n FROM expenses WHERE sample_id=? AND kind='speech'").get(sampleId).n, 0, 'Only one speech request per sample');
        assert.ok(this.db.prepare("SELECT COUNT(*) n FROM expenses WHERE kind='speech'").get().n < this.plan.limits.speech_requests, 'Speech request limit exhausted');
      }
      const id = randomUUID();
      this.db.prepare('INSERT INTO expenses VALUES (?,?,?,?,?,?)').run(id, sampleId, kind, usd, cny, units);
      return id;
    });
  }
  reserveModel(sampleId) { return this.expense(sampleId, 'model', { usd: this.plan.limits.model_request_usd_micros }); }
  reserveSpeech(sampleId, text) {
    const units = Buffer.byteLength(text, 'utf8');
    assert.ok(units > 0 && units <= this.plan.limits.speech_utf8_bytes, 'Speech text exceeds reviewed limit');
    const cny = units * this.plan.limits.speech_byte_cny_micros;
    assert.ok(Number.isSafeInteger(cny));
    return this.expense(sampleId, 'speech', { cny, units });
  }
  complete(sampleId, { jobsTerminal, measurementValid }) {
    assert.equal(jobsTerminal, true, 'Closing playback is not confirmation that generation stopped');
    assert.equal(measurementValid, true, 'A failed measurement must stop the run');
    assert.equal(this.db.prepare('UPDATE samples SET state=? WHERE id=? AND state=?').run('completed', sampleId, 'reserved').changes, 1);
  }
  snapshot() {
    return { samples: this.db.prepare('SELECT * FROM samples ORDER BY ordinal').all().map(r => ({ ...r })),
      expenses: this.db.prepare('SELECT * FROM expenses ORDER BY rowid').all().map(r => ({ ...r })) };
  }
  activeSampleId() {
    const rows = this.db.prepare("SELECT id FROM samples WHERE state='reserved'").all();
    assert.equal(rows.length, 1, 'There must be exactly one reserved course'); return rows[0].id;
  }
  close() { this.db.close(); }
}

/** Browser speech gate. Caller supplies the actual first narrated beat text,
 * not whichever prefetch happened to arrive first. Reservation precedes send.
 */
export function createFirstSpeechGate(ledger, sampleId, expectedText, send) {
  assert.ok(typeof expectedText === 'string' && expectedText.trim());
  const text = expectedText.trim();
  let sent = false;
  return async body => {
    assert.equal(body.provider, 'volcano');
    assert.equal(body.params?.voice, ledger.plan.voice);
    assert.equal(body.params?.resource_id, ledger.plan.resource);
    assert.equal(body.key, undefined, 'Trial must use the saved account credential');
    const params = body.payload?.req_params;
    assert.equal(params?.text, text, 'Not the exact first narrated beat');
    assert.equal(params.speaker, ledger.plan.voice, 'Unreviewed speech voice');
    assert.ok(Object.keys(body.payload).every(k => ['user', 'req_params'].includes(k)), 'Unreviewed speech option');
    assert.ok(Object.keys(params).every(k => ['text', 'speaker', 'audio_params'].includes(k)), 'Unreviewed synthesis option');
    assert.deepEqual(params.audio_params, { format: 'mp3', sample_rate: 24000 }, 'Unreviewed speech format');
    assert.equal(sent, false, 'Second speech request blocked');
    ledger.reserveSpeech(sampleId, text); sent = true;
    // Failed send stays reserved. No implicit transport retry or fallback.
    return send(body);
  };
}

async function readJson(request, maxBytes) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; assert.ok(size <= maxBytes, 'Model request too large'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Only for the explicitly routed benchmark skill. Endpoint and headers are
 * fixed, with no forwarding of Octos session auth or arbitrary targets.
 * upstreamFetch is mandatory so tests cannot accidentally contact a supplier.
 */
export function createModelBudgetGateway({ ledger, activeSample, upstreamFetch }) {
  assert.equal(typeof upstreamFetch, 'function');
  // Actual usage from each response's usageMetadata (the reservation above is
  // only an upper bound), so the real cost can be reported and capped.
  const metrics = { admitted: 0, rejected: 0, failures: 0, prompt_tokens: 0, output_tokens: 0 };
  const handler = async (request, response) => {
    try {
      const url = new URL(request.url, 'http://fixture');
      if (request.method === 'GET' && url.pathname === '/trial/status' && !url.search) {
        response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        response.end(JSON.stringify({ policy_sha256: sha256(JSON.stringify(ledger.plan)), ...metrics })); return;
      }
      const allowed = `/v1beta/models/${ledger.plan.model}`;
      assert.equal(request.method, 'POST');
      assert.ok(url.pathname === `${allowed}:generateContent` || url.pathname === `${allowed}:streamGenerateContent`);
      assert.ok(!url.search || url.search === '?alt=sse');
      const body = await readJson(request, ledger.plan.limits.request_bytes);
      assert.ok(Object.keys(body).every(k => ['systemInstruction', 'contents', 'generationConfig'].includes(k)), 'Unpriced request feature');
      assert.ok(Array.isArray(body.contents) && body.contents.length);
      const config = body.generationConfig;
      integer(config?.maxOutputTokens, 'output cap'); assert.ok(config.maxOutputTokens <= ledger.plan.limits.output_tokens);
      assert.ok(Object.keys(config).every(k => ['temperature', 'maxOutputTokens', 'responseMimeType', 'responseJsonSchema', 'thinkingConfig'].includes(k)), 'Unpriced generation option');
      // Text-only benchmark. No billable image/audio/remote URI inputs.
      for (const content of [...body.contents, ...(body.systemInstruction ? [body.systemInstruction] : [])]) {
        assert.ok(Array.isArray(content.parts) && content.parts.every(p => Object.keys(p).length === 1 && typeof p.text === 'string'));
      }
      assert.ok(typeof request.headers['x-goog-api-key'] === 'string' && request.headers['x-goog-api-key']);
      ledger.reserveModel(activeSample()); metrics.admitted++;
      const upstream = await upstreamFetch(`https://generativelanguage.googleapis.com${url.pathname}${url.search}`, {
        method: 'POST', redirect: 'error', body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', 'x-goog-api-key': request.headers['x-goog-api-key'] },
        signal: AbortSignal.timeout(120000),
      });
      response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' });
      if (upstream.body) {
        let tail = '';
        const reader = Readable.fromWeb(upstream.body);
        reader.on('data', chunk => { tail = (tail + chunk.toString('utf8')).slice(-8192); });
        await pipeline(reader, response);
        // The last usageMetadata object in the response (it may nest details).
        const at = tail.lastIndexOf('"usageMetadata"'), open = at < 0 ? -1 : tail.indexOf('{', at);
        let usage = null;
        if (open >= 0) for (let depth = 0, i = open; i < tail.length; i++) {
          if (tail[i] === '{') depth++;
          else if (tail[i] === '}' && --depth === 0) { usage = tail.slice(open, i + 1); break; }
        }
        if (usage) {
          try {
            const u = JSON.parse(usage);
            metrics.prompt_tokens += u.promptTokenCount ?? 0;
            metrics.output_tokens += (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
          } catch { /* usage left uncounted; the reservation still bounds it */ }
        }
      } else response.end();
    } catch {
      // Never serialize request bodies, headers, provider errors or credentials.
      if (response.headersSent) { metrics.failures++; response.destroy(); }
      else { metrics.rejected++; response.writeHead(402, { 'content-type': 'application/json' }); response.end('{"error":"Trial request blocked; inspect budget and sample state"}'); }
    }
  };
  return { server: createServer((req, res) => { void handler(req, res); }), metrics };
}

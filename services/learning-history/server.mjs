import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { HistoryStore, HistorySnapshotChanged } from "./store.mjs";
import { HISTORY_BATCH_LIMIT, HistoryValidationError } from "./event-contract.mjs";

import { queryTopic, queryRunCoverage } from "./topic-query.mjs";
import { TopicAnalysisStore } from "./topic-analysis-store.mjs";
import { topicCatalog } from "./topic-catalog.mjs";
import { AnalysisControlStore, validReportControl } from "./analysis-control.mjs";
import { queryLearningMap } from "./map-progress.mjs";
import { evaluateAchievements } from "./achievements.mjs";
import { isWeekStart, queryWeeklyReport } from "./weekly-report.mjs";
import { ReportCommentStore } from "./report-comments.mjs";
import { dismissSuggestion, querySuggestions } from "./suggestions.mjs";
import { TOPIC_MAPPINGS } from "./topic-mappings.mjs";

const PREFIX = "/api/learn/history";
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
async function limitedJson(stream, max) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk); size += buffer.length;
    if (size > max) throw new HttpError(413, "Request too large");
    chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError(400, "Invalid JSON"); }
}
function integer(search, name, fallback, max = Number.MAX_SAFE_INTEGER) {
  const values = search.getAll(name);
  if (!values.length) return fallback;
  if (values.length !== 1 || !/^(0|[1-9]\d*)$/.test(values[0])) throw new HttpError(400, `Invalid ${name}`);
  const value = Number(values[0]);
  if (!Number.isSafeInteger(value) || value > max) throw new HttpError(400, `Invalid ${name}`);
  return value;
}

export function createHistoryHandler({ octosBaseUrl = "http://127.0.0.1:50080", databasePath = join(homedir(), ".octos-learn/learning/history.sqlite"), analysisControlDirectory = join(dirname(databasePath), "analysis-host-controls"), fetchImpl = fetch, store: suppliedStore, mappings = TOPIC_MAPPINGS } = {}) {
  const base = new URL(octosBaseUrl).origin;
  let storage = suppliedStore;
  const store = () => storage ??= new HistoryStore(databasePath);
  const controls = new AnalysisControlStore(analysisControlDirectory);
  const reportControls = new AnalysisControlStore(join(dirname(analysisControlDirectory), "report-host-controls"), validReportControl);
  const handle = async (request, response) => {
    const url = new URL(request.url, "http://local");
    if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;
    const send = (status, value) => {
      if (response.destroyed) return;
      response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, max-age=0", vary: "Authorization, Cookie" });
      response.end(JSON.stringify(value));
    };
    try {
      const origin = request.headers.origin;
      if (origin) {
        let host;
        try { host = new URL(origin).host; } catch { throw new HttpError(403, "Invalid origin"); }
        if (host !== (request.headers.host ?? request.headers[":authority"])) throw new HttpError(403, "Cross-origin request refused");
      }
      const credentials = {};
      for (const field of ["authorization", "cookie"]) if (typeof request.headers[field] === "string") credentials[field] = request.headers[field];
      if (!credentials.authorization && !credentials.cookie) throw new HttpError(401, "Authentication required");
      const identity = await fetchImpl(`${base}/api/my/profile`, { headers: credentials, redirect: "error", signal: AbortSignal.timeout(8000) });
      if (!identity.ok) throw new HttpError([401, 403].includes(identity.status) ? identity.status : 502, "Octos identity unavailable");
      const payload = await limitedJson(identity.body, 2 * 1024 * 1024).catch(() => { throw new HttpError(502, "Octos identity unavailable"); });
      const profile = payload?.profile?.profile ?? payload?.profile ?? payload;
      const owner = profile?.id;
      if (typeof owner !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(owner)) throw new HttpError(502, "Octos identity unavailable");
      // This is a consistency condition, never an account selector. Reject
      // stale device queues before their bodies can enter the new account.
      const expectedOwner = request.headers["x-learning-owner"];
      if (expectedOwner !== undefined && expectedOwner !== owner) throw new HttpError(409, "Learning record account changed; keep the original local queue");
      const path = url.pathname.slice(PREFIX.length).split("/").filter(Boolean).map(decodeURIComponent);
      if (path[0] === "report-comments") {
        const comments = new ReportCommentStore(store(), mappings);
        const post = async (allowed, max = 2048) => {
          if (url.search || request.method !== "POST") throw new HttpError(400, "Invalid report comment request");
          const body = await limitedJson(request, max);
          if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) throw new HttpError(400, "Invalid report comment fields");
          return body;
        };
        let result;
        if (request.method === "GET" && path.length === 1 && !url.search) result = comments.settings(owner);
        else if (path.length === 2 && path[1] === "settings") result = comments.configure(owner, await post(["enabled"]));
        else if (path.length === 2 && path[1] === "controls" && request.method === "GET" && !url.search) result = { controls: await reportControls.list(owner) };
        else if (path.length === 3 && path[1] === "controls" && /^[a-f0-9]{64}$/.test(path[2])) {
          if (request.method === "DELETE" && !url.search) { await reportControls.remove(owner, path[2]); result = { removed: true }; }
          else {
            const body = await post(["lease_id", "control"], 8192);
            const job = store().db.prepare("SELECT id FROM report_comment_jobs WHERE owner=? AND id=? AND state='leased' AND lease_id=?").get(owner, path[2], body.lease_id);
            if (!job) throw new HttpError(409, "Report comment lease changed");
            await reportControls.put(owner, path[2], body.control); result = { recorded: true };
          }
        } else if (path.length === 2 && path[1] === "claim") {
          const body = await post(["utc_offset_minutes"]);
          if (!Number.isSafeInteger(body.utc_offset_minutes) || body.utc_offset_minutes < -720 || body.utc_offset_minutes > 840) throw new HttpError(400, "Invalid UTC offset");
          result = comments.claim(owner, body.utc_offset_minutes);
        } else if (path.length === 3 && path[1] === "jobs" && /^[a-f0-9]{64}$/.test(path[2]) && request.method === "GET" && !url.search) {
          const job = comments.job(owner, path[2]);
          if (!job) throw new HttpError(404, "Report comment task unavailable");
          result = { job };
        } else if (path.length === 4 && path[1] === "jobs" && /^[a-f0-9]{64}$/.test(path[2])) {
          const body = await post(["lease_id", "execution", "result"], 16 * 1024);
          if (typeof body.lease_id !== "string" || !/^[a-f0-9-]{36}$/.test(body.lease_id)) throw new HttpError(400, "Invalid report comment lease");
          if (path[3] === "execution" && Object.keys(body).every(key => ["lease_id", "execution"].includes(key))) result = comments.execution(owner, path[2], body.lease_id, body.execution);
          else if (path[3] === "result" && Object.keys(body).every(key => ["lease_id", "result"].includes(key))) result = comments.complete(owner, path[2], body.lease_id, body.result);
          else if (path[3] === "pause" && Object.keys(body).length === 1) result = comments.pause(owner, path[2], body.lease_id);
          else if (path[3] === "reject" && Object.keys(body).length === 1) result = comments.reject(owner, path[2], body.lease_id);
          else throw new HttpError(400, "Invalid report comment operation");
        } else throw new HttpError(404, "Unknown report comment endpoint");
        send(200, { profile_id: owner, ...result });
      } else if (path[0] === "analysis") {
        const analysis = new TopicAnalysisStore(store());
        const post = async (allowed, max = 2048) => {
          if (url.search || request.method !== "POST") throw new HttpError(400, "Invalid analysis request");
          const body = await limitedJson(request, max);
          if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) throw new HttpError(400, "Invalid analysis fields");
          return body;
        };
        let result;
        if (request.method === "GET" && path.length === 1 && !url.search) result = analysis.status(owner);
        else if (path.length === 2 && path[1] === "controls" && request.method === "GET" && !url.search) result = { controls: await controls.list(owner) };
        else if (path.length === 3 && path[1] === "controls" && /^[a-f0-9]{64}$/.test(path[2])) {
          if (request.method === "DELETE" && !url.search) { await controls.remove(owner, path[2]); result = { removed: true }; }
          else {
            const body = await post(["lease_id", "control"], 8192);
            const job = store().db.prepare("SELECT id FROM topic_analysis_jobs WHERE owner=? AND id=? AND state='leased' AND lease_id=?").get(owner, path[2], body.lease_id);
            if (!job) throw new HttpError(409, "Analysis lease changed");
            await controls.put(owner, path[2], body.control); result = { recorded: true };
          }
        }
        else if (path.length === 2 && path[1] === "settings") result = analysis.configure(owner, await post(["enabled", "max_daily_tasks"]));
        else if (path.length === 2 && path[1] === "seed") {
          const body = await post(["after"]);
          if (!Number.isSafeInteger(body.after) || body.after < 0) throw new HttpError(400, "Invalid analysis cursor");
          result = analysis.seed(owner, body.after);
        } else if (path.length === 2 && path[1] === "claim") { await post([]); result = analysis.claim(owner); }
        else if (path.length === 2 && path[1] === "reanalyze") {
          const body = await post(["event_id"]);
          if (typeof body.event_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(body.event_id)) throw new HttpError(400, "Invalid source event");
          result = analysis.reanalyze(owner, body.event_id);
        } else if (path.length === 2 && path[1] === "catalog" && request.method === "GET") {
          if ([...url.searchParams.keys()].some(key => !["query", "ids", "limit"].includes(key)) || url.searchParams.getAll("query").length > 1 || url.searchParams.getAll("ids").length > 1
            || url.searchParams.has("query") === url.searchParams.has("ids")) throw new HttpError(400, "Choose one catalog query");
          const catalog = topicCatalog(), limit = integer(url.searchParams, "limit", 8, 12);
          if (!limit) throw new HttpError(400, "Invalid catalog limit");
          const ids = url.searchParams.get("ids")?.split(",");
          if (ids && (ids.length > 12 || ids.some(id => !/^mt_[A-Za-z0-9_-]+$/.test(id)))) throw new HttpError(400, "Invalid topic identifiers");
          const query = url.searchParams.get("query");
          if (query !== null && query.length > 256) throw new HttpError(400, "Catalog query too long");
          result = { taxonomy: catalog.metadata, topics: ids ? catalog.read(ids) : catalog.search(query, limit) };
        } else if (path.length === 3 && path[1] === "results" && request.method === "GET" && /^\d+$/.test(path[2]) && !url.search) {
          const row = store().db.prepare(`SELECT r.seq,r.source_event_id,r.result_json,j.octos_session_id,j.octos_turn_id,j.input_sha256,j.revision FROM topic_analysis_results r
            JOIN topic_analysis_jobs j ON j.owner=r.owner AND j.id=r.job_id WHERE r.owner=? AND r.seq=?`).get(owner, Number(path[2]));
          if (!row) throw new HttpError(404, "Analysis result unavailable");
          const { result_json, ...metadata } = row; result = { ...metadata, result: JSON.parse(result_json) };
        } else if (path.length === 3 && path[1] === "jobs" && /^[a-f0-9]{64}$/.test(path[2]) && request.method === "GET" && !url.search) {
          const job = store().db.prepare("SELECT id,state,source_event_id FROM topic_analysis_jobs WHERE owner=? AND id=?").get(owner, path[2]);
          if (!job) throw new HttpError(404, "Analysis task unavailable");
          result = { job };
        } else if (path.length === 4 && path[1] === "jobs" && /^[a-f0-9]{64}$/.test(path[2])) {
          const body = await post(["lease_id", "execution", "result", "reason", "detail"], 1024 * 1024);
          if (typeof body.lease_id !== "string" || !/^[a-f0-9-]{36}$/.test(body.lease_id)) throw new HttpError(400, "Invalid analysis lease");
          if (path[3] === "execution" && Object.keys(body).every(key => ["lease_id", "execution"].includes(key))) result = analysis.execution(owner, path[2], body.lease_id, body.execution);
          else if (path[3] === "result" && Object.keys(body).every(key => ["lease_id", "result"].includes(key))) result = analysis.complete(owner, path[2], body.lease_id, body.result);
          else if (path[3] === "pause" && Object.keys(body).length === 1) result = analysis.pause(owner, path[2], body.lease_id);
          else if (path[3] === "reject" && Object.keys(body).every(key => ["lease_id", "reason", "detail"].includes(key))) result = analysis.reject(owner, path[2], body.lease_id, body.reason, body.detail);
          else throw new HttpError(400, "Invalid analysis operation");
        } else throw new HttpError(404, "Unknown analysis endpoint");
        send(200, { profile_id: owner, ...result });
      } else if (request.method === "POST" && path.length === 1 && path[0] === "events") {
        if (url.search) throw new HttpError(400, "Unexpected query");
        const body = await limitedJson(request, 8 * 1024 * 1024);
        if (!body || Object.keys(body).some(key => !["events", "materials"].includes(key)) || !Array.isArray(body.events) || !body.events.length || body.events.length > HISTORY_BATCH_LIMIT
          || (body.materials !== undefined && (!Array.isArray(body.materials) || body.materials.length > body.events.length))) throw new HttpError(400, "Invalid event batch");
        send(200, { profile_id: owner, ...store().append(owner, body.events, body.materials) });
      } else if (request.method === "GET" && path.length === 1 && ["map", "achievements"].includes(path[0])) {
        if ([...url.searchParams.keys()].some(key => key !== "utc_offset_minutes") || url.searchParams.getAll("utc_offset_minutes").length > 1) throw new HttpError(400, "Unknown query field");
        const raw = url.searchParams.get("utc_offset_minutes") ?? "0";
        if (!/^-?\d{1,3}$/.test(raw) || Number(raw) < -720 || Number(raw) > 840) throw new HttpError(400, "Invalid UTC offset");
        const utcOffsetMinutes = Number(raw);
        send(200, { profile_id: owner, ...(path[0] === "map" ? queryLearningMap(store(), owner, { utcOffsetMinutes }, mappings) : evaluateAchievements(store(), owner, { utcOffsetMinutes }, mappings)) });
      } else if (path[0] === "suggestions" && ((request.method === "GET" && path.length === 1) || (request.method === "POST" && path.length === 2 && path[1] === "dismiss"))) {
        if (request.method === "POST") {
          if (url.search) throw new HttpError(400, "Unexpected query");
          const body = await limitedJson(request, 1024);
          if (!body || Object.keys(body).length !== 1 || typeof body.id !== "string"
            || !/^(continue|foundation|next|revisit):mt_[A-Za-z0-9_-]{1,64}:(mt_[A-Za-z0-9_-]{1,64})?$/.test(body.id)) throw new HttpError(400, "Invalid suggestion");
          send(200, { profile_id: owner, ...dismissSuggestion(store(), owner, body.id) });
        } else {
          if ([...url.searchParams.keys()].some(key => key !== "utc_offset_minutes") || url.searchParams.getAll("utc_offset_minutes").length > 1) throw new HttpError(400, "Unknown query field");
          const raw = url.searchParams.get("utc_offset_minutes") ?? "0";
          if (!/^-?\d{1,3}$/.test(raw) || Number(raw) < -720 || Number(raw) > 840) throw new HttpError(400, "Invalid UTC offset");
          send(200, { profile_id: owner, ...querySuggestions(store(), owner, { utcOffsetMinutes: Number(raw) }, mappings) });
        }
      } else if (request.method === "GET" && path.length === 1 && path[0] === "report") {
        if ([...url.searchParams.keys()].some(key => !["week_start", "utc_offset_minutes"].includes(key))
          || url.searchParams.getAll("week_start").length !== 1 || url.searchParams.getAll("utc_offset_minutes").length > 1) throw new HttpError(400, "Unknown query field");
        const raw = url.searchParams.get("utc_offset_minutes") ?? "0", weekStart = url.searchParams.get("week_start");
        if (!/^-?\d{1,3}$/.test(raw) || Number(raw) < -720 || Number(raw) > 840) throw new HttpError(400, "Invalid UTC offset");
        if (!isWeekStart(weekStart)) throw new HttpError(400, "Week must start on a Monday");
        const report = queryWeeklyReport(store(), owner, { weekStart, utcOffsetMinutes: Number(raw) }, mappings);
        const teacherId = store().teacherChoice(owner)?.teacher_id ?? "alan";
        send(200, { profile_id: owner, ...report, comment: new ReportCommentStore(store(), mappings).commentFor(owner, report, teacherId), comment_teacher_id: teacherId });
      } else if (path.length === 1 && path[0] === "teacher-choice" && !url.search && ["GET", "PUT"].includes(request.method)) {
        if (request.method === "GET") send(200, { profile_id: owner, choice: store().teacherChoice(owner) });
        else {
          const body = await limitedJson(request, 1024);
          if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["teacher_id", "base_revision"].includes(key))) throw new HttpError(400, "Invalid teacher choice");
          send(200, { profile_id: owner, ...store().chooseTeacher(owner, body.teacher_id, body.base_revision) });
        }
      } else if (request.method === "GET" && path.length === 2 && path[0] === "materials") {
        if (url.search || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(path[1])) throw new HttpError(400, "Invalid material query");
        const material = store().courseMaterial(owner, path[1]);
        if (!material) throw new HttpError(404, "No preserved course material for this delivery");
        send(200, { profile_id: owner, material });
      } else if (request.method === "POST" && path.join("/") === "deliveries/claim") {
        if (url.search) throw new HttpError(400, "Unexpected query");
        const body = await limitedJson(request, 1024);
        if (!body || Object.keys(body).some(key => key !== "limit") || !Number.isSafeInteger(body.limit) || body.limit < 1 || body.limit > 20) throw new HttpError(400, "Invalid claim");
        send(200, { profile_id: owner, ...store().claimDeliveries(owner, body.limit) });
      } else if (request.method === "POST" && path.length === 3 && path[0] === "deliveries" && path[2] === "receipt") {
        if (url.search) throw new HttpError(400, "Unexpected query");
        const body = await limitedJson(request, 1024);
        if (!body || Object.keys(body).some(key => !["lease_id", "seq"].includes(key))
          || typeof body.lease_id !== "string" || !/^[a-f0-9-]{36}$/.test(body.lease_id)
          || !Number.isSafeInteger(body.seq) || body.seq < 0) throw new HttpError(400, "Invalid receipt");
        send(200, { profile_id: owner, ...store().acknowledgeDelivery(owner, path[1], body.lease_id, body.seq) });
      } else if (request.method === "GET" && path.join("/") === "deliveries") {
        if (url.search) throw new HttpError(400, "Unexpected query");
        send(200, { profile_id: owner, states: store().deliveryStatus(owner), probe_session_id: store().deliveryProbeSession(owner), pending_session_deletions: store().pendingSessionDeletions(owner) });
      } else if (request.method === "GET" && ((path[0] === "topics" && path.length === 2) || (path[0] === "runs" && path.length === 3 && path[2] === "coverage"))) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(path[1])) throw new HttpError(400, "Invalid record identifier");
        if ([...url.searchParams.keys()].some(key => !(path[0] === "topics" ? ["limit", "through", "analysis_through", "after", "from", "until"] : ["through"]).includes(key))) throw new HttpError(400, "Unknown query field");
        const options = { limit: integer(url.searchParams, "limit", 50, 100), after: integer(url.searchParams, "after", 0),
          through: Math.min(integer(url.searchParams, "through", store().upperBound(owner)), store().upperBound(owner)) };
        if (!options.limit) throw new HttpError(400, "Invalid limit");
        if (path[0] === "topics" && url.searchParams.has("analysis_through")) options.analysis_through = integer(url.searchParams, "analysis_through", 0);
        for (const field of ["from", "until"]) {
          const values = url.searchParams.getAll(field);
          if (values.length > 1 || (values.length && (!Number.isFinite(Date.parse(values[0])) || new Date(values[0]).toISOString() !== values[0]))) throw new HttpError(400, "Use one UTC ISO timestamp per time boundary");
          if (values.length) options[field] = values[0];
        }
        if (options.from && options.until && options.from >= options.until) throw new HttpError(400, "Invalid time range");
        send(200, path[0] === "topics" ? queryTopic(store(), owner, path[1], options) : queryRunCoverage(store(), owner, path[1], options));
      } else if (request.method === "GET" && ["runs", "changes"].includes(path[0])) {
        if ([...url.searchParams.keys()].some(key => !["limit", "through", "after", "before"].includes(key))) throw new HttpError(400, "Unknown query field");
        const options = { limit: integer(url.searchParams, "limit", 20, 100),
          through: Math.min(integer(url.searchParams, "through", store().upperBound(owner)), store().upperBound(owner)),
          after: integer(url.searchParams, "after", 0), before: integer(url.searchParams, "before", Number.MAX_SAFE_INTEGER) };
        if (!options.limit) throw new HttpError(400, "Invalid limit");
        if (path[0] === "changes" && path.length === 1) send(200, store().changes(owner, options));
        else if (path[0] === "runs" && path.length === 1) send(200, store().listRuns(owner, options));
        else if (path[0] === "runs" && path.length === 2 && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(path[1])) send(200, store().runEvents(owner, path[1], options));
        else throw new HttpError(404, "Unknown history endpoint");
      } else if (request.method === "DELETE" && path[0] === "sessions" && path.length === 2 && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(path[1])) {
        if (url.search) throw new HttpError(400, "Unexpected query");
        const body = await limitedJson(request, 1024);
        if (!body || Object.keys(body).some(key => key !== "delete_octos_session") || typeof body.delete_octos_session !== "boolean") throw new HttpError(400, "Invalid deletion scope");
        send(200, { profile_id: owner, ...store().deleteSession(owner, path[1], body.delete_octos_session) });
      } else if (request.method === "POST" && path.join("/") === "session-deletions/claim") {
        if (url.search) throw new HttpError(400, "Unexpected query");
        const body = await limitedJson(request, 1024);
        if (!body || Object.keys(body).some(key => key !== "limit") || !Number.isSafeInteger(body.limit) || body.limit < 1 || body.limit > 20) throw new HttpError(400, "Invalid claim");
        send(200, { profile_id: owner, ...store().claimSessionDeletions(owner, body.limit) });
      } else if (request.method === "POST" && path.length === 3 && path[0] === "session-deletions" && path[2] === "receipt") {
        if (url.search) throw new HttpError(400, "Unexpected query");
        const body = await limitedJson(request, 1024);
        if (!body || Object.keys(body).some(key => key !== "lease_id") || typeof body.lease_id !== "string" || !/^[a-f0-9-]{36}$/.test(body.lease_id)) throw new HttpError(400, "Invalid receipt");
        send(200, { profile_id: owner, ...store().acknowledgeSessionDeletion(owner, path[1], body.lease_id) });
      } else if (request.method === "DELETE" && path[0] === "runs" && path.length === 2 && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(path[1])) {
        if (url.search) throw new HttpError(400, "Unexpected query");
        send(200, store().deleteRun(owner, path[1]));
      } else throw new HttpError(404, "Unknown history endpoint");
    } catch (error) {
      const busy = [5, 6].includes(error?.errcode & 255);
      const known = error instanceof HttpError || error instanceof HistoryValidationError || error instanceof HistorySnapshotChanged;
      const status = error instanceof HttpError ? error.status : error instanceof HistoryValidationError ? 400 : error instanceof HistorySnapshotChanged ? 409 : busy ? 503 : 502;
      send(status, { error: known ? error.message : busy ? "History storage busy; retry the same events" : "History service unavailable; saved events can be retried" });
    }
    return true;
  };
  handle.close = () => { if (!suppliedStore) storage?.close(); };
  return handle;
}

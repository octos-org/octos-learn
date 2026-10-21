import { join } from "node:path";
import { homedir } from "node:os";
import { HistoryStore, HistorySnapshotChanged } from "./store.mjs";
import { HISTORY_BATCH_LIMIT, HistoryValidationError } from "./event-contract.mjs";

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

export function createHistoryHandler({ octosBaseUrl = "http://127.0.0.1:50080", databasePath = join(homedir(), ".octos-learn/learning/history.sqlite"), fetchImpl = fetch, store: suppliedStore } = {}) {
  const base = new URL(octosBaseUrl).origin;
  let storage = suppliedStore;
  const store = () => storage ??= new HistoryStore(databasePath);
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
      if (request.method === "POST" && path.length === 1 && path[0] === "events") {
        if (url.search) throw new HttpError(400, "Unexpected query");
        const body = await limitedJson(request, 1024 * 1024);
        if (!body || Object.keys(body).some(key => key !== "events") || !Array.isArray(body.events) || !body.events.length || body.events.length > HISTORY_BATCH_LIMIT) throw new HttpError(400, "Invalid event batch");
        send(200, { profile_id: owner, ...store().append(owner, body.events) });
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
        send(200, { profile_id: owner, states: store().deliveryStatus(owner) });
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

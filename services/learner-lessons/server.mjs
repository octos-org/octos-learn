import { join } from "node:path";
import { homedir } from "node:os";
import { LearnerLessonStore, LessonError, LESSON_ID, DRAFT_MAX_BYTES } from "./store.mjs";
import { LearnerPackageError, PACKAGE_MAX_BYTES } from "./package-check.mjs";

// Lessons learners teach, kept per Octos profile. The account comes from
// Octos on every request, as for the learning history; nothing here trusts
// an owner the device names. Saving a lesson records it in the learning
// history (`history`), which is how the star map and achievements see it.
const PREFIX = "/api/learn/lessons";

async function limitedBody(stream, max) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk); size += buffer.length;
    if (size > max) throw new LessonError(413, "Request too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
async function limitedJson(stream, max) {
  try { return JSON.parse((await limitedBody(stream, max)).toString("utf8")); }
  catch (error) { if (error instanceof LessonError) throw error; throw new LessonError(400, "Invalid JSON"); }
}

export function createLearnerLessonsHandler({ octosBaseUrl = "http://127.0.0.1:50080", databasePath = join(homedir(), ".octos-learn/learning/learner-lessons.sqlite"),
  fetchImpl = fetch, store: suppliedStore, history } = {}) {
  const base = new URL(octosBaseUrl).origin;
  let storage = suppliedStore;
  const store = () => storage ??= new LearnerLessonStore(databasePath);
  // The history may be briefly unavailable; the lesson is kept and the record catches up on the next request.
  const reconcile = owner => {
    if (!history) return false;
    try { store().reconcileHistory(owner, history()); return false; }
    catch { return true; }
  };
  const handle = async (request, response) => {
    const url = new URL(request.url, "http://local");
    if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;
    const headers = { "cache-control": "no-store, max-age=0", vary: "Authorization, Cookie" };
    const send = (status, value) => {
      if (response.destroyed) return;
      response.writeHead(status, { ...headers, "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(value));
    };
    try {
      const origin = request.headers.origin;
      if (origin) {
        let host;
        try { host = new URL(origin).host; } catch { throw new LessonError(403, "Invalid origin"); }
        if (host !== (request.headers.host ?? request.headers[":authority"])) throw new LessonError(403, "Cross-origin request refused");
      }
      const credentials = {};
      for (const field of ["authorization", "cookie"]) if (typeof request.headers[field] === "string") credentials[field] = request.headers[field];
      if (!credentials.authorization && !credentials.cookie) throw new LessonError(401, "Authentication required");
      const identity = await fetchImpl(`${base}/api/my/profile`, { headers: credentials, redirect: "error", signal: AbortSignal.timeout(8000) });
      if (!identity.ok) throw new LessonError([401, 403].includes(identity.status) ? identity.status : 502, "Octos identity unavailable");
      const payload = await limitedJson(identity.body, 2 * 1024 * 1024).catch(() => { throw new LessonError(502, "Octos identity unavailable"); });
      const profile = payload?.profile?.profile ?? payload?.profile ?? payload;
      const owner = profile?.id;
      if (typeof owner !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(owner)) throw new LessonError(502, "Octos identity unavailable");
      const expectedOwner = request.headers["x-learning-owner"];
      if (expectedOwner !== undefined && expectedOwner !== owner) throw new LessonError(409, "Account changed; keep this device's drafts");
      if (url.search) throw new LessonError(400, "Unexpected query");

      const path = url.pathname.slice(PREFIX.length).split("/").filter(Boolean).map(decodeURIComponent);
      const [lessonId, part] = path;
      if (lessonId !== undefined && !LESSON_ID.test(lessonId)) throw new LessonError(400, "Invalid lesson id");
      const method = request.method;
      if (!path.length && method === "GET") {
        const historyPending = reconcile(owner);
        send(200, { profile_id: owner, lessons: store().list(owner), history_pending: historyPending });
      } else if (path.length === 1 && method === "GET") send(200, { profile_id: owner, lesson: store().read(owner, lessonId) });
      else if (path.length === 1 && method === "DELETE") {
        const result = store().delete(owner, lessonId);
        send(200, { profile_id: owner, ...result, history_pending: reconcile(owner) });
      } else if (path.length === 2 && part === "draft" && method === "PUT") {
        const body = await limitedJson(request, DRAFT_MAX_BYTES + 4096);
        if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).sort().join() !== "base_revision,ink,recording"
          || !(body.base_revision === null || (Number.isSafeInteger(body.base_revision) && body.base_revision > 0))) throw new LessonError(400, "Invalid lesson draft");
        const result = store().putDraft(owner, lessonId, body);
        send(result.status === "conflict" ? 409 : 200, { profile_id: owner, ...result });
      } else if (path.length === 2 && part === "package" && method === "PUT") {
        if (!/^application\/(zip|octet-stream)$/.test(request.headers["content-type"] ?? "")) throw new LessonError(415, "Send the lesson package as application/zip");
        const lesson = store().save(owner, lessonId, await limitedBody(request, PACKAGE_MAX_BYTES));
        send(200, { profile_id: owner, lesson, history_pending: reconcile(owner) });
      } else if (path.length === 2 && part === "package" && method === "GET") {
        const { archive, content_sha256: digest } = store().packageOf(owner, lessonId);
        response.writeHead(200, { ...headers, "content-type": "application/zip", "content-length": archive.length, etag: `"${digest}"` });
        response.end(archive);
      } else if (path.length === 2 && part === "export" && method === "GET") send(200, { profile_id: owner, ...store().exportLesson(owner, lessonId) });
      else if (path.length === 2 && part === "withdraw" && method === "POST") send(200, { profile_id: owner, lesson: store().transition(owner, lessonId, "withdraw", "owner") });
      else throw new LessonError(404, "Unknown lessons endpoint");
    } catch (error) {
      const busy = [5, 6].includes(error?.errcode & 255);
      const status = error instanceof LessonError ? error.status : error instanceof LearnerPackageError ? 422 : busy ? 503 : 502;
      send(status, { error: error instanceof LessonError || error instanceof LearnerPackageError ? error.message : busy ? "Lesson storage busy; try again" : "Lesson service unavailable" });
    }
    return true;
  };
  handle.close = () => { if (!suppliedStore) storage?.close(); };
  return handle;
}

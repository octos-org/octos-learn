import { createServer } from "node:http";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createByokHandler } from "./byok/server.mjs";
import { createHistoryHandler } from "./learning-history/server.mjs";
import { HistoryStore } from "./learning-history/store.mjs";
import { createLearnerLessonsHandler } from "./learner-lessons/server.mjs";

export function createProductHandler(options = {}) {
  const byok = createByokHandler(options);
  // Saved learner lessons record "taught" facts in the same history the map and achievements read.
  const historyDatabasePath = options.historyDatabasePath ?? join(homedir(), ".octos-learn/learning/history.sqlite");
  let historyStore;
  const sharedHistory = () => historyStore ??= new HistoryStore(historyDatabasePath);
  const history = createHistoryHandler({ ...options, databasePath: historyDatabasePath, sharedStore: sharedHistory });
  const lessons = createLearnerLessonsHandler({ ...options, store: undefined,
    databasePath: options.lessonsDatabasePath ?? join(dirname(historyDatabasePath), "learner-lessons.sqlite"), history: sharedHistory });
  const handler = async (request, response) => await history(request, response) || await lessons(request, response) || await byok(request, response);
  handler.close = () => { history.close(); lessons.close(); historyStore?.close(); };
  return handler;
}

export function createProductServer(options = {}) {
  const handle = createProductHandler(options);
  const server = createServer((request, response) => {
    void handle(request, response).then(handled => {
      if (!handled) { response.writeHead(404); response.end(); }
    }).catch(() => {
      if (!response.headersSent) response.writeHead(500, { "content-type": "application/json" });
      response.end('{"error":"Product service unavailable"}');
    });
  });
  server.once("close", handle.close);
  return server;
}

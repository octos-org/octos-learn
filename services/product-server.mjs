import { createServer } from "node:http";
import { createByokHandler } from "./byok/server.mjs";
import { createHistoryHandler } from "./learning-history/server.mjs";

export function createProductHandler(options = {}) {
  const byok = createByokHandler(options);
  const history = createHistoryHandler({ ...options, databasePath: options.historyDatabasePath });
  const handler = async (request, response) => await history(request, response) || await byok(request, response);
  handler.close = () => history.close();
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

import type { IncomingMessage, ServerResponse } from "node:http";
export interface HistoryOptions { octosBaseUrl?: string; databasePath?: string }
export function createHistoryHandler(options?: HistoryOptions): ((request: IncomingMessage, response: ServerResponse) => Promise<boolean>) & { close(): void };

import type { IncomingMessage, ServerResponse, Server } from "node:http";
import type { ByokOptions } from "./byok/server.mjs";
export interface ProductOptions extends ByokOptions { historyDatabasePath?: string }
export function createProductHandler(options?: ProductOptions): ((request: IncomingMessage, response: ServerResponse) => Promise<boolean>) & { close(): void };
export function createProductServer(options?: ProductOptions): Server;

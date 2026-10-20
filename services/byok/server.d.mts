import type { IncomingMessage, ServerResponse, Server } from "node:http";
export interface ByokOptions { octosBaseUrl?: string; registryRoot?: string; migrateLegacy?: boolean }
export function createByokHandler(options?: ByokOptions): (request: IncomingMessage, response: ServerResponse) => Promise<boolean>;
export function createByokServer(options?: ByokOptions): Server;

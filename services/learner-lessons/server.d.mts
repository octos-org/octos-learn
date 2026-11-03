import type { IncomingMessage, ServerResponse } from "node:http";
export interface LearnerLessonsOptions { octosBaseUrl?: string; databasePath?: string; history?: () => unknown }
export function createLearnerLessonsHandler(options?: LearnerLessonsOptions): ((request: IncomingMessage, response: ServerResponse) => Promise<boolean>) & { close(): void };

import type { MemoryEntry } from "./memory-entries";

export type MemoryOperation = "remember" | "correct" | "forget";

/** A request Octos accepted but this device has not yet seen take effect.
 * Octos only acknowledges admission; the effect is judged by reading memory
 * again after its next consolidation. */
export interface PendingMemoryRequest {
  request_id: string;
  operation: MemoryOperation;
  entry_id?: string;
  content?: string;
  /** The targeted entry's text when the request was made. */
  original_text?: string;
  /** All entry texts when the request was made, to notice any change. */
  snapshot: string;
  submitted_at: string;
  failed?: boolean;
}

const storageKey = (profileId: string) => `octos-learn-memory-requests:${profileId}`;

export function loadPendingRequests(profileId: string): PendingMemoryRequest[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(profileId)) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export function savePendingRequests(profileId: string, pending: PendingMemoryRequest[]) {
  try {
    if (pending.length) localStorage.setItem(storageKey(profileId), JSON.stringify(pending));
    else localStorage.removeItem(storageKey(profileId));
  } catch { /* the list still shows this session's requests */ }
}

export function memorySnapshot(entries: MemoryEntry[]): string {
  return entries.map((entry) => `${entry.id ?? ""}\u0000${entry.text}`).join("\u0001");
}

/** Drop requests that took effect; mark the ones a later consolidation left
 * unchanged as failed. `updatedAt` is when Octos last rewrote memory. */
export function reconcileRequests(pending: PendingMemoryRequest[], entries: MemoryEntry[], updatedAt: string | undefined): PendingMemoryRequest[] {
  const consolidated = (request: PendingMemoryRequest) =>
    Boolean(updatedAt) && Date.parse(updatedAt!) > Date.parse(request.submitted_at);
  return pending.flatMap((request) => {
    let done: boolean;
    if (request.operation === "remember") {
      done = consolidated(request) && memorySnapshot(entries) !== request.snapshot;
    } else {
      const entry = entries.find((candidate) => candidate.id === request.entry_id);
      done = !entry || (request.operation === "correct" && entry.text !== request.original_text);
    }
    if (done) return [];
    return [consolidated(request) ? { ...request, failed: true } : request];
  });
}

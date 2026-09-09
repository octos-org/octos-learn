/** The RPC outcome, not file discovery, authorizes selection delivery. */
export type SelectionRequestStatus = "pending" | "accepted" | "timed-out";

export class SelectionRequestState {
  private readonly statuses = new Map<string, SelectionRequestStatus>();
  private readonly sessionId: string;
  private readonly storage: Storage;

  constructor(
    sessionId: string,
    storage: Storage = localStorage,
  ) {
    this.sessionId = sessionId;
    this.storage = storage;
  }

  private key(turnId: string): string {
    return `octos-selection-request:v1:${encodeURIComponent(this.sessionId)}:${encodeURIComponent(turnId)}`;
  }

  status(turnId: string): SelectionRequestStatus | null {
    const memory = this.statuses.get(turnId);
    let persisted: string | null;
    try {
      persisted = this.storage.getItem(this.key(turnId));
    } catch {
      // Storage failure must not turn a known pending/expired turn into success.
      return memory ?? "pending";
    }
    if (persisted === "timed-out" || memory === "timed-out") return "timed-out";
    if (persisted === "pending" || persisted === "accepted") return persisted;
    return memory ?? (persisted === null ? null : "pending");
  }

  private write(turnId: string, status: SelectionRequestStatus): void {
    this.storage.setItem(this.key(turnId), status);
    this.statuses.set(turnId, status);
  }

  begin(turnId: string): void {
    if (this.status(turnId) !== null) throw new Error("选区请求编号已使用，请重新提问。");
    // Refuse to send if we cannot persist the delivery barrier first.
    this.write(turnId, "pending");
  }

  accept(turnId: string): boolean {
    if (this.status(turnId) !== "pending") return false;
    this.write(turnId, "accepted");
    return true;
  }

  timeout(turnId: string): void {
    if (this.status(turnId) === "accepted") return;
    this.statuses.set(turnId, "timed-out");
    this.storage.setItem(this.key(turnId), "timed-out");
  }

  canConsume(turnId: string): boolean {
    const status = this.status(turnId);
    // Records created before this protocol remain readable.
    return status === null || status === "accepted";
  }
}

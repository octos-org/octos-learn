export class HttpError extends Error {
  constructor(status, message, retryAfter = undefined) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

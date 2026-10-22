/** Android WebView 101 supports AbortController but not AbortSignal.timeout. */
export function historyRequestTimeout(milliseconds: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(milliseconds);
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), milliseconds);
  return controller.signal;
}

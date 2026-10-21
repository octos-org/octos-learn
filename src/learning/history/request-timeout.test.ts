import { afterEach, expect, it, vi } from 'vitest';
import { verifyHistoryIdentity } from './synchronize';

const originalTimeout = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout')!;
afterEach(() => { Object.defineProperty(AbortSignal, 'timeout', originalTimeout); vi.useRealTimers(); });

it('verifies the owner and still bounds a stalled request without AbortSignal.timeout', async () => {
  vi.useFakeTimers();
  Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: undefined });
  expect(await verifyHistoryIdentity('', 'credential', async () => Response.json({ id: 'alice' })))
    .toEqual({ owner: 'alice', token: 'credential' });

  const stalled = verifyHistoryIdentity('', 'credential', (_input, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
  }));
  const rejected = expect(stalled).rejects.toMatchObject({ name: 'TimeoutError' });
  await vi.advanceTimersByTimeAsync(8000);
  await rejected;
});

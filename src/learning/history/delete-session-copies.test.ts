import { expect, it, vi } from 'vitest';
import { finishSessionDeletions } from './delete-session-copies';
import type { UiProtocolBridge } from '../../runtime/ui-protocol-bridge';
it('durable cleanup only uses the captured account and acknowledges an accepted delete RPC', async () => {
  let claimed = false;
  const bridge = { start: vi.fn(async () => undefined), stop: vi.fn(async () => undefined), callMethod: vi.fn(async () => ({})) } as unknown as UiProtocolBridge;
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer credential');
    if (String(url).endsWith('/claim')) {
      const tasks = claimed ? [] : [{ session_id: 'learn-deleted', lease_id: 'lease-one' }]; claimed = true;
      return Response.json({ profile_id: 'alice', tasks });
    }
    expect(JSON.parse(String(init?.body))).toEqual({ lease_id: 'lease-one' });
    return Response.json({ profile_id: 'alice', recorded: true });
  }) as unknown as typeof fetch;
  expect(await finishSessionDeletions({ owner: 'alice', token: 'credential' }, '', { createBridge: () => bridge, fetcher })).toBe(1);
  expect(bridge.callMethod).toHaveBeenCalledWith('session/delete', { session_id: 'learn-deleted' });
  expect(bridge.stop).toHaveBeenCalledOnce();
});
it('leaves a lost-delete-reply task unacknowledged for idempotent retry', async () => {
  const bridge = { start: vi.fn(async () => undefined), stop: vi.fn(async () => undefined), callMethod: vi.fn(async () => { throw new Error('reply lost'); }) } as unknown as UiProtocolBridge;
  const fetcher = vi.fn(async () => Response.json({ profile_id: 'alice', tasks: [{ session_id: 'learn-deleted', lease_id: 'lease-one' }] }));
  await expect(finishSessionDeletions({ owner: 'alice', token: 'credential' }, '', { createBridge: () => bridge, fetcher })).rejects.toThrow('reply lost');
  expect(fetcher).toHaveBeenCalledOnce(); expect(bridge.stop).toHaveBeenCalledOnce();
});
it('keeps the current delete receipt but yields before the next leased task when teaching starts', async () => {
  let idle = true;
  const bridge = { start: vi.fn(async () => undefined), stop: vi.fn(async () => undefined), callMethod: vi.fn(async () => ({})) } as unknown as UiProtocolBridge;
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    if (String(url).endsWith('/claim')) return Response.json({ profile_id: 'alice', tasks: [{ session_id: 'first', lease_id: 'lease-one' }, { session_id: 'second', lease_id: 'lease-two' }] });
    expect(String(url)).toContain('/session-deletions/first/receipt'); idle = false;
    return Response.json({ profile_id: 'alice', recorded: true });
  }) as unknown as typeof fetch;
  expect(await finishSessionDeletions({ owner: 'alice', token: 'credential' }, '', { createBridge: () => bridge, fetcher, canContinue: () => idle })).toBe(1);
  expect(bridge.callMethod).toHaveBeenCalledOnce(); expect(fetcher).toHaveBeenCalledTimes(2); expect(bridge.stop).toHaveBeenCalledOnce();
});

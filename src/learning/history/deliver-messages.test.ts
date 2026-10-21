import { expect, it, vi } from 'vitest';
import { deliverHistoryMessages, type HistoryDeliveryTask } from './deliver-messages';
import type { UiProtocolBridge } from '../../runtime/ui-protocol-bridge';
const identity = { owner: 'alice', token: 'captured-a' };
const task: HistoryDeliveryTask = { id: 'event', lease_id: 'lease', message: { session_id: 'learn-one', role: 'user', content: '原问题', media: [], source: 'external_record:octos-learn', client_message_id: 'learn:user:q-1' } };
function bridge(supported = true) {
  return { start: vi.fn(async () => undefined), stop: vi.fn(async () => undefined), supportsFullHistoryAppendRetry: () => supported,
    callMethod: vi.fn(async () => ({ session_id: 'learn-one', seq: 0, thread_id: 'learn:user:q-1' })),
  } as unknown as UiProtocolBridge;
}
it('leaves tasks untouched when Octos does not acknowledge safe old-message retries', async () => {
  const fetcher = vi.fn(); const connection = bridge(false);
  expect(await deliverHistoryMessages(identity, '', { createBridge: () => connection, fetcher })).toEqual({ status: 'waiting-for-octos', delivered: 0 });
  expect(fetcher).not.toHaveBeenCalled(); expect(connection.callMethod).not.toHaveBeenCalled(); expect(connection.stop).toHaveBeenCalledOnce();
});
it('transmits only persisted original messages and records the correlated receipt', async () => {
  let claimed = false;
  const connection = bridge();
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer captured-a');
    if (String(url).endsWith('/claim')) {
      const tasks = claimed ? [] : [task]; claimed = true;
      return Response.json({ profile_id: 'alice', tasks });
    }
    expect(JSON.parse(String(init?.body))).toEqual({ lease_id: 'lease', seq: 0 });
    return Response.json({ profile_id: 'alice', recorded: true });
  }) as unknown as typeof fetch;
  expect(await deliverHistoryMessages(identity, '', { createBridge: () => connection, fetcher })).toEqual({ status: 'idle', delivered: 1 });
  expect(connection.callMethod).toHaveBeenCalledWith('session/append_message', task.message);
});
it('does not acknowledge an uncertain write or a switched identity, and always closes its captured connection', async () => {
  const connection = bridge();
  vi.mocked(connection.callMethod).mockRejectedValue(new Error('reply lost'));
  const fetcher = vi.fn(async () => Response.json({ profile_id: 'alice', tasks: [task] }));
  await expect(deliverHistoryMessages(identity, '', { createBridge: () => connection, fetcher })).rejects.toThrow('reply lost');
  expect(fetcher).toHaveBeenCalledOnce(); expect(connection.stop).toHaveBeenCalledOnce();
  await expect(deliverHistoryMessages(identity, '', { createBridge: () => connection, fetcher, isCurrent: () => false })).rejects.toThrow('切换');
  expect(fetcher).toHaveBeenCalledOnce();
});

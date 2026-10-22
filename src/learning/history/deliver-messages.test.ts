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
  expect(await deliverHistoryMessages(identity, '', { probeSessionId: 'learn-one', createBridge: () => connection, fetcher })).toEqual({ status: 'waiting-for-octos', delivered: 0 });
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
  expect(await deliverHistoryMessages(identity, '', { probeSessionId: 'learn-one', createBridge: () => connection, fetcher })).toEqual({ status: 'idle', delivered: 1 });
  expect(connection.start).toHaveBeenCalledWith({ sessionId: 'learn-one' });
  expect(connection.callMethod).toHaveBeenCalledWith('session/append_message', task.message);
});
it('does not acknowledge an uncertain write or a switched identity, and always closes its captured connection', async () => {
  const connection = bridge();
  vi.mocked(connection.callMethod).mockRejectedValue(new Error('reply lost'));
  const fetcher = vi.fn(async () => Response.json({ profile_id: 'alice', tasks: [task] }));
  await expect(deliverHistoryMessages(identity, '', { probeSessionId: 'learn-one', createBridge: () => connection, fetcher })).rejects.toThrow('reply lost');
  expect(fetcher).toHaveBeenCalledOnce(); expect(connection.stop).toHaveBeenCalledOnce();
  await expect(deliverHistoryMessages(identity, '', { probeSessionId: 'learn-one', createBridge: () => connection, fetcher, isCurrent: () => false })).rejects.toThrow('切换');
  expect(fetcher).toHaveBeenCalledOnce();
});
it('never invents a session solely to probe capabilities when no queued session was supplied', async () => {
  const createBridge = vi.fn();
  expect(await deliverHistoryMessages(identity, '', { createBridge })).toEqual({ status: 'waiting-for-octos', delivered: 0 });
  expect(createBridge).not.toHaveBeenCalled();
});
it('yields after an in-flight capability handshake when teaching starts, without claiming messages', async () => {
  let idle = true; const connection = bridge(); const fetcher = vi.fn();
  vi.mocked(connection.start).mockImplementation(async () => { idle = false; });
  expect(await deliverHistoryMessages(identity, '', { probeSessionId: 'learn-one', createBridge: () => connection, fetcher, canContinue: () => idle })).toEqual({ status: 'paused', delivered: 0 });
  expect(fetcher).not.toHaveBeenCalled(); expect(connection.callMethod).not.toHaveBeenCalled(); expect(connection.stop).toHaveBeenCalledOnce();
});
it('records the in-flight append receipt then yields before another leased message or claim', async () => {
  let idle = true; const connection = bridge();
  const second = { ...task, id: 'second', message: { ...task.message, client_message_id: 'learn:user:q-2' } };
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    if (String(url).endsWith('/claim')) return Response.json({ profile_id: 'alice', tasks: [task, second] });
    expect(String(url)).toContain('/deliveries/event/receipt'); idle = false;
    return Response.json({ profile_id: 'alice', recorded: true });
  }) as unknown as typeof fetch;
  expect(await deliverHistoryMessages(identity, '', { probeSessionId: 'learn-one', createBridge: () => connection, fetcher, canContinue: () => idle })).toEqual({ status: 'paused', delivered: 1 });
  expect(connection.callMethod).toHaveBeenCalledOnce(); expect(fetcher).toHaveBeenCalledTimes(2); expect(connection.stop).toHaveBeenCalledOnce();
});

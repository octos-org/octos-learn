import { createUiProtocolBridge, type UiProtocolBridge } from '../../runtime/ui-protocol-bridge';
import type { HistoryIdentity } from './synchronize';

export interface HistoryMessage {
  session_id: string; role: 'user' | 'assistant'; content: string; media: string[];
  source: string; client_message_id: string; thread_id?: string;
}
export interface HistoryDeliveryTask { id: string; lease_id: string; message: HistoryMessage }
export interface HistoryDeliveryResult { status: 'idle' | 'waiting-for-octos'; delivered: number }

/** Mechanical transport only. The dedicated connection captures the verified
 * credential; an unrelated tab's login cannot change it during an RPC.
 */
export async function deliverHistoryMessages(identity: HistoryIdentity, base: string, {
  fetcher = fetch,
  createBridge = () => createUiProtocolBridge({ getToken: () => identity.token, getProfileId: () => identity.owner }),
  isCurrent = () => true,
}: { fetcher?: typeof fetch; createBridge?: () => UiProtocolBridge; isCurrent?: () => boolean } = {}): Promise<HistoryDeliveryResult> {
  if (!isCurrent()) throw new Error('账号已切换，原问答保留等待同步');
  const bridge = createBridge();
  let delivered = 0;
  try {
    await bridge.start({});
    // Older Octos builds implement the method but cannot safely retry an old
    // write after losing its receipt. Leave tasks unclaimed on those builds.
    if (!bridge.supportsFullHistoryAppendRetry?.()) return { status: 'waiting-for-octos', delivered };
    const headers = { Authorization: `Bearer ${identity.token}`, 'Content-Type': 'application/json', 'X-Learning-Owner': identity.owner };
    for (;;) {
      if (!isCurrent()) throw new Error('账号已切换，原问答保留等待同步');
      const claim = await fetcher(`${base}/api/learn/history/deliveries/claim`, {
        method: 'POST', headers, body: JSON.stringify({ limit: 10 }), signal: AbortSignal.timeout(10000), redirect: 'error',
      });
      if (!claim.ok) throw new Error('问答尚未交给 Octos，原文已保留');
      const body = await claim.json() as { profile_id: string; tasks: HistoryDeliveryTask[] };
      if (body.profile_id !== identity.owner || !Array.isArray(body.tasks)) throw new Error('问答同步回执所属账号不符');
      if (!body.tasks.length) return { status: 'idle', delivered };
      for (const task of body.tasks) {
        if (!isCurrent()) throw new Error('账号已切换，原问答保留等待同步');
        const receipt = await bridge.callMethod<{ session_id: string; seq: number; thread_id?: string }>('session/append_message', task.message);
        const expectedThread = task.message.role === 'user' ? task.message.client_message_id : task.message.thread_id;
        if (receipt.session_id !== task.message.session_id || !Number.isSafeInteger(receipt.seq) || receipt.seq < 0
          || receipt.thread_id !== expectedThread) throw new Error('Octos 未返回可核对的问答回执');
        const response = await fetcher(`${base}/api/learn/history/deliveries/${encodeURIComponent(task.id)}/receipt`, {
          method: 'POST', headers, body: JSON.stringify({ lease_id: task.lease_id, seq: receipt.seq }), signal: AbortSignal.timeout(10000), redirect: 'error',
        });
        if (!response.ok) throw new Error('Octos 已返回回执，产品记录尚待确认');
        const acknowledgement = await response.json() as { profile_id: string; recorded: boolean };
        if (acknowledgement.profile_id !== identity.owner || !acknowledgement.recorded) throw new Error('问答交付状态尚待核对');
        delivered++;
      }
    }
  } finally { await bridge.stop(); }
}

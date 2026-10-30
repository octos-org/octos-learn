import { tr } from "@/i18n";
import { historyRequestTimeout } from './request-timeout';
import { createUiProtocolBridge, type UiProtocolBridge } from '../../runtime/ui-protocol-bridge';
import type { HistoryIdentity } from './synchronize';

/** Finish the explicitly requested Octos session deletion using a captured
 * login. The product task stores identifiers and state, never credentials.
 * Repeating session/delete is safe; it cannot create a session or a memory.
 */
export async function finishSessionDeletions(identity: HistoryIdentity, base: string, {
  fetcher = fetch,
  createBridge = () => createUiProtocolBridge({ getToken: () => identity.token, getProfileId: () => identity.owner }),
  isCurrent = () => true,
  canContinue = () => true,
}: { fetcher?: typeof fetch; createBridge?: () => UiProtocolBridge; isCurrent?: () => boolean; canContinue?: () => boolean } = {}): Promise<number> {
  const headers = { Authorization: `Bearer ${identity.token}`, 'X-Learning-Owner': identity.owner, 'Content-Type': 'application/json' };
  let bridge: UiProtocolBridge | undefined;
  let accepted = 0;
  try {
    for (;;) {
      if (!isCurrent()) throw new Error(tr("账号已切换，删除请求仍然保留"));
      if (!canContinue()) return accepted;
      const response = await fetcher(`${base}/api/learn/history/session-deletions/claim`, { method: 'POST', headers, body: JSON.stringify({ limit: 10 }), redirect: 'error', signal: historyRequestTimeout(10000) });
      if (!response.ok) throw new Error(tr("白板清理尚待完成"));
      const body = await response.json() as { profile_id: string; tasks: { session_id: string; lease_id: string }[] };
      if (body.profile_id !== identity.owner || !Array.isArray(body.tasks)) throw new Error(tr("无法核对删除请求所属账号"));
      if (!body.tasks.length) return accepted;
      if (!canContinue()) return accepted;
      if (!bridge) { bridge = createBridge(); await bridge.start({}); }
      for (const task of body.tasks) {
        if (!isCurrent()) throw new Error(tr("账号已切换，删除请求仍然保留"));
        if (!canContinue()) return accepted;
        await bridge.callMethod('session/delete', { session_id: task.session_id });
        const acknowledged = await fetcher(`${base}/api/learn/history/session-deletions/${encodeURIComponent(task.session_id)}/receipt`, {
          method: 'POST', headers, body: JSON.stringify({ lease_id: task.lease_id }), redirect: 'error', signal: historyRequestTimeout(10000),
        });
        if (!acknowledged.ok) throw new Error(tr("删除请求的回执尚待保存"));
        const receipt = await acknowledged.json() as { profile_id: string; recorded: boolean };
        if (receipt.profile_id !== identity.owner || !receipt.recorded) throw new Error(tr("删除请求状态尚待核对"));
        accepted++;
      }
    }
  } finally { await bridge?.stop(); }
}

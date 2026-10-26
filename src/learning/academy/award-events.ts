import type { EarnedAchievement } from "../history/history-api";

/** Fired with the achievements a history read has just awarded. Whoever read
 * them (the classroom after an upload, the hall, the achievement hall) only
 * announces; the ceremony host decides when to play. */
export const AWARDS_EARNED_EVENT = "octos:achievements-earned";

// An award is `new` only in the one read that recorded it, but two pages may
// read at the same moment; each award is celebrated once per page load.
const celebrated = new Set<string>();

export function announceNewAwards(items: readonly EarnedAchievement[]) {
  const fresh = items.filter((item) => {
    const key = `${item.achievement_id}\u0000${item.scope}\u0000${item.evidence_event_id}`;
    if (!item.new || celebrated.has(key)) return false;
    celebrated.add(key);
    return true;
  });
  if (fresh.length) window.dispatchEvent(new CustomEvent<EarnedAchievement[]>(AWARDS_EARNED_EVENT, { detail: fresh }));
}

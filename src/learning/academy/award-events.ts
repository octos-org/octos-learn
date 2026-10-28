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

// Pages hold ceremonies while a lesson is in progress; they play once every
// hold is released. Kept outside React so a hold set before the host mounts
// still counts.
const holders = new Set<string>();
const holdListeners = new Set<() => void>();

export function holdAwards(holder: string, held: boolean) {
  if (held === holders.has(holder)) return;
  if (held) holders.add(holder); else holders.delete(holder);
  for (const listener of holdListeners) listener();
}
export function awardsHeld(): boolean { return holders.size > 0; }
export function subscribeAwardHold(listener: () => void): () => void {
  holdListeners.add(listener);
  return () => { holdListeners.delete(listener); };
}

// A page where the learner muted the teacher keeps award lines silent too.
const muters = new Set<string>();
export function muteAwardVoice(holder: string, muted: boolean) {
  if (muted) muters.add(holder); else muters.delete(holder);
}
export function awardVoiceMuted(): boolean { return muters.size > 0; }

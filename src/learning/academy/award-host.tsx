import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";

import type { EarnedAchievement } from "../history/history-api";
import { AWARDS_EARNED_EVENT, awardsHeld, subscribeAwardHold } from "./award-events";

// The ceremony and its particle layer load only when something is earned.
const AwardCeremony = lazy(() => import("./award-ceremony"));

/** Plays one ceremony per batch of newly earned achievements, in order. A
 * batch earned during a lesson waits until the lesson has finished; a ceremony
 * never interrupts a lesson or its narration. */
export function AwardHost() {
  const [queue, setQueue] = useState<{ id: number; items: EarnedAchievement[] }[]>([]);
  useEffect(() => {
    let next = 0;
    const onEarned = (event: Event) => {
      const items = (event as CustomEvent<EarnedAchievement[]>).detail;
      setQueue((current) => [...current, { id: next++, items }]);
    };
    window.addEventListener(AWARDS_EARNED_EVENT, onEarned);
    return () => window.removeEventListener(AWARDS_EARNED_EVENT, onEarned);
  }, []);
  const held = useSyncExternalStore(subscribeAwardHold, awardsHeld);
  // A ceremony already on screen finishes even if a lesson starts meanwhile.
  const [showing, setShowing] = useState<number | null>(null);
  const batch = queue[0];
  if (!batch || (held && showing !== batch.id)) return null;
  return (
    <Suspense fallback={null}>
      <AwardCeremony key={batch.id} items={batch.items} onShown={() => setShowing(batch.id)}
        onDone={() => setQueue((current) => current.slice(1))} />
    </Suspense>
  );
}

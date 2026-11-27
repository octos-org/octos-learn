import { cardHowTo } from "octos-lesson-language/plugin-math";

/**
 * Cards that draw their own how-to line on the card, following the card's state while its task is open. The
 * place-value trade card (OLL decision 0026) does; its fixed `cardHowTo` text beside the task would say the same
 * thing a second time, so Learn shows only the card's own line. OLL has no flag for this yet: the kind is named.
 */
const CARDS_WITH_THEIR_OWN_LINE: ReadonlySet<string> = new Set(["place_value_trade"]);

/** How to work a card task's card, shown with its task: the card's own fixed text (OLL 0023; owner, 2026-11-24). */
export function cardTaskHowTo(kind: string | undefined, content: unknown): string | undefined {
  if (!kind || CARDS_WITH_THEIR_OWN_LINE.has(kind)) return undefined;
  return cardHowTo(kind, content);
}

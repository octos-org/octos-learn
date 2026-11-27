import { cardHowTo } from "octos-lesson-language/plugin-math";

/**
 * Cards that draw their own how-to line on the card, following the card's state while its task is open: the
 * place-value trade card (OLL decision 0026), the make-ten card (0027: the line names the giving colour in that
 * colour) and the place-value times-ten card (0028: the line names every kind of thing that can be tapped now).
 * Their fixed `cardHowTo` text beside the task would say the same thing a second time, so Learn shows only the
 * card's own line. OLL has no flag for this yet: the kinds are named.
 */
const CARDS_WITH_THEIR_OWN_LINE: ReadonlySet<string> = new Set(["place_value_trade", "make_ten", "place_value_times_ten"]);

/** How to work a card task's card, shown with its task: the card's own fixed text (OLL 0023; owner, 2026-11-24). */
export function cardTaskHowTo(kind: string | undefined, content: unknown): string | undefined {
  if (!kind || CARDS_WITH_THEIR_OWN_LINE.has(kind)) return undefined;
  return cardHowTo(kind, content);
}

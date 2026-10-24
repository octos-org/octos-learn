/** A new board; a draft only fills its input box and is never sent by itself. */
export function newBoardHref(draft?: string): string {
  const q = new URLSearchParams({ "new-board": "1" });
  if (draft) q.set("draft", draft);
  return `/board?${q}`;
}

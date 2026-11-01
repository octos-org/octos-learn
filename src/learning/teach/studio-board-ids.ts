import type { NodeTarget } from "./recording";

/** Lesson ID of the live studio board, so board element IDs map back to aliases. */
export const STUDIO_LESSON_ID = "studio";
const NODE_PREFIX = `${STUDIO_LESSON_ID}:node:`;

/** The card (and part) a tap landed on, in recording terms. */
export function boardTargetFromId(id: string | undefined): NodeTarget | undefined {
  if (!id?.startsWith(NODE_PREFIX)) return undefined;
  const [node, part] = id.slice(NODE_PREFIX.length).split(":fragment:");
  return node ? { node, ...(part ? { part } : {}) } : undefined;
}

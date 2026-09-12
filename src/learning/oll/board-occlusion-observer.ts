export const BOARD_OCCLUSION_SELECTOR = "[data-learning-board-occlusion]";

export interface ChildMutationLike {
  addedNodes: ArrayLike<Node>;
  removedNodes: ArrayLike<Node>;
}

function containsBoardOcclusion(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const element = node as Element;
  return element.matches(BOARD_OCCLUSION_SELECTOR)
    || element.querySelector(BOARD_OCCLUSION_SELECTOR) !== null;
}

/** Ignore the frequent course-card mutations that cannot change UI occlusion. */
export function mutationsTouchBoardOcclusion(
  records: readonly ChildMutationLike[],
): boolean {
  return records.some((record) => (
    [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)]
      .some(containsBoardOcclusion)
  ));
}

import { describe, expect, it } from "vitest";

import { mutationsTouchBoardOcclusion } from "./board-occlusion-observer";

function mutation(addedNodes: Node[] = [], removedNodes: Node[] = []) {
  return { addedNodes, removedNodes };
}

describe("board occlusion mutation filtering", () => {
  it("ignores ordinary lesson-card additions", () => {
    const card = document.createElement("article");
    card.className = "board-node";
    expect(mutationsTouchBoardOcclusion([mutation([card])])).toBe(false);
  });

  it("detects direct and nested occlusion controls", () => {
    const toolbar = document.createElement("div");
    toolbar.dataset.learningBoardOcclusion = "";
    const shell = document.createElement("section");
    shell.append(toolbar);
    expect(mutationsTouchBoardOcclusion([mutation([toolbar])])).toBe(true);
    expect(mutationsTouchBoardOcclusion([mutation([shell])])).toBe(true);
  });

  it("detects an occlusion removed with its parent", () => {
    const shell = document.createElement("section");
    const dock = document.createElement("form");
    dock.dataset.learningBoardOcclusion = "";
    shell.append(dock);
    expect(mutationsTouchBoardOcclusion([mutation([], [shell])])).toBe(true);
  });
});

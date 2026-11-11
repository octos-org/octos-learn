// The number line CoursePack test fixture (octos-course-library
// courses/number-line-smoke, OLL decision 0013): a pack that needs the math
// plugin goes through the real archive reader, Learn's Authoring parity check,
// the headless player and the board.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCoursePackArchive } from "octos-course-library/browser";
import { assertExecutionSupported } from "octos-lesson-language";
import { HeadlessLessonPlayer } from "octos-lesson-language/player";
import { mountInfiniteBoard } from "octos-lesson-language/web-runtime";
import { resolveCoursePackPlaybackEvents } from "./course-pack-loader";

const archive = readFileSync(resolve(__dirname, "fixtures/number-line-smoke-0.0.1.ocpack"));

describe("number line CoursePack", () => {
  it("loads, matches Learn's materialization, is playable here, and draws its hops", async () => {
    const pack = await loadCoursePackArchive(archive);
    const events = resolveCoursePackPlaybackEvents(pack)!;
    expect(assertExecutionSupported(events).requiredPlugins).toEqual({ math: "0.2.0" });

    const host = document.createElement("div");
    document.body.append(host);
    const mounted = mountInfiniteBoard(host);
    try {
      const player = new HeadlessLessonPlayer(events);
      for (let frame = player.advance(); frame; frame = player.advance()) mounted.view.render(frame.projection.board, frame.operation);
      const card = host.querySelector('[data-id="number-line-smoke-0.0.1:node:line"]');
      expect(card).not.toBeNull();
      // 1/4 + 2/4, hop by hop: two hops ending at 3/4.
      expect(card!.querySelectorAll(".number-line-jump-arc")).toHaveLength(2);
      expect(card!.querySelector(".number-line-drag-handle")?.getAttribute("data-oll-control-kind")).toBe("number_line_point");
    } finally {
      mounted.destroy();
      host.remove();
    }
  });
});

// The physics CoursePack test fixture (octos-course-library
// courses/physics-smoke, subject plan P2 physics pilot): a non-mathematics pack
// goes through the real archive reader, Learn's Authoring parity check, the
// headless player and the board.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCoursePackArchive } from "octos-course-library/browser";
import { HeadlessLessonPlayer } from "octos-lesson-language/player";
import { mountInfiniteBoard } from "octos-lesson-language/web-runtime";
import { resolveCoursePackPlaybackEvents } from "./course-pack-loader";

const archive = readFileSync(resolve(__dirname, "fixtures/physics-smoke-0.0.1.ocpack"));

describe("physics CoursePack", () => {
  it("loads, matches Learn's own materialization and plays to the end", async () => {
    const pack = await loadCoursePackArchive(archive);
    expect(pack.manifest.subject).toBe("physics");
    const events = resolveCoursePackPlaybackEvents(pack);
    expect(events).toBeDefined();

    const host = document.createElement("div");
    document.body.append(host);
    const mounted = mountInfiniteBoard(host);
    try {
      const player = new HeadlessLessonPlayer(events!);
      let board;
      for (let frame = player.advance(); frame; frame = player.advance()) {
        board = frame.projection.board;
        mounted.view.render(board, frame.operation);
      }
      expect(board!.variables.t!.value).toBe(10);
      const track = board!.nodes["physics-smoke-0.0.1:node:motion-track"]!.content as { points: Array<{ id: string; x: number; label?: string }> };
      const cart = track.points.find((point) => point.id.endsWith(":object"))!;
      expect([cart.x, cart.label]).toEqual([20, "cart s = 20 m"]);
      expect(host.querySelector('[data-id="physics-smoke-0.0.1:node:motion-graph"]')).not.toBeNull();
    } finally {
      mounted.destroy();
      host.remove();
    }
  });
});

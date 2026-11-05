import { setLocale } from "@/i18n";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CanonicalEvent } from "octos-lesson-language";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { OllLessonRuntimeController } from "../oll/use-oll-lesson-runtime";
import { LessonContents, lessonContents } from "./lesson-contents";

beforeEach(() => setLocale("en-US"));
afterEach(() => { cleanup(); setLocale("zh-CN"); });

const events = [{ step: { beats: [
  { id: "l:beat:card-1", narration: { text: "This is the unit circle, and the point moves around it as the angle grows." } },
  { id: "l:beat:card-2", narration: { text: "Unwrap it." } },
  { id: "l:beat:card-3" },
] } }] as unknown as CanonicalEvent[];

it("names cards by title when known, else by their first words, else by number", () => {
  expect(lessonContents(events, (key) => (key === "card-2" ? "Unwrap" : undefined)).map((entry) => entry.label))
    .toEqual(["This is the unit circle, and…", "Unwrap", "Card 3"]);
});

it("shows where the lesson is and plays from a card the viewer picks", () => {
  const playBeat = vi.fn();
  const jumped = vi.fn();
  render(<LessonContents runtime={{ beatIndex: 1, completed: false, playBeat } as unknown as OllLessonRuntimeController}
    entries={lessonContents(events)} onJump={jumped} />);
  expect(screen.getByRole("progressbar", { name: "Playback progress" }).getAttribute("aria-valuetext")).toBe("Card 2 of 3");
  expect(screen.getByRole("button", { name: /Unwrap it/ }).getAttribute("aria-current")).toBe("step");
  fireEvent.click(screen.getByRole("button", { name: /Card 3/ }));
  expect(jumped).toHaveBeenCalled();
  expect(playBeat).toHaveBeenCalledWith("l:beat:card-3");
});

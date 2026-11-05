import { setLocale } from "@/i18n";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CanonicalEvent } from "octos-lesson-language";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { OllLessonRuntimeController } from "../oll/use-oll-lesson-runtime";
import { LessonContents, lessonContents } from "./lesson-contents";

beforeEach(() => setLocale("en-US"));
afterEach(() => { cleanup(); setLocale("zh-CN"); });

// A lesson saved before cards kept their sentences: one step, one beat per card.
const events = [{ step: { id: "l:step:teach", beats: [
  { id: "l:step:teach:beat:card-1", narration: { text: "This is the unit circle, and the point moves around it as the angle grows." } },
  { id: "l:step:teach:beat:card-2", narration: { text: "Unwrap it." } },
  { id: "l:step:teach:beat:card-3" },
] } }] as unknown as CanonicalEvent[];

// Now: one step per card, one beat per run of sentences.
const sentenceEvents = [
  { step: { id: "l:step:card-1", beats: [
    { id: "l:step:card-1:beat:card-1-s1", narration: { text: "This is the unit circle," } },
    { id: "l:step:card-1:beat:card-1-s2", narration: { text: "and the point moves around it as the angle grows." } },
  ] } },
  { step: { id: "l:step:card-2", beats: [{ id: "l:step:card-2:beat:card-2-s1", narration: { text: "Unwrap it." } }] } },
  { step: { id: "l:step:card-3", beats: [{ id: "l:step:card-3:beat:card-3-s1" }] } },
] as unknown as CanonicalEvent[];

it("names cards by title when known, else by their first words, else by number", () => {
  for (const lesson of [events, sentenceEvents]) {
    expect(lessonContents(lesson, (key) => (key === "card-2" ? "Unwrap" : undefined)).map((entry) => entry.label))
      .toEqual(["This is the unit circle, and…", "Unwrap", "Card 3"]);
  }
});

it("shows where the lesson is and plays from a card the viewer picks", () => {
  const playBeat = vi.fn();
  const jumped = vi.fn();
  render(<LessonContents runtime={{ currentBeatId: "l:step:teach:beat:card-2", completed: false, playBeat } as unknown as OllLessonRuntimeController}
    entries={lessonContents(events)} onJump={jumped} />);
  expect(screen.getByRole("progressbar", { name: "Playback progress" }).getAttribute("aria-valuetext")).toBe("Card 2 of 3");
  expect(screen.getByRole("button", { name: /Unwrap it/ }).getAttribute("aria-current")).toBe("step");
  fireEvent.click(screen.getByRole("button", { name: /Card 3/ }));
  expect(jumped).toHaveBeenCalled();
  expect(playBeat).toHaveBeenCalledWith("l:step:teach:beat:card-3");
});

it("stays on a card through all its sentences, and plays a card from its first", () => {
  const playBeat = vi.fn();
  render(<LessonContents runtime={{ currentBeatId: "l:step:card-1:beat:card-1-s2", completed: false, playBeat } as unknown as OllLessonRuntimeController}
    entries={lessonContents(sentenceEvents)} />);
  expect(screen.getByRole("progressbar", { name: "Playback progress" }).getAttribute("aria-valuetext")).toBe("Card 1 of 3");
  fireEvent.click(screen.getByRole("button", { name: /Card 3/ }));
  expect(playBeat).toHaveBeenCalledWith("l:step:card-3:beat:card-3-s1");
});

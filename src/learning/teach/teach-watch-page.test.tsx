import { setLocale } from "@/i18n";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/api/client", async (original) => ({ ...(await original<object>()), getToken: () => "token", getSelectedProfileId: () => "learner-1" }));
vi.mock("@/auth/auth-context", () => ({ useAuth: () => ({ token: "token", logout: vi.fn(async () => undefined) }) }));
const services = vi.hoisted(() => ({ resource: undefined as string | undefined }));
vi.mock("@/byok/services", async (original) => ({
  ...(await original<object>()),
  prepareClientServices: vi.fn(async () => undefined),
  getService: () => (services.resource ? { params: { resource_id: services.resource } } : undefined),
}));
vi.mock("@/byok/providers", async (original) => ({ ...(await original<object>()), availableService: () => false }));

import { appendEvent, createRecording, finishTake, planCards, startTake } from "./recording";
import { loadRecordingDrafts, saveRecordingDraft } from "./recording-store";
import { TeachWatchPage } from "./teach-watch-page";

beforeEach(() => { localStorage.clear(); setLocale("en-US"); });
afterEach(() => { cleanup(); setLocale("zh-CN"); });

function renderWatch(id: string) {
  render(<MemoryRouter initialEntries={[`/teach/${id}/watch`]}><Routes><Route path="/teach/:id/watch" element={<TeachWatchPage />} /></Routes></MemoryRouter>);
}

it("asks for a first recorded card before a lesson can be watched", () => {
  const now = "2026-11-01T12:00:00.000Z";
  saveRecordingDraft(localStorage, "learner-1", planCards(createRecording({ id: "rec-1", now, topic: { text: "Slope", type: "math_off_map" }, goals: [] }), now, [{ title: "One" }]));
  renderWatch("rec-1");
  expect(screen.getByRole("alert").textContent).toBe("No card is recorded yet. Record the first one to watch it.");
  expect(screen.getByRole("link", { name: "← Back to editing" }).getAttribute("href")).toBe("/teach/rec-1");
});

it("says so when the draft does not exist", () => {
  renderWatch("missing");
  expect(screen.getByRole("alert").textContent).toBe("This lesson draft can't be found.");
});

it("lets the learner choose the character that presents the lesson, kept with the draft", async () => {
  services.resource = "seed-tts-2.0";
  const now = "2026-11-01T12:00:00.000Z";
  let recording = planCards(createRecording({ id: "rec-2", now, topic: { text: "Slope", type: "math_off_map" }, goals: [] }), now, [{ title: "One" }]);
  recording = finishTake(appendEvent(startTake(recording, "card-1", now), "card-1", { t: 0, type: "component.insert", panel: "coordinate_grid", alias: "grid-1", x: [-1, 6], y: [-1, 9] }, now), "card-1", now, { durationMs: 1_000, asrText: "A grid." });
  saveRecordingDraft(localStorage, "learner-1", recording);
  renderWatch("rec-2");
  fireEvent.click(screen.getByRole("button", { name: "Change character" }));
  const chooser = within(await screen.findByRole("region", { name: "Who presents your lesson" }));
  // No separate voice choice: each character speaks in its own voice.
  expect(chooser.queryAllByRole("radio").map((radio) => radio.getAttribute("aria-label"))).toEqual([
    "Star Fox, curious and adventurous", "Red Panda, warm and patient", "White Rabbit, lively and full of ideas", "Moon Cat, quiet and imaginative",
  ]);
  fireEvent.click(chooser.getByRole("radio", { name: /^Moon Cat/ }));
  expect(loadRecordingDrafts(localStorage, "learner-1")[0]!.presenter).toEqual({ avatar: "moon-cat" });
  expect(chooser.getByRole("radio", { name: /^Moon Cat/ }).getAttribute("aria-checked")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Save this lesson" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Save this lesson" })).getByRole("checkbox", { name: /^Save basic mouth motion \(preview\)/ }));
  expect(loadRecordingDrafts(localStorage, "learner-1")[0]!.presenter?.mouthMotion).toBe("basic");
});

it("ignores a voice an earlier version chose separately", async () => {
  services.resource = "unknown-resource";
  const now = "2026-11-02T12:00:00.000Z";
  let recording = planCards(createRecording({ id: "voice-unavailable", now, topic: { text: "Slope", type: "math_off_map" }, goals: [] }), now, [{ title: "One" }]);
  recording = finishTake(appendEvent(startTake(recording, "card-1", now), "card-1", { t: 0, type: "component.insert", panel: "coordinate_grid", alias: "grid-1", x: [-1, 6], y: [-1, 9] }, now), "card-1", now, { durationMs: 1000, asrText: "A grid." });
  // A voice chosen separately by an earlier version is ignored, not a reason to block narration.
  recording.presenter = { voice: "unavailable-old-voice" }; saveRecordingDraft(localStorage, "learner-1", recording);
  renderWatch(recording.id);
  fireEvent.click(await screen.findByRole("button", { name: "Change character" }));
  expect(await screen.findByRole("region", { name: "Who presents your lesson" })).toBeTruthy();
  expect(screen.queryByText(/previously selected voice/)).toBeNull();
});

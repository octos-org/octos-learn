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

it("asks for the remaining cards before a lesson can be watched", () => {
  const now = "2026-11-01T12:00:00.000Z";
  saveRecordingDraft(localStorage, "learner-1", planCards(createRecording({ id: "rec-1", now, topic: { text: "Slope", type: "math_off_map" }, goals: [] }), now, [{ title: "One" }]));
  renderWatch("rec-1");
  expect(screen.getByRole("alert").textContent).toBe("Some cards aren't recorded yet. Record them and you can watch your lesson.");
  expect(screen.getByRole("link", { name: "← Back to editing" }).getAttribute("href")).toBe("/teach/rec-1");
});

it("says so when the draft does not exist", () => {
  renderWatch("missing");
  expect(screen.getByRole("alert").textContent).toBe("This lesson draft can't be found.");
});

it("lets the learner choose the avatar and voice that present the lesson, kept with the draft", async () => {
  services.resource = "seed-tts-2.0";
  const now = "2026-11-01T12:00:00.000Z";
  let recording = planCards(createRecording({ id: "rec-2", now, topic: { text: "Slope", type: "math_off_map" }, goals: [] }), now, [{ title: "One" }]);
  recording = finishTake(appendEvent(startTake(recording, "card-1", now), "card-1", { t: 0, type: "component.insert", panel: "coordinate_grid", alias: "grid-1", x: [-1, 6], y: [-1, 9] }, now), "card-1", now, { durationMs: 1_000, asrText: "A grid." });
  saveRecordingDraft(localStorage, "learner-1", recording);
  renderWatch("rec-2");
  fireEvent.click(screen.getByRole("button", { name: "Change the avatar or voice" }));
  const chooser = within(await screen.findByRole("region", { name: "Who presents your lesson" }));
  fireEvent.click(chooser.getByRole("button", { name: "Moon Cat" }));
  fireEvent.click(await chooser.findByRole("radio", { name: "Boy next door" }));
  expect(loadRecordingDrafts(localStorage, "learner-1")[0]!.presenter).toEqual({ avatar: "moon-cat", voice: "zh_male_linjiananhai_uranus_bigtts" });
  fireEvent.click(screen.getByRole("checkbox", { name: "Save basic mouth motion (preview)" }));
  expect(loadRecordingDrafts(localStorage, "learner-1")[0]!.presenter?.mouthMotion).toBe("basic");
});

it("does not silently replace an unavailable chosen voice and offers an explicit account-voice choice", async () => {
  services.resource = "unknown-resource";
  const now = "2026-11-02T12:00:00.000Z";
  let recording = planCards(createRecording({ id: "voice-unavailable", now, topic: { text: "Slope", type: "math_off_map" }, goals: [] }), now, [{ title: "One" }]);
  recording = finishTake(appendEvent(startTake(recording, "card-1", now), "card-1", { t: 0, type: "component.insert", panel: "coordinate_grid", alias: "grid-1", x: [-1, 6], y: [-1, 9] }, now), "card-1", now, { durationMs: 1000, asrText: "A grid." });
  recording.presenter = { voice: "unavailable-old-voice" }; saveRecordingDraft(localStorage, "learner-1", recording);
  renderWatch(recording.id);
  expect(await screen.findByText("The previously selected voice is unavailable with your current speech service. Choose another voice, or explicitly select “Use the voice from settings”.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Change the avatar or voice" }));
  fireEvent.click(screen.getByRole("button", { name: "Use the voice from settings" }));
  expect(loadRecordingDrafts(localStorage, "learner-1")[0]!.presenter?.voice).toBe("");
});

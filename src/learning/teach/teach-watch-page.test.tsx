import { setLocale } from "@/i18n";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/api/client", async (original) => ({ ...(await original<object>()), getToken: () => "token", getSelectedProfileId: () => "learner-1" }));
vi.mock("@/auth/auth-context", () => ({ useAuth: () => ({ token: "token", logout: vi.fn(async () => undefined) }) }));
vi.mock("@/byok/services", async (original) => ({ ...(await original<object>()), prepareClientServices: vi.fn(async () => undefined) }));

import { createRecording, planCards } from "./recording";
import { saveRecordingDraft } from "./recording-store";
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

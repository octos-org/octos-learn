import { setLocale } from "@/i18n";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/api/client", async (original) => ({ ...(await original<object>()), getToken: () => "token", getSelectedProfileId: () => "learner-1" }));
vi.mock("@/auth/auth-context", () => ({ useAuth: () => ({ token: "token", logout: vi.fn(async () => undefined) }) }));
const service = vi.hoisted(() => ({ lessons: [] as unknown[], deleted: [] as string[], reachable: true }));
vi.mock("./learner-lessons-api", async (original) => ({
  ...(await original<object>()),
  listLessons: vi.fn(async () => { if (!service.reachable) throw new Error("offline"); return service.lessons; }),
  readLesson: vi.fn(async (id: string) => {
    const { createRecording, planCards } = await import("./recording");
    const at = "2026-11-02T11:00:00.000Z";
    return { ...service.lessons.find((lesson) => (lesson as { lesson_id: string }).lesson_id === id) as object, ink: {},
      recording: planCards(createRecording({ id, now: at, topic: { text: "Slope", type: "math_off_map" }, goals: [] }), at, [{ title: "One" }]) };
  }),
  putLessonDraft: vi.fn(async () => ({ status: "saved", revision: 1 })),
  deleteLesson: vi.fn(async (id: string) => { service.deleted.push(id); }),
}));

import type { SavedLessonSummary } from "./learner-lessons-api";
import { createRecording, planCards } from "./recording";
import { loadRecordingDrafts, saveRecordingDraft } from "./recording-store";
import { TeachLessonsPage } from "./teach-lessons-page";

const now = "2026-11-02T12:00:00.000Z";
const saved = (id: string, title: string, changed = false): SavedLessonSummary => ({
  lesson_id: id, state: "submitted", title, star_topic_id: null, revision: 1, created_at: now, updated_at: now, saved_at: now, changed_since_saved: changed,
  saved: { content_sha256: "a".repeat(64), bytes: 10, language: "en-US", cards: 2, practice_tasks: 0, author: { learner_ref: "learner:x", avatar_ref: "avatar:octo", voice_ref: "voice:v" } },
});

beforeEach(() => { localStorage.clear(); setLocale("en-US"); service.lessons = []; service.deleted = []; service.reachable = true; });
afterEach(() => { cleanup(); setLocale("zh-CN"); });

function renderPage() {
  render(<MemoryRouter initialEntries={["/teach/lessons"]}><Routes><Route path="/teach/lessons" element={<TeachLessonsPage />} /></Routes></MemoryRouter>);
}

it("lists saved lessons with play, and drafts with how far they got", async () => {
  saveRecordingDraft(localStorage, "learner-1", planCards(createRecording({ id: "rec-draft", now, topic: { text: "Area", type: "math_off_map" }, goals: [] }), now, [{ title: "One" }, { title: "Two" }]));
  service.lessons = [saved("rec-saved", "Slope")];
  renderPage();
  const list = within(await screen.findByRole("list", { name: "My lessons" }));
  await waitFor(() => expect(list.getAllByRole("listitem")).toHaveLength(2));
  const [first, second] = list.getAllByRole("listitem");
  expect(within(first!).getByText("Draft · 0/2 cards recorded")).toBeTruthy();
  expect(within(first!).getByRole("link", { name: "Keep editing" }).getAttribute("href")).toBe("/teach/rec-draft");
  expect(within(second!).getByText("Saved · only you can see it")).toBeTruthy();
  expect(within(second!).getByRole("link", { name: "Play" }).getAttribute("href")).toBe("/teach/lessons/rec-saved/play");
});

it("deletes a lesson from the account and this device only after the learner confirms", async () => {
  saveRecordingDraft(localStorage, "learner-1", planCards(createRecording({ id: "rec-saved", now, topic: { text: "Slope", type: "math_off_map" }, goals: [] }), now, [{ title: "One" }]));
  service.lessons = [saved("rec-saved", "Slope", true)];
  renderPage();
  const row = within((await screen.findAllByRole("listitem"))[0]!);
  expect(await row.findByText("Saved · changed since, not saved again yet")).toBeTruthy();
  fireEvent.click(row.getByRole("button", { name: "Delete" }));
  const dialog = within(screen.getByRole("alertdialog", { name: "Delete \"Slope\"?" }));
  fireEvent.click(dialog.getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(screen.queryByRole("listitem")).toBeNull());
  expect(service.deleted).toEqual(["rec-saved"]);
  expect(loadRecordingDrafts(localStorage, "learner-1")).toEqual([]);
});

it("shows this device's drafts when the account cannot be reached", async () => {
  service.reachable = false;
  saveRecordingDraft(localStorage, "learner-1", planCards(createRecording({ id: "rec-draft", now, topic: { text: "Area", type: "math_off_map" }, goals: [] }), now, [{ title: "One" }]));
  renderPage();
  expect((await screen.findByRole("status")).textContent).toBe("Can't reach My lessons right now. These are the drafts on this device.");
  expect(screen.getByRole("link", { name: "Keep editing" })).toBeTruthy();
});

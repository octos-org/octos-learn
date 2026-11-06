import { setLocale } from "@/i18n";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ learningMap: vi.fn() }));
vi.mock("../history/history-api", async (original) => ({ ...(await original<object>()), openHistoryApi: vi.fn(async () => api) }));
vi.mock("@/api/client", async (original) => ({ ...(await original<object>()), getToken: () => "token", getSelectedProfileId: () => "learner-1" }));
vi.mock("@/auth/auth-context", () => ({ useAuth: () => ({ token: "token", logout: vi.fn(async () => undefined) }) }));

import { createRecording, planCards } from "./recording";
import { loadRecordingDrafts, saveRecordingDraft } from "./recording-store";
import { TeachPlanPage } from "./teach-plan-page";

beforeEach(() => {
  localStorage.clear();
  setLocale("en-US");
  api.learningMap.mockResolvedValue({ rules_version: "v1", through: 1, taxonomy: { commit: "c" }, topics: [] });
});
afterEach(() => { cleanup(); setLocale("zh-CN"); });

function renderPage() {
  const onPlanned = vi.fn();
  render(<MemoryRouter><TeachPlanPage onPlanned={onPlanned} /></MemoryRouter>);
  return onPlanned;
}

it("plans a lesson on a free topic and saves the draft for the learner", async () => {
  const onPlanned = renderPage();
  fireEvent.change(screen.getByRole("textbox", { name: "Topic" }), { target: { value: "Dinosaur teeth" } });
  fireEvent.click(screen.getByRole("button", { name: /teach what I typed|Teach this/ }));
  fireEvent.click(screen.getByRole("button", { name: "No, not math" }));
  fireEvent.change(screen.getByRole("textbox", { name: "What the viewer will learn" }), { target: { value: "Why T. rex had huge teeth" } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getAllByRole("textbox").map((input) => (input as HTMLInputElement).value))
    .toEqual(["The problem", "My method", "Try it", "Why it works"]);
  fireEvent.click(screen.getByRole("button", { name: /Your turn/ }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  // Last step: who presents the lesson.
  expect(screen.getByRole("heading", { name: "Who presents your lesson?" })).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: /^White Rabbit/ }));
  fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
  await waitFor(() => expect(onPlanned).toHaveBeenCalledOnce());
  const [draft] = loadRecordingDrafts(localStorage, "learner-1");
  expect(draft?.topic).toEqual({ text: "Dinosaur teeth", type: "other" });
  expect(draft?.goals).toEqual(["Why T. rex had huge teeth"]);
  expect(draft?.cards.map((card) => [card.key, card.kind])).toEqual([
    ["card-1", "teach"], ["card-2", "teach"], ["card-3", "teach"], ["card-4", "teach"], ["card-5", "your_turn"],
  ]);
  expect(draft?.presenter).toEqual({ avatar: "white-rabbit" });
});

it("asks for the topic and the goal on one page, and the topic can be changed there", () => {
  renderPage();
  expect(screen.queryByRole("textbox", { name: "What the viewer will learn" })).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Topic" }), { target: { value: "Dinosaur teeth" } });
  fireEvent.click(screen.getByRole("button", { name: /teach what I typed|Teach this/ }));
  fireEvent.click(screen.getByRole("button", { name: "No, not math" }));
  expect(screen.getByText("Dinosaur teeth")).toBeTruthy();
  const next = screen.getByRole("button", { name: "Next" }) as HTMLButtonElement;
  expect(next.disabled).toBe(true);
  fireEvent.change(screen.getByRole("textbox", { name: "What the viewer will learn" }), { target: { value: "Facts" } });
  expect(next.disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Change topic" }));
  expect((screen.getByRole("textbox", { name: "Topic" }) as HTMLInputElement).value).toBe("Dinosaur teeth");
  expect(screen.getByRole("list", { name: "Lesson planning progress" }).textContent).toMatch(/Topic & goal.*Cards.*Character & voice/);
});

it("suggests stars from the star map and marks lit ones", async () => {
  api.learningMap.mockResolvedValue({ rules_version: "v1", through: 1, taxonomy: { commit: "c" }, topics: [
    { topic_id: "mt_-3udyo6VyB", subject: "Mathematics", domain: "Algebra", name: "Plotting Linear Graphs", state: "explored",
      evidence: { played_beats: 1, runs: 1, task_attempts: 0, unassisted_successes: 0, assisted_successes: 0, days: [], first_at: null, last_at: null } },
  ] });
  renderPage();
  await waitFor(() => expect(api.learningMap).toHaveBeenCalled());
  fireEvent.change(screen.getByRole("textbox", { name: "Topic" }), { target: { value: "Plotting Linear Graphs" } });
  const star = await screen.findByRole("button", { name: /Plotting Linear Graphs\s*Lit/ });
  fireEvent.click(star);
  expect(screen.getByRole("heading", { name: /Octo wants to know/ })).toBeTruthy();
});

it("keeps between one and six cards", () => {
  renderPage();
  fireEvent.change(screen.getByRole("textbox", { name: "Topic" }), { target: { value: "Dinosaurs" } });
  fireEvent.click(screen.getByRole("button", { name: /Teach this|teach what I typed/ }));
  fireEvent.click(screen.getByRole("button", { name: "No, not math" }));
  fireEvent.change(screen.getByRole("textbox", { name: "What the viewer will learn" }), { target: { value: "Facts" } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Add a card" }));
  fireEvent.click(screen.getByRole("button", { name: /Your turn/ }));
  expect(screen.getAllByRole("textbox")).toHaveLength(6);
  expect((screen.getByRole("button", { name: "Add a card" }) as HTMLButtonElement).disabled).toBe(true);
  for (let card = 6; card > 1; card -= 1) fireEvent.click(screen.getByRole("button", { name: `Remove card ${card}` }));
  expect((screen.getByRole("button", { name: "Remove card 1" }) as HTMLButtonElement).disabled).toBe(true);
});

it("keeps lesson planning separate from the library and links back to it", () => {
  const now = "2026-11-01T10:00:00.000Z";
  const existing = planCards(createRecording({ id: "rec-old", now, topic: { text: "Dinosaur teeth", type: "other" }, goals: [] }), now, [{ title: "Teeth" }]);
  saveRecordingDraft(localStorage, "learner-1", existing);
  renderPage();
  expect(screen.queryByText("Dinosaur teeth")).toBeNull();
  expect(screen.getByRole("link", { name: "My lessons" }).getAttribute("href")).toBe("/teach");
  expect(screen.getByRole("heading", { name: "Teach a new lesson" })).toBeTruthy();
  expect(screen.getByRole("list", { name: "Lesson planning progress" })).toBeTruthy();
});

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { LearningMap } from "../history/history-api";

const api = vi.hoisted(() => ({ learningMap: vi.fn(), achievements: vi.fn(), analysisStatus: vi.fn() }));
vi.mock("../history/history-api", async (original) => ({ ...(await original<object>()), openHistoryApi: vi.fn(async () => api) }));
vi.mock("@/api/client", async (original) => ({ ...(await original<object>()), getToken: () => "token" }));
vi.mock("@/auth/auth-context", () => ({ useAuth: () => ({ token: "token", logout: vi.fn(async () => undefined) }) }));

import { AcademyHeader } from "./academy-header";
import { AtlasPage } from "./atlas-page";
import { HallHero } from "./hall-hero";
import { TEACHERS } from "../teachers/teachers";

const MAP: LearningMap = { rules_version: "map-states-v1", through: 9, taxonomy: { commit: "c7ed549" }, topics: [
  { topic_id: "mt_WBdHkc2HTf", subject: "Mathematics", domain: "Algebra", name: "Linear Function Graphs", state: "did-it",
    evidence: { played_beats: 4, runs: 3, task_attempts: 2, unassisted_successes: 1, assisted_successes: 1, days: ["2026-10-01"], first_at: null, last_at: null } },
  { topic_id: "mt_x", subject: "Mathematics", domain: "Geometry", name: "Circles", state: "explored",
    evidence: { played_beats: 1, runs: 1, task_attempts: 0, unassisted_successes: 0, assisted_successes: 0, days: ["2026-10-05"], first_at: null, last_at: null } },
] };

beforeEach(() => {
  localStorage.clear();
  api.learningMap.mockResolvedValue(MAP);
  api.achievements.mockResolvedValue({ rules_version: "achievements-v1", achievements: [
    { achievement_id: "first-footprint", scope: "", topic_name: null, teacher_id: "alan", earned_at: "2026-10-01T08:00:00.000Z", awarded_at: "2026-10-01T08:00:00.000Z", evidence_event_id: "b1", new: false },
  ] });
  api.analysisStatus.mockRejectedValue(new Error("unavailable"));
});
afterEach(cleanup);

it("links the academy's places from every page, marking the current one", () => {
  render(<MemoryRouter initialEntries={["/atlas"]}><AcademyHeader /></MemoryRouter>);
  const places = screen.getByRole("navigation", { name: "学院" });
  expect([...places.querySelectorAll("a")].map((link) => [link.textContent, link.getAttribute("href")])).toEqual([["大厅", "/"], ["星图", "/atlas"], ["我的老师", "/teachers"]]);
  expect(screen.getByRole("link", { name: "星图" }).getAttribute("aria-current")).toBe("page");
});

it("greets with the chosen teacher's own line, offers the last board and sums up the atlas", async () => {
  const latest = { id: "s1", title: "斜率", createdAt: 1, updatedAt: 2, status: "active" } as never;
  const { rerender } = render(<MemoryRouter><HallHero latest={latest} /></MemoryRouter>);
  expect(screen.getByText(TEACHERS[0].hall.resume)).toBeTruthy();
  expect(screen.getByRole("link", { name: /继续上次的白板/ })).toBeTruthy();
  expect(await screen.findByText("颗已点亮")).toBeTruthy();
  expect(document.querySelector(".academy-stats")?.textContent).toBe("1颗已点亮2个知识点留下足迹");
  expect(screen.getByText("初来乍到")).toBeTruthy();
  rerender(<MemoryRouter><HallHero latest={undefined} /></MemoryRouter>);
  expect(screen.getByText(TEACHERS[0].hall.welcome)).toBeTruthy();
  expect(screen.queryByRole("link", { name: /继续上次的白板/ })).toBeNull();
});

it("keeps the hall usable when the summary is unavailable", async () => {
  api.learningMap.mockRejectedValue(new Error("offline"));
  render(<MemoryRouter><HallHero latest={undefined} /></MemoryRouter>);
  expect(await screen.findByText(/每学完一段讲解或练习/)).toBeTruthy();
  expect(screen.getByRole("link", { name: /新建空白白板/ })).toBeTruthy();
});

it("shows the star atlas as its own page, with the list by domain below", async () => {
  render(<MemoryRouter><AtlasPage /></MemoryRouter>);
  expect(await screen.findByRole("img", { name: /数之星域：点亮 \d+ 颗/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: "揭开全部迷雾" })).toBeTruthy();
  expect(screen.getByText(/按星域列出（2 个知识点）/)).toBeTruthy();
  expect(screen.getByText(/这些都不等于已经掌握/)).toBeTruthy();
});

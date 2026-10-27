import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { LearningMap } from "../history/history-api";

const api = vi.hoisted(() => ({ learningMap: vi.fn(), achievements: vi.fn(), analysisStatus: vi.fn(), setTitle: vi.fn() }));
vi.mock("../history/history-api", async (original) => ({ ...(await original<object>()), openHistoryApi: vi.fn(async () => api) }));
vi.mock("@/api/client", async (original) => ({ ...(await original<object>()), getToken: () => "token" }));
vi.mock("@/auth/auth-context", () => ({ useAuth: () => ({ token: "token", logout: vi.fn(async () => undefined) }) }));

import { AcademyHeader } from "./academy-header";
import { AtlasPage } from "./atlas-page";
import { AchievementsPage } from "./achievements-page";
import { currentWeek, seasonWindows, timeGreeting, upcomingSeasons } from "./achievement-display";
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
    { achievement_id: "night-owl", scope: "", topic_name: null, teacher_id: "sufei", earned_at: "2026-10-02T14:00:00.000Z", awarded_at: "2026-10-02T14:00:00.000Z", evidence_event_id: "b2", new: false },
    { achievement_id: "mid-autumn", scope: "2026", topic_name: null, teacher_id: null, earned_at: "2026-09-25T08:00:00.000Z", awarded_at: "2026-09-25T08:00:00.000Z", evidence_event_id: "b3", new: false },
  ], progress: [{ achievement_id: "ten-stars", current: 3, target: 10 }], title: { id: "default", name: "启明学徒" } });
  api.analysisStatus.mockRejectedValue(new Error("unavailable"));
});
afterEach(cleanup);

it("links the academy's places from every page, marking the current one", () => {
  render(<MemoryRouter initialEntries={["/atlas"]}><AcademyHeader /></MemoryRouter>);
  const places = screen.getByRole("navigation", { name: "学院" });
  expect([...places.querySelectorAll("a")].map((link) => [link.textContent, link.getAttribute("href")])).toEqual([["大厅", "/"], ["星图", "/atlas"], ["成就", "/achievements"]]);
  expect(screen.getByRole("link", { name: "星图" }).getAttribute("aria-current")).toBe("page");
});

it("greets with the chosen teacher's own line, offers the last board and sums up the atlas", async () => {
  const latest = { id: "s1", title: "斜率", createdAt: 1, updatedAt: 2, status: "active" } as never;
  const { rerender } = render(<MemoryRouter><HallHero latest={latest} /></MemoryRouter>);
  expect(screen.getByText(TEACHERS[0].hall.resume)).toBeTruthy();
  expect(screen.getByRole("link", { name: /继续上次的白板/ })).toBeTruthy();
  expect(await screen.findByText("颗已点亮")).toBeTruthy();
  expect(document.querySelector(".academy-stats")?.textContent).toBe("1颗已点亮2个知识点留下足迹");
  expect(screen.getByText("第一个脚印")).toBeTruthy();
  expect((await screen.findByRole("heading", { level: 1 })).textContent).toMatch(/^(夜深了|早上好|上午好|中午好|下午好|晚上好)，启明学徒。$/);
  expect(screen.getByText(TEACHERS[0].hall.resume)).toBeTruthy();
  rerender(<MemoryRouter><HallHero latest={undefined} /></MemoryRouter>);
  expect(screen.getByText(new RegExp(TEACHERS[0].hall.welcome))).toBeTruthy();
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

it("shows every achievement in the hall: earned with who presented it, progress, hidden ones as question marks", async () => {
  render(<MemoryRouter><AchievementsPage /></MemoryRouter>);
  expect(await screen.findByRole("img", { name: "已点亮 3 / 74 枚" })).toBeTruthy();
  expect(within(screen.getByRole("list", { name: "最近获得" })).getAllByRole("button").length).toBe(3);
  expect(screen.getByRole("button", { name: "星夜学者，已获得" })).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "隐藏成就，未获得" }).length).toBe(9);
  expect(within(screen.getByRole("button", { name: "十星成列，未获得" })).getByLabelText("进度 3 / 10")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "星夜学者，已获得" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(/苏绯：「星夜学者」。记录在案。/)).toBeTruthy();
  expect(within(dialog).getByText("解锁「星夜学者」")).toBeTruthy();
  expect(within(dialog).getByText("夜深了，观星塔的灯和你都还亮着。")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("lets the learner wear an earned title and keeps others locked", async () => {
  api.setTitle.mockResolvedValue({ title: { id: "night-owl", name: "星夜学者" } });
  render(<MemoryRouter><AchievementsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: /称号衣橱/ }));
  expect(screen.getAllByRole("button", { name: /使用这个称号|正在使用/ }).length).toBe(2);
  fireEvent.click(screen.getByRole("button", { name: "使用这个称号" }));
  await waitFor(() => expect(api.setTitle).toHaveBeenCalledWith("night-owl"));
  expect(await screen.findByText("星夜学者", { selector: ".academy-fame-title strong" })).toBeTruthy();
});

it("lays out seasonal windows from the lunar table, soonest first", () => {
  const windows = seasonWindows(2027);
  expect(windows.find((item) => item.id === "spring-festival")).toMatchObject({ start: "2027-02-05", end: "2027-02-12" });
  expect(windows.find((item) => item.id === "lantern")).toMatchObject({ start: "2027-02-19", end: "2027-02-21" });
  expect(windows.some((item) => item.id === "leap-day")).toBe(false);
  expect(seasonWindows(2028).some((item) => item.id === "leap-day")).toBe(true);
  const next = upcomingSeasons("2026-10-25");
  expect(next[0]).toMatchObject({ id: "new-year", year: 2027, open: false, daysAway: 68 });
  expect(upcomingSeasons("2026-10-03")[0]).toMatchObject({ id: "national-day", open: true });
});

it("greets by the learner's clock and lays out this week from Monday", () => {
  expect([0, 4, 5, 9, 11, 13, 18, 23].map(timeGreeting)).toEqual(["夜深了", "夜深了", "早上好", "上午好", "中午好", "下午好", "晚上好", "晚上好"]);
  expect(currentWeek("2026-10-25")).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
  expect(currentWeek("2026-10-26")[0]).toBe("2026-10-26");
});


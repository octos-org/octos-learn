import { setLocale, tr } from "@/i18n";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { LearningMap } from "../history/history-api";

const api = vi.hoisted(() => ({ owner: "p1", learningMap: vi.fn(), achievements: vi.fn(), analysisStatus: vi.fn(), setTitle: vi.fn(), suggestions: vi.fn(), runs: vi.fn(), topic: vi.fn(), weeklyReport: vi.fn(), monthlyReport: vi.fn() }));
vi.mock("../history/history-api", async (original) => ({ ...(await original<object>()), openHistoryApi: vi.fn(async () => api) }));
vi.mock("@/api/client", async (original) => ({ ...(await original<object>()), getToken: () => "token" }));
vi.mock("@/auth/auth-context", () => ({ useAuth: () => ({ token: "token", logout: vi.fn(async () => undefined) }) }));
vi.mock("../learning-session-sync", () => ({ discoverServerLearningSessions: vi.fn(async () => []) }));

import { AcademyHeader } from "./academy-header";
import { AtlasPage } from "./atlas-page";
import { AchievementsPage } from "./achievements-page";
import { currentWeek, seasonWindows, timeGreeting, upcomingSeasons } from "./achievement-display";
import { HallHero } from "./hall-hero";
import { RecordsPage } from "./records-page";
import { LearningHistory } from "../learning-history";
import { showWeeklyReport } from "../report/report-week";
import { adoptLearningSession } from "../learning-session-store";
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
  api.suggestions.mockResolvedValue({ suggestions: [] });
  api.runs.mockResolvedValue({ runs: [], through: 9, next_before: null });
  api.topic.mockResolvedValue({ topic_id: "mt_WBdHkc2HTf", through: 9, counting_rule: "rule", objectives: [], events: [], next_after: null });
});
afterEach(cleanup);

it("links the academy's places from every page, marking the current one", () => {
  render(<MemoryRouter initialEntries={["/atlas"]}><AcademyHeader /></MemoryRouter>);
  const places = screen.getByRole("navigation", { name: tr("学院") });
  expect([...places.querySelectorAll("a")].map((link) => [link.textContent, link.getAttribute("href")])).toEqual([["大厅", "/"], ["星图", "/atlas"], ["成就", "/achievements"], ["记录", "/records"]]);
  expect(screen.getByRole("link", { name: tr("星图") }).getAttribute("aria-current")).toBe("page");
});

it("greets with the chosen teacher's own line, offers the last board and sums up the atlas", async () => {
  const latest = { id: "s1", title: "斜率", createdAt: 1, updatedAt: 2, status: "active" } as never;
  const { rerender } = render(<MemoryRouter><HallHero recent={[latest]} /></MemoryRouter>);
  expect(TEACHERS[0].hall.resume).toContain(document.querySelector(".academy-bubble")?.textContent);
  expect(screen.getByText(tr("观星塔导师"))).toBeTruthy();
  // Dedicated wide artwork on desktop; the matching portrait on phones.
  expect(document.querySelector<HTMLImageElement>(".academy-greeting-art img")?.src).toContain("/hall-wide.webp");
  expect(document.querySelector(".academy-greeting-art source")?.getAttribute("media")).toBe("(max-width: 640px)");
  expect(screen.getByRole("link", { name: new RegExp(tr("继续上次的学习").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "") })).toBeTruthy();
  expect(await screen.findByText(tr("颗已点亮"))).toBeTruthy();
  expect(document.querySelector(".academy-stats")?.textContent).toBe("1颗已点亮2个知识点留下足迹");
  expect(screen.getByText(tr("第一个脚印"))).toBeTruthy();
  expect((await screen.findByRole("heading", { level: 1 })).textContent).toMatch(/^(夜深了|早上好|上午好|中午好|下午好|晚上好)，启明学徒。$/);
  const heading = screen.getByRole("heading", { level: 1 });
  const reads = api.achievements.mock.calls.length;
  act(() => setLocale("en-US", false));
  expect(screen.getByRole("heading", { level: 1 })).toBe(heading);
  expect(heading.textContent).toContain(tr("启明学徒"));
  expect(heading.textContent).not.toMatch(/[\p{Script=Han}]/u);
  expect(api.achievements.mock.calls.length).toBe(reads);
  act(() => setLocale("zh-CN", false));
  rerender(<MemoryRouter><HallHero recent={[]} /></MemoryRouter>);
  expect(TEACHERS[0].hall.welcome).toContain(document.querySelector(".academy-bubble")?.textContent);
  expect(screen.queryByRole("link", { name: new RegExp(tr("继续上次的学习").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "") })).toBeNull();
});

it("picks one of the teacher's greetings at random and keeps it while the hall is open", () => {
  const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
  const { rerender } = render(<MemoryRouter><HallHero recent={[]} /></MemoryRouter>);
  const welcome = TEACHERS[0].hall.welcome;
  expect(document.querySelector(".academy-bubble")?.textContent).toBe(welcome[welcome.length - 1]);
  random.mockReturnValue(0);
  rerender(<MemoryRouter><HallHero recent={[]} /></MemoryRouter>);
  expect(document.querySelector(".academy-bubble")?.textContent).toBe(welcome[welcome.length - 1]);
  random.mockRestore();
});

it("continues the last board or lesson by name, links all records and this week's report", async () => {
  const course = { id: "c1", title: "斜率和截距", createdAt: 1, updatedAt: 2, status: "active", source: { kind: "course-pack", packId: "slope", version: "0.1.6", mode: "instance" } } as never;
  const board = { id: "b1", title: "勾股定理", createdAt: 1, updatedAt: 1, status: "active" } as never;
  render(<MemoryRouter><HallHero recent={[course, board]} /></MemoryRouter>);
  const resume = screen.getByRole("link", { name: new RegExp(tr("继续上次的学习").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "") });
  expect(resume.textContent).toContain("斜率和截距");
  expect(resume.getAttribute("href")).toBe("/course/slope?version=0.1.6&title=%E6%96%9C%E7%8E%87%E5%92%8C%E6%88%AA%E8%B7%9D&mode=learn&instance=c1");
  expect(screen.getByRole("link", { name: new RegExp(tr("全部学习记录").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "") }).getAttribute("href")).toBe("/records");
  // Topics learned on a day of this week; the fixture's October days are not this week.
  expect((await screen.findByRole("link", { name: new RegExp(tr("学习周报").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "") })).getAttribute("href")).toBe("/records?tab=week");
  expect(screen.getByText(new RegExp(tr("这周的学习会整理在这里").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ""))).toBeTruthy();
});

it("leaves the report card out when the report is turned off", async () => {
  showWeeklyReport(false);
  render(<MemoryRouter><HallHero recent={[]} /></MemoryRouter>);
  expect(await screen.findByText(tr("颗已点亮"))).toBeTruthy();
  expect(screen.queryByRole("link", { name: new RegExp(tr("学习周报").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "") })).toBeNull();
});

it("keeps every board and lesson on the records page, and what happened in each one view away", async () => {
  adoptLearningSession({ id: "learn-c1", title: "斜率和截距", createdAt: 1, updatedAt: 2, status: "active", source: { kind: "course-pack", packId: "slope", version: "0.1.6", mode: "instance" } } as never);
  render(<MemoryRouter initialEntries={["/records"]}><RecordsPage /></MemoryRouter>);
  expect(screen.getByRole("heading", { level: 1, name: tr("记录") })).toBeTruthy();
  expect(screen.getAllByRole("tab").map((tab) => [tab.textContent, tab.getAttribute("aria-selected")])).toEqual([["学习记录", "true"], ["周报", "false"], ["月报", "false"]]);
  expect(await screen.findByText("斜率和截距")).toBeTruthy();
  expect(screen.getByText(new RegExp(tr("课程学习").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ""))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: tr("每次学习的经过") }));
  expect(await screen.findByText(new RegExp(tr("还没有已同步的学习经过。此前的白板仍可从“白板与课程”打开。").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ""))).toBeTruthy();
});

it("opens the weekly and monthly reports as tabs of the records page, straight from a link", async () => {
  const empty = { rules_version: "report-v1", through: 9, report_sha256: "a".repeat(64), activity: { days: [], runs: 0, played_beats: 0, task_attempts: 0, unassisted_successes: 0, questions: 0 }, topics: [], achievements: [], comment: null, comment_teacher_id: null };
  api.weeklyReport.mockImplementation(async (week: string) => ({ ...empty, week_start: week, first_week: week }));
  api.monthlyReport.mockImplementation(async (month: string) => ({ ...empty, month, first_month: month, weeks: [] }));
  render(<MemoryRouter initialEntries={["/records?tab=month"]}><RecordsPage /></MemoryRouter>);
  expect(screen.getByRole("tab", { name: tr("月报") }).getAttribute("aria-selected")).toBe("true");
  expect(await screen.findByText(TEACHERS[0].report.monthQuiet)).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: tr("周报") }));
  expect(await screen.findByText(TEACHERS[0].report.quiet)).toBeTruthy();
  expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/^本周/);
});

it("moves between the records tabs with arrow keys, and Back returns to the previous tab", async () => {
  api.weeklyReport.mockReturnValue(new Promise(() => undefined));
  api.monthlyReport.mockReturnValue(new Promise(() => undefined));
  const router = createMemoryRouter([{ path: "/records", element: <RecordsPage /> }], { initialEntries: ["/records"] });
  render(<RouterProvider router={router} />);
  const tab = (name: string) => screen.getByRole("tab", { name });
  expect([tab("学习记录").tabIndex, tab("周报").tabIndex, tab("月报").tabIndex]).toEqual([0, -1, -1]);
  tab("学习记录").focus();
  fireEvent.keyDown(tab("学习记录"), { key: "ArrowRight" });
  expect(tab("周报").getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(tab("周报"));
  fireEvent.keyDown(tab("周报"), { key: "End" });
  expect(router.state.location.search).toBe("?tab=month");
  fireEvent.keyDown(tab("月报"), { key: "ArrowRight" });
  expect(tab("学习记录").getAttribute("aria-selected")).toBe("true");
  await act(async () => { await router.navigate(-1); });
  expect(tab("月报").getAttribute("aria-selected")).toBe("true");
  // Focus follows the tab Back selected, rather than staying on one out of the tab order.
  expect(document.activeElement).toBe(tab("月报"));
  await act(async () => { await router.navigate(-1); });
  expect(document.activeElement).toBe(tab("周报"));
  expect(tab("周报").tabIndex).toBe(0);
});

it("opens a star's topic evidence on the records page", async () => {
  render(<MemoryRouter initialEntries={["/records?topic=mt_WBdHkc2HTf&name=Linear+Function+Graphs"]}><RecordsPage /></MemoryRouter>);
  expect(await screen.findByRole("heading", { level: 3, name: "一次函数图像" })).toBeTruthy();
  await waitFor(() => expect(api.topic).toHaveBeenCalledWith("mt_WBdHkc2HTf", 9));
  expect(await screen.findByText(new RegExp(tr("这里仅统计有来源依据的部分内容，不代表整个知识点已掌握。人工确认的课程对应与模型分析分别列出。").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ""))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: tr("返回列表") }));
  expect(await screen.findByText(new RegExp(tr("还没有已同步的学习经过。此前的白板仍可从“白板与课程”打开。").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ""))).toBeTruthy();
});

it("keeps the board's drawer to switching boards, pointing to the records page for the rest", async () => {
  const onOpenRecords = vi.fn();
  render(<MemoryRouter><LearningHistory onClose={vi.fn()} onSelect={vi.fn()} onNew={vi.fn()} onOpenRecords={onOpenRecords} /></MemoryRouter>);
  expect(screen.queryByRole("tablist")).toBeNull();
  expect(screen.getByLabelText(tr("搜索学习记录"))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: new RegExp(tr("每次学习的经过与删除").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "") }));
  expect(onOpenRecords).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.queryByText(tr("正在同步历史记录…"))).toBeNull());
});

it("keeps the hall usable when the summary is unavailable", async () => {
  api.learningMap.mockRejectedValue(new Error("offline"));
  render(<MemoryRouter><HallHero recent={[]} /></MemoryRouter>);
  expect(await screen.findByText(new RegExp(tr("每学完一段讲解或练习，星图上就会留下足迹。").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ""))).toBeTruthy();
  expect(screen.getByRole("link", { name: new RegExp(tr("新建空白白板").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "") })).toBeTruthy();
});

it("shows the star atlas as its own page, without a second list of topics", async () => {
  render(<MemoryRouter><AtlasPage /></MemoryRouter>);
  expect(await screen.findByRole("img", { name: /数之星域：点亮 \d+ 颗/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: tr("揭开全部迷雾") })).toBeTruthy();
  expect(screen.queryByText(/按星域列出/)).toBeNull();
  expect(screen.getByText(new RegExp(tr("已探索：播放过相关讲解；正在练习：做过相关练习；做出来过：不用提示达到过练习要求。这些都不等于已经掌握。").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ""))).toBeTruthy();
});

it("shows every achievement in the hall: earned with who presented it, progress, hidden ones as question marks", async () => {
  render(<MemoryRouter><AchievementsPage /></MemoryRouter>);
  expect(await screen.findByRole("img", { name: "已点亮 3 / 74 枚" })).toBeTruthy();
  expect(within(screen.getByRole("list", { name: tr("最近获得") })).getAllByRole("button").length).toBe(3);
  expect(screen.getByRole("button", { name: "星夜学者，已获得" })).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "隐藏成就，未获得" }).length).toBe(9);
  expect(within(screen.getByRole("button", { name: "十星成列，未获得" })).getByLabelText("进度 3 / 10")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "星夜学者，已获得" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(/苏绯：夜里九点后还在听讲。记录在案，也请按时休息。/)).toBeTruthy();
  expect(within(dialog).getByText("解锁「星夜学者」")).toBeTruthy();
  expect(within(dialog).getByText(tr("夜深了，观星塔的灯和你都还亮着。"))).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: tr("关闭") }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("lets the learner wear an earned title and keeps others locked", async () => {
  api.setTitle.mockResolvedValue({ title: { id: "night-owl", name: "星夜学者" } });
  render(<MemoryRouter><AchievementsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(tr("称号衣橱").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "") }));
  expect(screen.getAllByRole("button", { name: /使用这个称号|正在使用/ }).length).toBe(2);
  fireEvent.click(screen.getByRole("button", { name: tr("使用这个称号") }));
  await waitFor(() => expect(api.setTitle).toHaveBeenCalledWith("night-owl"));
  expect(await screen.findByText(tr("星夜学者"), { selector: ".academy-fame-title strong" })).toBeTruthy();
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


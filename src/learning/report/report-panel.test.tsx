import { tr } from "@/i18n";
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WeeklyReport } from '../history/history-api';

const api = vi.hoisted(() => ({ weeklyReport: vi.fn(), monthlyReport: vi.fn() }));
vi.mock('../history/history-api', async (original) => ({ ...(await original<object>()), openHistoryApi: vi.fn(async () => api) }));
vi.mock('../../api/client', async (original) => ({ ...(await original<object>()), getToken: () => 'token' }));

import { ReportPanel } from './report-panel';
import { monthLabel, shiftMonth, shiftWeek, weekLabel, weekStartOf } from './report-week';
import { PLAIN_REPORT, TEACHERS } from '../teachers/teachers';

const REPORT: WeeklyReport = { rules_version: 'report-v1', through: 9, week_start: '2026-10-19', first_week: '2026-10-12', report_sha256: 'a'.repeat(64),
  activity: { days: ['2026-10-20', '2026-10-22'], runs: 4, played_beats: 18, task_attempts: 6, unassisted_successes: 1, questions: 2 },
  topics: [
    { topic_id: 'mt_WBdHkc2HTf', subject: 'Mathematics', domain: 'Algebra', name: 'Linear Function Graphs', state_before: 'explored', state_after: 'did-it',
      change: { evidence_event_id: 'a2', occurred_at: '2026-10-22T02:00:00.000Z', kind: 'task_attempt' }, played_beats: 2, task_attempts: 3 },
    { topic_id: 'mt_x', subject: 'Science', domain: 'Energy', name: 'Energy transfer', state_before: null, state_after: 'explored',
      change: { evidence_event_id: 'b1', occurred_at: '2026-10-20T02:00:00.000Z', kind: 'beat_completed' }, played_beats: 1, task_attempts: 0 },
  ],
  achievements: [{ achievement_id: 'did-it-alone', scope: '', topic_name: null, teacher_id: 'alan', earned_at: '2026-10-22T02:00:00.000Z' }],
  comment: null, comment_teacher_id: 'doudou' };
const today = () => new Date(2026, 9, 23, 12);

beforeEach(() => { localStorage.clear(); api.weeklyReport.mockReset(); api.monthlyReport.mockReset(); });
afterEach(cleanup);

it('computes local weeks the same way as the service', () => {
  expect(weekStartOf('2026-10-25')).toBe('2026-10-19');
  expect(shiftWeek('2026-10-19', -1)).toBe('2026-10-12');
  expect(weekLabel('2026-10-19')).toBe('10月19日–10月25日');
});

it('shows recorded learning and state changes with their evidence, in the chosen teacher\'s words', async () => {
  localStorage.setItem('octos-learn-teacher', 'doudou');
  api.weeklyReport.mockResolvedValue(REPORT);
  render(<ReportPanel period="week" today={today} />);
  const stats = await screen.findByLabelText('学了 2 天，上了 4 节课，播放 18 段，练习 6 次，提问 2 个');
  // The figures are on screen too, not only in the label.
  expect([...stats.querySelectorAll('dd')].map(item => item.textContent)).toEqual(['2天', '4节课', '18段', '6次', '2个']);
  expect(api.weeklyReport).toHaveBeenCalledWith('2026-10-19');
  expect(screen.getByText(TEACHERS[1].report.active).closest('figure')?.textContent).toContain(tr("窦鸢"));
  expect(screen.getByLabelText(tr("新点亮")).textContent).toContain('Energy transfer');
  expect(screen.getByLabelText(tr("状态变化")).textContent).toMatch(/一次函数图像.*已探索 → 做出来过.*不用提示达到练习要求/);
  expect(screen.getByLabelText(tr("新成就")).textContent).toContain(tr("亲手搞定"));
  expect(document.body.textContent).not.toMatch(/进步|已掌握|掌握了/);
  expect(screen.getByText(/都不等于已经掌握/)).toBeTruthy();
});

it('says nothing negative about a week without learning, and pages back only to the first week', async () => {
  api.weeklyReport.mockImplementation(async (week: string) => week === '2026-10-19' ? REPORT
    : { ...REPORT, week_start: week, activity: { days: [], runs: 0, played_beats: 0, task_attempts: 0, unassisted_successes: 0, questions: 0 }, topics: [], achievements: [] });
  localStorage.setItem('octos-learn-award-tone', 'plain');
  render(<ReportPanel period="week" today={today} />);
  await screen.findByLabelText(/学了 2 天/);
  expect(screen.getByRole('button', { name: '下一周' })).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByRole('button', { name: '上一周' }));
  expect(await screen.findByText(PLAIN_REPORT.quiet)).toBeTruthy();
  expect(screen.getByRole('button', { name: '上一周' })).toHaveProperty('disabled', true);
  expect(TEACHERS.every(teacher => !/没有学|偷懒|落后/.test(teacher.report.quiet))).toBe(true);
});

it('shows a checked comment only for the teacher it was written as', async () => {
  localStorage.setItem('octos-learn-teacher', 'doudou');
  api.weeklyReport.mockResolvedValue({ ...REPORT, comment: '这周来了 2 天，地图亮起来啦！' });
  render(<ReportPanel period="week" today={today} />);
  expect((await screen.findByText('这周来了 2 天，地图亮起来啦！')).closest('figure')?.textContent).toContain(tr("窦鸢"));
  expect(screen.getByText(new RegExp(tr("老师评语由模型根据本周记录生成，可在设置中关闭。").replace(/[.*+?^${}()|[]\\]/g, "\\$&"), ""))).toBeTruthy();
  cleanup();
  localStorage.setItem('octos-learn-teacher', 'alan');
  render(<ReportPanel period="week" today={today} />);
  expect((await screen.findByText(TEACHERS[0].report.active)).closest('figure')?.textContent).toContain(tr("阿澜"));
});

it('shows the monthly report in the teacher\'s month words, with days per week and no model comment', async () => {
  localStorage.setItem('octos-learn-teacher', 'sufei');
  api.weeklyReport.mockResolvedValue({ ...REPORT, comment: '这周的评语。', comment_teacher_id: 'sufei' });
  api.monthlyReport.mockImplementation(async (month: string) => ({ ...REPORT, rules_version: 'report-month-v1', month, first_month: '2026-09',
    weeks: [{ week_start: '2026-10-12', days: 1 }, { week_start: '2026-10-19', days: 2 }] }));
  render(<ReportPanel period="month" today={today} />);
  expect((await screen.findByText(TEACHERS[2].report.monthActive)).closest('figure')?.textContent).toContain(tr("苏绯"));
  expect(api.monthlyReport).toHaveBeenCalledWith('2026-10');
  expect(api.weeklyReport).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('本月2026年10月');
  expect(screen.getByLabelText('10月12日–10月18日 1 天')).toBeTruthy();
  expect(screen.getByLabelText('10月19日–10月25日 2 天')).toBeTruthy();
  expect(document.body.textContent).not.toContain('这周的评语');
  expect(screen.getByRole('button', { name: '下一个月' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '上一个月' }));
  await waitFor(() => expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('月报2026年9月'));
  expect(screen.getByRole('button', { name: '上一个月' }).hasAttribute('disabled')).toBe(true);
  expect([shiftMonth('2026-01', -1), shiftMonth('2026-12', 1), monthLabel('2026-03')]).toEqual(['2025-12', '2027-01', '2026年3月']);
});

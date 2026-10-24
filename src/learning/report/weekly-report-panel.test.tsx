import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WeeklyReport } from '../history/history-api';

const api = vi.hoisted(() => ({ weeklyReport: vi.fn() }));
vi.mock('../history/history-api', async (original) => ({ ...(await original<object>()), openHistoryApi: vi.fn(async () => api) }));
vi.mock('../../api/client', async (original) => ({ ...(await original<object>()), getToken: () => 'token' }));

import { WeeklyReportPanel } from './weekly-report-panel';
import { shiftWeek, weekLabel, weekStartOf } from './report-week';
import { PLAIN_REPORT, TEACHERS } from '../teachers/teachers';

const REPORT: WeeklyReport = { rules_version: 'report-v1', through: 9, week_start: '2026-10-19', first_week: '2026-10-12', report_sha256: 'a'.repeat(64),
  activity: { days: ['2026-10-20', '2026-10-22'], runs: 4, played_beats: 18, task_attempts: 6, unassisted_successes: 1, questions: 2 },
  topics: [
    { topic_id: 'mt_WBdHkc2HTf', subject: 'Mathematics', domain: 'Algebra', name: 'Linear Function Graphs', state_before: 'explored', state_after: 'did-it',
      change: { evidence_event_id: 'a2', occurred_at: '2026-10-22T02:00:00.000Z', kind: 'task_attempt' }, played_beats: 2, task_attempts: 3 },
    { topic_id: 'mt_x', subject: 'Science', domain: 'Energy', name: 'Energy transfer', state_before: null, state_after: 'explored',
      change: { evidence_event_id: 'b1', occurred_at: '2026-10-20T02:00:00.000Z', kind: 'beat_completed' }, played_beats: 1, task_attempts: 0 },
  ],
  achievements: [{ achievement_id: 'did-it-alone', scope: '', topic_name: null, teacher_id: 'alan', earned_at: '2026-10-22T02:00:00.000Z' }] };
const today = () => new Date(2026, 9, 23, 12);

beforeEach(() => { localStorage.clear(); api.weeklyReport.mockReset(); });
afterEach(cleanup);

it('computes local weeks the same way as the service', () => {
  expect(weekStartOf('2026-10-25')).toBe('2026-10-19');
  expect(shiftWeek('2026-10-19', -1)).toBe('2026-10-12');
  expect(weekLabel('2026-10-19')).toBe('10月19日–10月25日');
});

it('shows recorded learning and state changes with their evidence, in the chosen teacher\'s words', async () => {
  localStorage.setItem('octos-learn-teacher', 'doudou');
  api.weeklyReport.mockResolvedValue(REPORT);
  render(<WeeklyReportPanel today={today} />);
  expect(await screen.findByText('学了 2 天 · 4 节课 · 播放 18 段 · 练习 6 次 · 提问 2 个')).toBeTruthy();
  expect(api.weeklyReport).toHaveBeenCalledWith('2026-10-19');
  expect(screen.getByText(`豆豆：${TEACHERS[1].report.active}`)).toBeTruthy();
  expect(screen.getByLabelText('新点亮').textContent).toContain('Energy transfer');
  expect(screen.getByLabelText('状态变化').textContent).toMatch(/一次函数图像.*已探索 → 做出来过.*不用提示达到练习要求/);
  expect(screen.getByLabelText('新成就').textContent).toContain('亲手搞定');
  expect(document.body.textContent).not.toMatch(/进步|已掌握|掌握了/);
  expect(screen.getByText(/都不等于已经掌握/)).toBeTruthy();
});

it('says nothing negative about a week without learning, and pages back only to the first week', async () => {
  api.weeklyReport.mockImplementation(async (week: string) => week === '2026-10-19' ? REPORT
    : { ...REPORT, week_start: week, activity: { days: [], runs: 0, played_beats: 0, task_attempts: 0, unassisted_successes: 0, questions: 0 }, topics: [], achievements: [] });
  localStorage.setItem('octos-learn-award-tone', 'plain');
  render(<WeeklyReportPanel today={today} />);
  await screen.findByText(/学了 2 天/);
  expect(screen.getByRole('button', { name: '下一周 ›' })).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByRole('button', { name: '‹ 上一周' }));
  expect(await screen.findByText(PLAIN_REPORT.quiet)).toBeTruthy();
  expect(screen.getByRole('button', { name: '‹ 上一周' })).toHaveProperty('disabled', true);
  expect(TEACHERS.every(teacher => !/没有学|偷懒|落后/.test(teacher.report.quiet))).toBe(true);
});

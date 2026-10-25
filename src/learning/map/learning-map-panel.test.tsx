import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AchievementList, EarnedAchievement, LearningMap } from '../history/history-api';

const api = vi.hoisted(() => ({ learningMap: vi.fn(), achievements: vi.fn(), analysisStatus: vi.fn() }));
vi.mock('../history/history-api', async (original) => ({ ...(await original<object>()), openHistoryApi: vi.fn(async () => api) }));
vi.mock('../../api/client', async (original) => ({ ...(await original<object>()), getToken: () => 'token' }));

import { LearningMapPanel } from './learning-map-panel';
import { analysisNotice } from './analysis-notice';
import { awardLine } from './award-line';
import { PLAIN_AWARDS, TEACHERS } from '../teachers/teachers';

const award = (extra: Partial<EarnedAchievement>): EarnedAchievement => ({ achievement_id: 'regular-guest', scope: 'mt_WBdHkc2HTf', topic_name: 'Linear Function Graphs',
  teacher_id: 'doudou', earned_at: '2026-10-23T08:00:00.000Z', awarded_at: '2026-10-23T09:00:00.000Z', evidence_event_id: 'b3', new: false, ...extra });
const MAP: LearningMap = { rules_version: 'map-states-v1', through: 9, taxonomy: { commit: 'c7ed549' }, topics: [
  { topic_id: 'mt_WBdHkc2HTf', subject: 'Mathematics', domain: 'Algebra', name: 'Linear Function Graphs', state: 'did-it',
    evidence: { played_beats: 4, runs: 3, task_attempts: 2, unassisted_successes: 1, assisted_successes: 1, days: ['2026-10-01', '2026-10-03', '2026-10-05'], first_at: null, last_at: null } },
  { topic_id: 'mt_x', subject: 'Science', domain: 'Energy', name: 'Energy transfer', state: 'explored',
    evidence: { played_beats: 1, runs: 1, task_attempts: 0, unassisted_successes: 0, assisted_successes: 0, days: ['2026-10-05'], first_at: null, last_at: null } },
] };

beforeEach(() => { localStorage.clear(); api.learningMap.mockResolvedValue(MAP); api.analysisStatus.mockRejectedValue(new Error('unavailable')); });
afterEach(cleanup);

it('fills the presenting teacher\'s line with the topic, and falls back to plain wording', () => {
  expect(awardLine(award({}), 'playful')).toBe('第三次见面！一次函数图像都想给你留个专座了。');
  expect(awardLine(award({}), 'plain')).toBe('在 3 个不同的日子学习了一次函数图像。');
  expect(awardLine(award({ teacher_id: null }), 'playful')).toBe(PLAIN_AWARDS['regular-guest'].replace('{topic}', '一次函数图像'));
  expect(awardLine(award({ achievement_id: 'did-it-alone', scope: '', topic_name: null, teacher_id: 'alan' }), 'playful')).toBe(TEACHERS[0].awards['did-it-alone']);
});

it('groups lit topics by subject and domain with their state, and puts new achievements first', async () => {
  const list: AchievementList = { rules_version: 'achievements-v1', achievements: [
    award({ achievement_id: 'first-footprint', scope: '', topic_name: null, teacher_id: 'alan', earned_at: '2026-10-01T08:00:00.000Z' }), award({ new: true })] };
  api.achievements.mockResolvedValue(list);
  render(<MemoryRouter><LearningMapPanel /></MemoryRouter>);
  expect(await screen.findByText('数学')).toBeTruthy();
  expect(screen.getByText('代数（1 个点亮）')).toBeTruthy();
  expect(screen.getByText('做出来过')).toBeTruthy();
  expect(screen.getByText('科学')).toBeTruthy();
  expect(screen.getByText('已探索')).toBeTruthy();
  expect(screen.getByText(/这些都不等于已经掌握/)).toBeTruthy();
  const cards = document.querySelectorAll('.learning-map-award');
  expect(cards[0].textContent).toContain('常客 · 一次函数图像');
  // Draft Chinese name first, the original English name kept beside it.
  expect(screen.getByText('一次函数图像')).toBeTruthy();
  expect(screen.getByText('Linear Function Graphs')).toBeTruthy();
  expect(cards[0].textContent).toContain('新获得');
  expect(cards[0].textContent).toContain('窦鸢：第三次见面！');
  fireEvent.click(screen.getByRole('button', { name: '颁发语改为普通说法' }));
  expect(document.querySelectorAll('.learning-map-award')[0].textContent).toContain('在 3 个不同的日子学习了');
  expect(localStorage.getItem('octos-learn-award-tone')).toBe('plain');
});

it('explains an empty map without inventing progress', async () => {
  api.learningMap.mockResolvedValue({ ...MAP, topics: [] });
  api.achievements.mockResolvedValue({ rules_version: 'achievements-v1', achievements: [] });
  render(<MemoryRouter><LearningMapPanel /></MemoryRouter>);
  expect(await screen.findByText(/还没有点亮的知识点/)).toBeTruthy();
  expect(screen.getByText(/还没有成就/)).toBeTruthy();
});

it('explains lessons not on the map yet: still analyzing, or today\'s limit used up', () => {
  const status = (quota_used: number, waiting: number) => ({ enabled: true, max_daily_tasks: 20, quota_used, analysis_through: 3, states: [{ state: 'pending', count: waiting }, { state: 'complete', count: 9 }] });
  expect(analysisNotice(status(4, 0))).toBeNull();
  expect(analysisNotice({ ...status(4, 2), enabled: false })).toBeNull();
  expect(analysisNotice(status(4, 2))).toBe('还有 2 项学习内容正在分析，学习地图稍后更新。');
  expect(analysisNotice(status(20, 2))).toMatch(/^今天的 20 次知识点分析已经用完，还有 2 项学习内容没分析。之后打开应用时会自动补上/);
});

it('shows the analysis notice above the map without blocking it', async () => {
  api.achievements.mockResolvedValue({ rules_version: 'achievements-v1', achievements: [] });
  api.analysisStatus.mockResolvedValue({ enabled: true, max_daily_tasks: 10, quota_used: 10, analysis_through: 1, states: [{ state: 'pending', count: 1 }] });
  render(<MemoryRouter><LearningMapPanel /></MemoryRouter>);
  expect(await screen.findByText(/今天的 10 次知识点分析已经用完/)).toBeTruthy();
});


it('points to the star atlas page from the list by domain', async () => {
  api.achievements.mockResolvedValue({ rules_version: 'achievements-v1', achievements: [] });
  render(<MemoryRouter><LearningMapPanel /></MemoryRouter>);
  expect((await screen.findByRole('link', { name: /在星图里查看 2 颗星/ })).getAttribute('href')).toBe('/atlas');
  expect(screen.getByText(/按星域列出/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: '揭开全部迷雾' })).toBeNull();
});

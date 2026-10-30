import { expect, it } from 'vitest';
import type { EarnedAchievement } from '../history/history-api';

import { analysisNotice } from './analysis-notice';
import { awardLine } from './award-line';
import { TEACHERS } from '../teachers/teachers';

const award = (extra: Partial<EarnedAchievement>): EarnedAchievement => ({ achievement_id: 'regular-guest', scope: 'mt_WBdHkc2HTf', topic_name: 'Linear Function Graphs',
  teacher_id: 'doudou', earned_at: '2026-10-23T08:00:00.000Z', awarded_at: '2026-10-23T09:00:00.000Z', evidence_event_id: 'b3', new: false, ...extra });

it('fills the presenting teacher\'s line with the topic, and falls back to plain wording', () => {
  expect(awardLine(award({}), 'playful')).toBe('第三次见面！一次函数图像都想给你留个专座了。');
  expect(awardLine(award({}), 'plain')).toBe('在 3 个不同的日子学习了一次函数图像。');
  // No recorded teacher: the learner's current teacher presents it (阿澜 by default).
  expect(awardLine(award({ teacher_id: null }), 'playful')).toBe(TEACHERS[0].awards['regular-guest'].replace('{topic}', '一次函数图像'));
  expect(awardLine(award({ achievement_id: 'did-it-alone', scope: '', topic_name: null, teacher_id: 'alan' }), 'playful')).toBe(TEACHERS[0].awards['did-it-alone']);
});

it('explains lessons not on the star map yet: still analyzing, or today\'s limit used up', () => {
  const status = (quota_used: number, waiting: number) => ({ enabled: true, max_daily_tasks: 20, quota_used, analysis_through: 3, states: [{ state: 'pending', count: waiting }, { state: 'complete', count: 9 }] });
  expect(analysisNotice(status(4, 0))).toBeNull();
  expect(analysisNotice({ ...status(4, 2), enabled: false })).toBeNull();
  expect(analysisNotice(status(4, 2))).toBe('还有 2 项学习内容正在分析，星图稍后更新。');
  expect(analysisNotice(status(20, 2))).toMatch(/^今天的 20 次知识点分析已经用完，还有 2 项学习内容没分析。之后打开应用时会自动补上/);
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NextStep } from '../history/history-api';

const api = vi.hoisted(() => ({ suggestions: vi.fn(), dismissSuggestion: vi.fn(async () => ({ dismissed: true })), owner: 'alice' }));
const session = vi.hoisted(() => ({ id: 'board-r1', title: '斜率' }));
vi.mock('../history/history-api', async (original) => ({ ...(await original<object>()), openHistoryApi: vi.fn(async () => api) }));
vi.mock('../../api/client', async (original) => ({ ...(await original<object>()), getToken: () => 'token', getSelectedProfileId: () => 'alice' }));
vi.mock('../learning-session-store', async (original) => ({ ...(await original<object>()), getLearningSession: (id: string) => id === session.id ? session : null }));

import { NextSteps } from './next-steps';
import { nextStepDraft } from './next-step-line';
import { PLAIN_SUGGESTIONS, TEACHERS } from '../teachers/teachers';

const topic = { topic_id: 'mt_WBdHkc2HTf', name: 'Linear Function Graphs', subject: 'Mathematics', domain: 'Algebra', state: 'practising' as const, last_at: '2026-10-22T02:00:00.000Z' };
const STEPS: NextStep[] = [
  { id: 'continue:mt_WBdHkc2HTf:', type: 'continue', topic, resume: { session_id: 'board-r1', run_id: 'r1' } },
  { id: 'foundation:mt_WBdHkc2HTf:mt_hVpGOEz2kG', type: 'foundation', topic, resume: { session_id: 'board-r1', run_id: 'r1' },
    target: { topic_id: 'mt_hVpGOEz2kG', name: 'Coordinates (age 11+)', subject: 'Mathematics', domain: 'Geometry', strength: 'hard', reason: 'Understanding linear graphs requires confident coordinate plotting' } },
];

beforeEach(() => { localStorage.clear(); api.suggestions.mockClear(); api.suggestions.mockResolvedValue({ rules_version: 'suggestions-v1', suggestions: STEPS }); api.dismissSuggestion.mockClear(); });
afterEach(cleanup);

it('resumes the original board, or fills a new board without sending, in the chosen teacher\'s words', async () => {
  localStorage.setItem('octos-learn-teacher', 'doudou');
  const onSelect = vi.fn(), onNew = vi.fn();
  render(<NextSteps onSelect={onSelect} onNew={onNew} />);
  expect(await screen.findByText(`窦鸢：${TEACHERS[1].suggestions.continue.replace('{topic}', '一次函数图像')}`)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '回到那节课' }));
  expect(onSelect).toHaveBeenCalledWith(session);
  fireEvent.click(screen.getByRole('button', { name: '在新白板上问问' }));
  const draft = await nextStepDraft(STEPS[1]);
  await waitFor(() => expect(onNew).toHaveBeenCalledWith(draft));
  expect(document.body.textContent).toContain('这不代表不会');
  expect(document.body.textContent).not.toMatch(/你还不会|忘了|没掌握/);
});

it('hides a dismissed step and records it; plain wording when playful lines are off', async () => {
  localStorage.setItem('octos-learn-award-tone', 'plain');
  render(<NextSteps onNew={vi.fn()} />);
  expect(await screen.findByText(PLAIN_SUGGESTIONS.continue.replace('{topic}', '一次函数图像'))).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button', { name: '不感兴趣' })[0]);
  expect(screen.queryByText(PLAIN_SUGGESTIONS.continue.replace('{topic}', '一次函数图像'))).toBeNull();
  expect(api.dismissSuggestion).toHaveBeenCalledWith('continue:mt_WBdHkc2HTf:');
});

it('requests nothing when the learner turned suggestions off', async () => {
  localStorage.setItem('octos-learn-next-steps', 'hidden');
  const { container } = render(<NextSteps />);
  await Promise.resolve();
  expect(container.textContent).toBe('');
  expect(api.suggestions).not.toHaveBeenCalled();
});

it('never words a missing record as inability or time away as forgetting', () => {
  for (const lines of [...TEACHERS.map(teacher => teacher.suggestions), PLAIN_SUGGESTIONS]) {
    for (const line of Object.values(lines)) expect(line).not.toMatch(/不会|忘|掌握|落后|应该/);
  }
});

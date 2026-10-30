import { tr } from "@/i18n";
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getMyMemory: vi.fn(),
  requestMemoryChange: vi.fn(async () => ({ status: 'accepted', refresh_enabled: true })),
}));
vi.mock('./settings-api', () => api);

import { TeacherMemoryTab } from './teacher-memory-tab';

const overview = (long_term: string, extra = {}) => ({ ok: true, long_term, long_term_updated_at: '2026-10-23T09:00:00.000Z', today: '', recent: [], entities: [], staging_notes: 0, refresh_enabled: true, ...extra });
const MEMORY = '希望所有老师讲题时都先举一个例子再说结论。(updated: 2026-10-23) ^mdmec77\n\n下周三有数学期中考试。(updated: 2026-10-23) ^mexam22\n\nPrefers dark mode in the editor. (updated: 2026-10-01) ^mqqq222\n';

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  api.getMyMemory.mockReset();
  api.requestMemoryChange.mockClear();
});

it('lists learning memories, folds unrelated ones under 其他, and filters by teacher', async () => {
  api.getMyMemory.mockResolvedValue(overview(MEMORY));
  render(<MemoryRouter><TeacherMemoryTab profileId="alice" /></MemoryRouter>);
  expect(await screen.findByText('希望所有老师讲题时都先举一个例子再说结论。')).toBeTruthy();
  expect(screen.getByText('下周三有数学期中考试。')).toBeTruthy();
  expect(screen.queryByText('Prefers dark mode in the editor.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /其他（1 条/ }));
  expect(screen.getByText('Prefers dark mode in the editor.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: tr("关于我") }));
  expect(screen.queryByText('希望所有老师讲题时都先举一个例子再说结论。')).toBeNull();
});

it('sends a forget request, shows it as waiting, and drops it once memory no longer has the entry', async () => {
  api.getMyMemory.mockResolvedValue(overview(MEMORY));
  const { unmount } = render(<MemoryRouter><TeacherMemoryTab profileId="alice" /></MemoryRouter>);
  const row = (await screen.findByText('下周三有数学期中考试。')).closest('li')!;
  fireEvent.click(within(row).getByRole('button', { name: tr("忘掉") }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: tr("忘掉") }));
  await waitFor(() => expect(api.requestMemoryChange).toHaveBeenCalledOnce());
  const sent = api.requestMemoryChange.mock.calls[0][0] as unknown as Record<string, string>;
  expect(sent).toMatchObject({ operation: 'forget', entry_id: '^mexam22' });
  expect(sent.content).toBeUndefined();
  expect(sent.request_id).toMatch(/^learn-memory-/);
  expect(await within(row).findByText(tr("已收到，等待整理"))).toBeTruthy();
  unmount();

  // Reopened before consolidation: still waiting, kept per account.
  render(<MemoryRouter><TeacherMemoryTab profileId="alice" /></MemoryRouter>);
  expect(await screen.findByText(tr("已收到，等待整理"))).toBeTruthy();
  expect(JSON.parse(localStorage.getItem('octos-learn-memory-requests:alice')!)).toHaveLength(1);
});

it('marks a request that a later consolidation did not apply', async () => {
  api.getMyMemory.mockResolvedValue(overview(MEMORY));
  const { unmount } = render(<MemoryRouter><TeacherMemoryTab profileId="alice" /></MemoryRouter>);
  const row = (await screen.findByText('下周三有数学期中考试。')).closest('li')!;
  fireEvent.click(within(row).getByRole('button', { name: tr("忘掉") }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: tr("忘掉") }));
  await within(row).findByText(tr("已收到，等待整理"));
  unmount();
  api.getMyMemory.mockResolvedValue(overview(MEMORY, { long_term_updated_at: '2099-01-01T00:00:00.000Z' }));
  render(<MemoryRouter><TeacherMemoryTab profileId="alice" /></MemoryRouter>);
  expect(await screen.findByText(tr("没有按要求改好"))).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: tr("知道了") }));
  expect(localStorage.getItem('octos-learn-memory-requests:alice')).toBeNull();
});

it('remembers with the chosen teacher scope and corrects an entry by id', async () => {
  api.getMyMemory.mockResolvedValue(overview(MEMORY));
  render(<MemoryRouter><TeacherMemoryTab profileId="alice" /></MemoryRouter>);
  await screen.findByText('下周三有数学期中考试。');
  fireEvent.click(screen.getByRole('button', { name: new RegExp(tr("让老师记住一件事").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "") }));
  fireEvent.change(screen.getByLabelText(tr("想让老师记住什么")), { target: { value: '讲新概念时可以用一个比喻' } });
  fireEvent.click(screen.getByLabelText('只对阿澜'));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: tr("提交") }));
  await waitFor(() => expect(api.requestMemoryChange).toHaveBeenCalledOnce());
  expect(api.requestMemoryChange.mock.calls[0][0]).toMatchObject({ operation: 'remember', content: '只对阿澜老师：讲新概念时可以用一个比喻' });
  expect(await screen.findByText('只对阿澜老师：讲新概念时可以用一个比喻')).toBeTruthy();

  const row = screen.getByText('希望所有老师讲题时都先举一个例子再说结论。').closest('li')!;
  fireEvent.click(within(row).getByRole('button', { name: tr("改一改") }));
  fireEvent.change(screen.getByLabelText(tr("应该是")), { target: { value: '先说结论，再举一个例子' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: tr("提交修改") }));
  await waitFor(() => expect(api.requestMemoryChange).toHaveBeenCalledTimes(2));
  expect(api.requestMemoryChange.mock.calls[1][0]).toMatchObject({ operation: 'correct', entry_id: '^mdmec77', content: '对所有老师：先说结论，再举一个例子' });
});

it('keeps the request open and reuses its id when sending fails', async () => {
  api.getMyMemory.mockResolvedValue(overview(MEMORY));
  api.requestMemoryChange.mockRejectedValueOnce(new Error('offline'));
  render(<MemoryRouter><TeacherMemoryTab profileId="alice" /></MemoryRouter>);
  const row = (await screen.findByText('下周三有数学期中考试。')).closest('li')!;
  fireEvent.click(within(row).getByRole('button', { name: tr("忘掉") }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: tr("忘掉") }));
  expect(await screen.findByText(tr("没能提交，请稍后再试。"))).toBeTruthy();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: tr("忘掉") }));
  await waitFor(() => expect(api.requestMemoryChange).toHaveBeenCalledTimes(2));
  const ids = api.requestMemoryChange.mock.calls.map(call => (call[0] as unknown as { request_id: string }).request_id);
  expect(ids[0]).toBe(ids[1]);
});

it('says when background consolidation is off', async () => {
  api.getMyMemory.mockResolvedValue(overview('', { refresh_enabled: false }));
  render(<MemoryRouter><TeacherMemoryTab profileId="alice" /></MemoryRouter>);
  expect(await screen.findByText(new RegExp(tr("后台整理记忆没有开启：你的请求会被保存，但要等开启后才会生效。").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ""))).toBeTruthy();
  expect(screen.getByText(new RegExp(tr("老师还没有记住什么。上课时说过的偏好和经历，整理后会出现在这里。").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ""))).toBeTruthy();
});

it('refreshes instead of failing when the entry is already gone', async () => {
  api.getMyMemory.mockResolvedValueOnce(overview(MEMORY)).mockResolvedValue(overview(MEMORY.replace('下周三有数学期中考试。(updated: 2026-10-23) ^mexam22\n\n', '')));
  api.requestMemoryChange.mockRejectedValueOnce(Object.assign(new Error('memory_entry not found'), { data: { kind: 'not_found' } }));
  render(<MemoryRouter><TeacherMemoryTab profileId="alice" /></MemoryRouter>);
  const row = (await screen.findByText('下周三有数学期中考试。')).closest('li')!;
  fireEvent.click(within(row).getByRole('button', { name: tr("忘掉") }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: tr("忘掉") }));
  await waitFor(() => expect(screen.queryByText('下周三有数学期中考试。')).toBeNull());
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(localStorage.getItem('octos-learn-memory-requests:alice')).toBeNull();
});

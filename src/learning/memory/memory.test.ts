import { withLocale } from '@/i18n';
import { expect, it } from 'vitest';
import { memoryGroup, parseMemoryEntries, scopedContent } from './memory-entries';
import { reconcileRequests, memorySnapshot, type PendingMemoryRequest } from './memory-requests';

// Shape written by Octos consolidation in the 2026-10-23 trial.
const MEMORY = `希望所有老师讲题时都先举一个例子再说结论。(updated: 2026-10-23) ^mdmec77

平时最喜欢打篮球。(updated: 2026-10-23) ^matokxe

希望豆豆老师在举例时多用篮球相关的例子。(updated: 2026-10-23) ^m6sptfa

Prefers dark mode in the editor. (updated: unknown, imported: 2026-10-01) ^mqqq222
`;

it('parses Octos memory entries with id, text and update date', () => {
  const entries = parseMemoryEntries(MEMORY);
  expect(entries.map(entry => entry.id)).toEqual(['^mdmec77', '^matokxe', '^m6sptfa', '^mqqq222']);
  expect(entries[0]).toEqual({ id: '^mdmec77', text: '希望所有老师讲题时都先举一个例子再说结论。', updated: '2026-10-23' });
  expect(entries[3]).toMatchObject({ text: 'Prefers dark mode in the editor.', updated: null });
  expect(parseMemoryEntries('Legacy note without id')).toEqual([{ id: null, text: 'Legacy note without id', updated: null }]);
  expect(parseMemoryEntries('')).toEqual([]);
});

it('groups entries by named teacher, teaching, the learner, or other', () => {
  const groups = parseMemoryEntries(MEMORY).map(entry => memoryGroup(entry.text));
  expect(groups).toEqual(['all', 'me', 'doudou', 'other']);
  expect(memoryGroup('阿澜老师讲题时不用比喻')).toBe('alan');
  expect(memoryGroup('阿澜和豆豆都先说结论')).toBe('all');
  expect(memoryGroup('所有老师都不要提豆豆的比喻')).toBe('all');
  expect(memoryGroup('下周三有数学期中考试')).toBe('me');
});

it('keeps the chosen scope in request text', () => {
  expect(scopedContent('all', ' 先举例 ')).toBe('对所有老师：先举例');
  expect(scopedContent('alan', '不用比喻')).toBe('只对阿澜老师：不用比喻');
  expect(scopedContent('me', '下周考试')).toBe('下周考试');
  // An English scope still names the stored teacher that Octos memory uses.
  expect(withLocale('en-US', () => scopedContent('alan', 'no analogies'))).toBe('Only for Alan (阿澜): no analogies');
});

const request = (operation: PendingMemoryRequest['operation'], extra: Partial<PendingMemoryRequest> = {}): PendingMemoryRequest => ({
  request_id: `r-${operation}`, operation, snapshot: memorySnapshot(parseMemoryEntries(MEMORY)), submitted_at: '2026-10-23T10:00:00.000Z', ...extra,
});

it('settles requests only when memory shows the change, and marks unchanged ones after a later consolidation', () => {
  const entries = parseMemoryEntries(MEMORY);
  const forget = request('forget', { entry_id: '^matokxe' });
  const correct = request('correct', { entry_id: '^m6sptfa', original_text: entries[2].text });
  const remember = request('remember', { content: '想把一次函数学扎实' });
  // Not consolidated yet: all wait.
  expect(reconcileRequests([forget, correct, remember], entries, '2026-10-23T09:00:00.000Z')).toHaveLength(3);
  // Consolidated, nothing changed: all three are marked failed.
  expect(reconcileRequests([forget, correct, remember], entries, '2026-10-23T11:00:00.000Z').map(item => item.failed)).toEqual([true, true, true]);
  // Consolidated with the changes applied: all three settle.
  const after = parseMemoryEntries(MEMORY.replace('平时最喜欢打篮球。(updated: 2026-10-23) ^matokxe', '')
    .replace('希望豆豆老师在举例时多用篮球相关的例子。', '只对豆豆老师：举例时偶尔用篮球。') + '\n\n想把一次函数学扎实。(updated: 2026-10-23) ^mnew234');
  expect(reconcileRequests([forget, correct, remember], after, '2026-10-23T11:00:00.000Z')).toEqual([]);
  // A forget already applied settles even before the timestamp moves.
  expect(reconcileRequests([forget], after, '2026-10-23T09:00:00.000Z')).toEqual([]);
});

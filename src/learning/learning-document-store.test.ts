import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InkDocumentRecord } from 'octos-lesson-language/ink-runtime';

beforeEach(() => { vi.resetModules(); vi.stubGlobal('indexedDB', new IDBFactory()); localStorage.clear(); });
const record = { svg: '<svg/>', document_id: 'test' } as InkDocumentRecord;

describe('IndexedDB learning documents', () => {
  it('clears only legacy learning documents after opening the database', async () => {
    localStorage.setItem('octos-learning-oll:v4:old:none', 'x'.repeat(10000));
    localStorage.setItem('octos-learning-ink:v1:old', 'old');
    localStorage.setItem('octos-learning-ink-run:v1:old', '4');
    localStorage.setItem('selected_profile', 'alice');
    localStorage.setItem('octos-learning-ink-run:v2:new', '2');
    const store = await import('./learning-document-store');
    await store.initializeLearningDocuments();
    expect(localStorage.getItem('octos-learning-oll:v4:old:none')).toBeNull();
    expect(localStorage.getItem('octos-learning-ink:v1:old')).toBeNull();
    expect(localStorage.getItem('selected_profile')).toBe('alice');
    expect(localStorage.getItem('octos-learning-ink-run:v2:new')).toBe('2');
  });

  it('does not clear legacy data when the database cannot open', async () => {
    vi.stubGlobal('indexedDB', undefined);
    localStorage.setItem('octos-learning-ink:v1:old', 'old');
    const store = await import('./learning-document-store');
    await expect(store.initializeLearningDocuments()).rejects.toThrow();
    expect(localStorage.getItem('octos-learning-ink:v1:old')).toBe('old');
  });

  it('round trips large documents without localStorage and restores the ink index', async () => {
    const store = await import('./learning-document-store');
    await store.initializeLearningDocuments();
    const large = { ...record, svg: 'x'.repeat(6 * 1024 * 1024) };
    await store.indexedInkStore.save('octos-learning-ink:v1:session', large);
    expect(await store.indexedInkStore.load('octos-learning-ink:v1:session')).toEqual(large);
    expect(localStorage.length).toBe(0);
    vi.resetModules();
    const reopened = await import('./learning-document-store');
    await reopened.initializeLearningDocuments();
    expect(reopened.hasStoredSessionInk('session')).toBe(true);
    expect(await reopened.indexedInkStore.load('octos-learning-ink:v1:session')).toEqual(large);
  });

  it('hydrates playback, operations and tasks and orders save/remove operations', async () => {
    const store = await import('./learning-document-store');
    const playback = await store.createIndexedPlaybackStore('lesson');
    const checkpoint = { cursor: 3 } as Parameters<typeof playback.save>[1];
    playback.save('lesson', checkpoint);
    playback.saveStudentOperations!('lesson', { operations: [] } as never);
    playback.saveStudentTaskProgress!('lesson', { tasks: [] } as never);
    const reopened = await store.createIndexedPlaybackStore('lesson');
    expect(reopened.load('lesson')).toEqual(checkpoint);
    expect(reopened.loadStudentOperations!('lesson')).toEqual({ operations: [] });
    expect(reopened.loadStudentTaskProgress!('lesson')).toEqual({ tasks: [] });
    playback.remove('lesson');
    expect((await store.createIndexedPlaybackStore('lesson')).load('lesson')).toBeUndefined();
  });

  it('keeps an ink save pending on quota failure and completes it once after retry', async () => {
    const store = await import('./learning-document-store');
    await store.initializeLearningDocuments();
    const original = IDBObjectStore.prototype.put;
    const fail = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function () {
      throw new DOMException('full', 'QuotaExceededError');
    });
    let committed = 0;
    const save = Promise.resolve(store.indexedInkStore.save('octos-learning-ink:v1:test', record)).then(() => { committed++; });
    await vi.waitFor(() => expect(store.learningStorageStatus.getSnapshot()).toContain('保存失败'));
    expect(committed).toBe(0);
    expect(store.hasStoredInk('octos-learning-ink:v1:test')).toBe(false);
    fail.mockImplementation(original);
    await store.retryLearningDocumentWrites();
    await save;
    expect(committed).toBe(1);
    expect(store.learningStorageStatus.getSnapshot()).toBe('');
    expect(await store.indexedInkStore.load('octos-learning-ink:v1:test')).toEqual(record);
    fail.mockRestore();
  });
});

import { expect, test, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { HistoryStore } from '../services/learning-history/store.mjs';
import { createHistoryHandler } from '../services/learning-history/server.mjs';
import { installTestAccount } from './helpers/course-test-account';
import { collectionUrl } from './helpers/course-collection';

// Isolated automated account/database. Real browser, IndexedDB, Runtime and
// HTTP handler; no paid model, TTS provider or personal Octos data is used.
let store: InstanceType<typeof HistoryStore>, server: Server, endpoint: string;
let unavailable: boolean, loseReceipt: boolean;
test.beforeEach(async ({ page }) => {
  store = new HistoryStore(':memory:'); unavailable = false; loseReceipt = false;
  const handler = createHistoryHandler({ store, fetchImpl: async (_url: string, options: RequestInit) =>
    Response.json((options.headers as Record<string, string>).authorization === 'Bearer curated-course-e2e' ? { id: 'curated-learner' } : {}, { status: (options.headers as Record<string, string>).authorization === 'Bearer curated-course-e2e' ? 200 : 401 }) });
  server = createServer(async (request, response) => { await handler(request, response); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await installTestAccount(page);
  await page.route(url => url.pathname.startsWith('/api/learn/history/'), async route => {
    if (unavailable) return route.abort('internetdisconnected');
    const request = route.request();
    const headers = await request.allHeaders();
    delete headers.host; delete headers.origin; delete headers['content-length'];
    const response = await fetch(`${endpoint}${new URL(request.url()).pathname}${new URL(request.url()).search}`, {
      method: request.method(), headers, ...(['GET', 'HEAD'].includes(request.method()) ? {} : { body: request.postDataBuffer() }),
    });
    const body = await response.text();
    if (loseReceipt && request.method() === 'POST' && request.url().includes('/events')) {
      loseReceipt = false; return route.abort('connectionreset');
    }
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body });
  });
});
test.afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); });
async function open(page: Page) {
  await page.goto(collectionUrl('slope-and-intercept'));
  const card = page.locator('.course-launcher-card').filter({ has: page.getByRole('heading', { name: '一次函数 y = mx + b 的图像与性质', exact: true }) });
  await card.getByRole('button', { name: '开始互动', exact: true }).click();
  await page.getByRole('button', { name: '暂停 OLL 课程', exact: true }).click();
  await page.getByRole('button', { name: '关闭课程旁白语音', exact: true }).click();
}
async function queued(page: Page) {
  return page.evaluate(() => new Promise<{ owner: string; event: { id: string; kind: string; run_id: string } }[]>((resolve, reject) => {
    const request = indexedDB.open('octos-learning-documents');
    request.onsuccess = () => {
      const db = request.result; const tx = db.transaction('history-events'); const read = tx.objectStore('history-events').getAll();
      tx.oncomplete = () => { db.close(); resolve(read.result); }; tx.onabort = () => reject(tx.error);
    }; request.onerror = () => reject(request.error);
  }));
}

test('offline captured playback survives reload; a lost upload receipt cannot double counts', async ({ page }) => {
  await open(page);
  unavailable = true;
  await page.getByRole('button', { name: '重新播放 OLL 课程', exact: true }).click();
  // This is normal timed Runtime playback with narration disabled, not seeking.
  await expect.poll(async () => (await queued(page)).filter(row => row.event.kind === 'beat_completed').length, { timeout: 30000 }).toBeGreaterThan(0);
  await page.getByRole('button', { name: '暂停 OLL 课程', exact: true }).click();
  const before = await queued(page); const beatIds = before.filter(row => row.event.kind === 'beat_completed').map(row => row.event.id);
  expect(beatIds.length).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByTestId('oll-controls')).toBeVisible();
  const pause = page.getByRole('button', { name: '暂停 OLL 课程', exact: true }); if (await pause.isVisible()) await pause.click();
  expect((await queued(page)).map(row => row.event.id)).toEqual(expect.arrayContaining(beatIds));
  unavailable = false; loseReceipt = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => store.listRuns('curated-learner').runs.length).toBe(1);
  const first = store.listRuns('curated-learner').runs[0];
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(async () => (await queued(page)).length).toBe(0);
  expect(store.listRuns('curated-learner').runs[0].completed_beats).toBe(first.completed_beats);
  expect(first.completed_beats).toBeGreaterThan(0);
});

test('manual skipping creates position records but no proof of completed lecture', async ({ page }) => {
  await open(page); unavailable = true;
  const next = page.getByRole('button', { name: '下一 OLL Beat', exact: true });
  for (let i = 0; i < 15 && await next.isEnabled(); i++) await next.click();
  await expect.poll(async () => (await queued(page)).filter(row => row.event.kind === 'playback_position').length).toBeGreaterThan(0);
  expect((await queued(page)).filter(row => row.event.kind === 'beat_completed')).toHaveLength(0);
});

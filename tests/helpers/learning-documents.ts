import type { Page } from '@playwright/test';

export async function readLearningDocument(page: Page, key: string): Promise<unknown> {
  return page.evaluate(key => new Promise((resolve, reject) => {
    const request = indexedDB.open('octos-learning-documents', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('documents', 'readonly');
      const read = tx.objectStore('documents').get(key);
      tx.oncomplete = () => { db.close(); resolve(read.result ?? null); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), key);
}

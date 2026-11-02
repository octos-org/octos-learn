// Learner lesson packages made on this device, one per lesson, until the
// lesson is published (M6). The package keeps the lesson fingerprint it was
// made from, so a lesson changed since is noticed and packaged again.

const DATABASE_NAME = "octos-learner-packages";
const DATABASE_VERSION = 1;
const STORE = "packages";

export interface StoredLearnerPackage {
  recordingId: string;
  /** Fingerprint of the lesson the package was made from. */
  lessonFingerprint: string;
  contentSha256: string;
  archive: ArrayBuffer;
  builtAt: string;
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "recordingId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open lesson packages"));
  });
}

async function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>, factory: IDBFactory): Promise<T> {
  const database = await open(factory);
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = act(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? new Error("Lesson package storage failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Lesson package storage failed"));
    });
  } finally {
    database.close();
  }
}

export async function readStoredLearnerPackage(recordingId: string, factory: IDBFactory = indexedDB): Promise<StoredLearnerPackage | undefined> {
  const found = await run<StoredLearnerPackage | undefined>("readonly", (store) => store.get(recordingId), factory);
  return found && Object.prototype.toString.call(found.archive) === "[object ArrayBuffer]" ? found : undefined;
}

export async function writeStoredLearnerPackage(record: StoredLearnerPackage, factory: IDBFactory = indexedDB): Promise<void> {
  await run("readwrite", (store) => store.put(record), factory);
}

export async function deleteStoredLearnerPackage(recordingId: string, factory: IDBFactory = indexedDB): Promise<void> {
  await run("readwrite", (store) => store.delete(recordingId), factory);
}

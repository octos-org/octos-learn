import {
  parseCoursePackCatalog,
  type CoursePackCatalogEntry,
} from "./course-pack-catalog";

export interface StoredCoursePack {
  identity: string;
  packId: string;
  version: string;
  archiveSha256: string;
  archiveBytes: number;
  minimumPlayerVersion: string;
  installedAt: number;
  lastOpenedAt: number;
  archive: ArrayBuffer;
  thumbnail: Blob | null;
  catalogEntry: CoursePackCatalogEntry;
}

export interface InstalledCoursePack {
  identity: string;
  packId: string;
  version: string;
  archiveSha256: string;
  archiveBytes: number;
  minimumPlayerVersion: string;
  installedAt: number;
  lastOpenedAt: number;
  thumbnail: Blob | null;
  catalogEntry: CoursePackCatalogEntry;
}

const DATABASE_NAME = "octos-course-packs";
const DATABASE_VERSION = 1;
const ARCHIVE_STORE = "archives";
const PACK_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;

function identity(packId: string, version: string): string {
  return `${packId}@${version}`;
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer
    || Object.prototype.toString.call(value) === "[object ArrayBuffer]";
}

function isBlob(value: unknown): value is Blob {
  return value instanceof Blob || Object.prototype.toString.call(value) === "[object Blob]";
}

function isMatchingCatalogEntry(
  value: unknown,
  packId: string,
  version: string,
  digest: string,
  archiveBytes: number,
): value is CoursePackCatalogEntry {
  try {
    const entry = parseCoursePackCatalog({
      schemaVersion: 1,
      generatedAt: "stored",
      packs: [value],
    }).packs[0];
    return entry?.packId === packId && entry.version === version
      && entry.archiveSha256 === digest && entry.archiveBytes === archiveBytes;
  } catch {
    return false;
  }
}

function isStoredCoursePack(value: unknown): value is StoredCoursePack {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Partial<StoredCoursePack>;
  return typeof entry.packId === "string" && PACK_ID.test(entry.packId)
    && typeof entry.version === "string" && VERSION.test(entry.version)
    && entry.identity === identity(entry.packId, entry.version)
    && typeof entry.archiveSha256 === "string" && DIGEST.test(entry.archiveSha256)
    && typeof entry.archiveBytes === "number" && entry.archiveBytes >= 0
    && typeof entry.minimumPlayerVersion === "string" && VERSION.test(entry.minimumPlayerVersion)
    && typeof entry.installedAt === "number" && Number.isFinite(entry.installedAt)
    && typeof entry.lastOpenedAt === "number" && Number.isFinite(entry.lastOpenedAt)
    && isArrayBuffer(entry.archive) && entry.archiveBytes === entry.archive.byteLength
    && (entry.thumbnail === null || isBlob(entry.thumbnail))
    && isMatchingCatalogEntry(
      entry.catalogEntry,
      entry.packId,
      entry.version,
      entry.archiveSha256,
      entry.archiveBytes,
    );
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("课程包本地存储失败"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("课程包本地存储已中止"));
    transaction.onerror = () => reject(transaction.error ?? new Error("课程包本地存储失败"));
  });
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(ARCHIVE_STORE)) {
        request.result.createObjectStore(ARCHIVE_STORE, { keyPath: "identity" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开课程包本地存储"));
    request.onblocked = () => reject(new Error("课程包本地存储升级被阻止"));
  });
}

async function executeStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T>,
): Promise<T | null> {
  let database: IDBDatabase | null = null;
  try {
    database = await openDatabase();
    if (!database) return null;
    const transaction = database.transaction(ARCHIVE_STORE, mode);
    const done = transactionDone(transaction);
    let result: T;
    try {
      result = await operation(transaction.objectStore(ARCHIVE_STORE));
    } catch (error) {
      await done.catch(() => undefined);
      throw error;
    }
    await done;
    return result;
  } finally {
    database?.close();
  }
}

function installedMetadata(entry: StoredCoursePack): InstalledCoursePack {
  return {
    identity: entry.identity,
    packId: entry.packId,
    version: entry.version,
    archiveSha256: entry.archiveSha256,
    archiveBytes: entry.archiveBytes,
    minimumPlayerVersion: entry.minimumPlayerVersion,
    installedAt: entry.installedAt,
    lastOpenedAt: entry.lastOpenedAt,
    thumbnail: entry.thumbnail,
    catalogEntry: entry.catalogEntry,
  };
}

export async function readStoredCoursePack(
  packId: string,
  version: string,
): Promise<StoredCoursePack | null> {
  try {
    const result = await executeStore("readonly", async (store) => requestResult(
      store.get(identity(packId, version)),
    ));
    return isStoredCoursePack(result) ? result : null;
  } catch {
    return null;
  }
}

export async function listInstalledCoursePacks(): Promise<InstalledCoursePack[]> {
  try {
    const result = await executeStore("readonly", async (store) => requestResult(store.getAll()));
    if (!result) return [];
    return result.filter(isStoredCoursePack).map(installedMetadata);
  } catch {
    return [];
  }
}

export async function writeStoredCoursePack(entry: StoredCoursePack): Promise<boolean> {
  if (!isStoredCoursePack(entry)) return false;
  try {
    const result = await executeStore("readwrite", async (store) => {
      await requestResult(store.put(entry));
      return true;
    });
    if (result && typeof navigator !== "undefined" && navigator.storage?.persist) {
      void navigator.storage.persist().catch(() => false);
    }
    return result === true;
  } catch {
    // Quota pressure must not prevent playing the already validated download.
    return false;
  }
}

export async function deleteStoredCoursePack(packId: string, version: string): Promise<void> {
  try {
    await executeStore("readwrite", async (store) => {
      await requestResult(store.delete(identity(packId, version)));
    });
  } catch {
    // A corrupt or unavailable cache should degrade to a fresh download.
  }
}

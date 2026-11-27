// Arcade progress kept on this device (plan §7.13, decision 18). Not tied to
// an account, and never sent anywhere; M5 uploads it once to the account.
// No ink, images or landmarks are kept: only answers and round summaries.

import type { AnswerRecord } from "../core/fact-states";
import type { RoundSummary } from "../core/round-engine";

const DATABASE = "octos-arcade";
const VERSION = 1;
const ANSWERS = "answers";
const ROUNDS = "rounds";

export interface DeviceProgress {
  answers: AnswerRecord[];
  rounds: RoundSummary[];
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Arcade progress transaction aborted"));
  });
}

let opening: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DATABASE, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ANSWERS)) db.createObjectStore(ANSWERS, { keyPath: ["roundId", "item"] });
      if (!db.objectStoreNames.contains(ROUNDS)) db.createObjectStore(ROUNDS, { keyPath: "roundId" });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); opening = null; };
      resolve(db);
    };
    req.onerror = () => { opening = null; reject(req.error); };
  });
  return opening;
}

export async function loadProgress(): Promise<DeviceProgress> {
  const db = await open();
  const tx = db.transaction([ANSWERS, ROUNDS], "readonly");
  const finished = done(tx);
  const [answers, rounds] = await Promise.all([
    request(tx.objectStore(ANSWERS).getAll() as IDBRequest<AnswerRecord[]>),
    request(tx.objectStore(ROUNDS).getAll() as IDBRequest<RoundSummary[]>),
  ]);
  await finished;
  return { answers, rounds };
}

/** Answers are keyed by round and item, so saving one twice keeps one copy. */
export async function saveAnswer(answer: AnswerRecord): Promise<void> {
  const db = await open();
  const tx = db.transaction(ANSWERS, "readwrite");
  tx.objectStore(ANSWERS).put(answer);
  await done(tx);
}

export async function saveRound(summary: RoundSummary): Promise<void> {
  const db = await open();
  const tx = db.transaction(ROUNDS, "readwrite");
  tx.objectStore(ROUNDS).put(summary);
  await done(tx);
}

/** "Clear Arcade progress on this device". */
export async function clearProgress(): Promise<void> {
  const db = await open();
  const tx = db.transaction([ANSWERS, ROUNDS], "readwrite");
  tx.objectStore(ANSWERS).clear();
  tx.objectStore(ROUNDS).clear();
  await done(tx);
}

export function totalInkDrops(rounds: readonly RoundSummary[]): number {
  return rounds.reduce((sum, round) => sum + round.inkDrops, 0);
}

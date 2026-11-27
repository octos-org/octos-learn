import { IDBFactory } from "fake-indexeddb";
import { beforeEach, expect, it, vi } from "vitest";
import type { AnswerRecord } from "../core/fact-states";
import type { RoundSummary } from "../core/round-engine";

beforeEach(() => { vi.resetModules(); vi.stubGlobal("indexedDB", new IDBFactory()); });

const answer = (item: number): AnswerRecord => ({ roundId: "r1", item, factId: "add:3:4", form: "result", input: "keypad", result: "correct", given: 7, totalMs: 1200, at: 1000 + item, day: 20000 });
const round: RoundSummary = { roundId: "r1", skillId: "add-sub-10", gameId: "margin-run", input: "keypad", reason: "finished", answered: 2, correct: 2, inkDrops: 10, bestStreak: 2, startedAt: 1, endedAt: 2 };

it("keeps answers and rounds on the device, once each, until cleared", async () => {
  const store = await import("./device-progress");
  await store.saveAnswer(answer(0));
  await store.saveAnswer(answer(1));
  await store.saveAnswer(answer(1));
  await store.saveRound(round);
  const progress = await store.loadProgress();
  expect(progress.answers.map(entry => entry.item)).toEqual([0, 1]);
  expect(store.totalInkDrops(progress.rounds)).toBe(10);
  await store.clearProgress();
  expect(await store.loadProgress()).toEqual({ answers: [], rounds: [] });
});

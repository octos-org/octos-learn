import type { AuthoringStudentTask } from "octos-lesson-language";
import { BrowserLessonSession, parseCanonicalJsonl, type PlaybackStore } from "octos-lesson-language/web-runtime";
import { describe, expect, it } from "vitest";

import makeTenSource from "../../../tests/fixtures/make-ten-en.canonical.jsonl?raw";
import compareEqualSource from "../../../tests/fixtures/place-value-compare-equal.canonical.jsonl?raw";
import compareWholeSource from "../../../tests/fixtures/place-value-compare-whole.canonical.jsonl?raw";
import timesTenCountSource from "../../../tests/fixtures/place-value-times-ten-count.canonical.jsonl?raw";
import timesTenTimesSource from "../../../tests/fixtures/place-value-times-ten-times.canonical.jsonl?raw";
import { cardTaskHintFromStart } from "./card-task-hint";
import { cardTaskHowTo } from "./card-task-how-to";
import { NATURAL_SIZE_CARD_KINDS } from "./natural-size-card-frame";
import { answerWaitsOnCardTask } from "./visible-answer-tasks";

// The make-ten card (OLL 0027), the place-value times-ten card (OLL 0028) and the place-value compare card (OLL 0029),
// played by the pinned player from OLL's own test fixtures (tests/fixtures, compiled with normalizeAuthoringLesson; no model call): what Learn's helpers
// make of their tasks before the card is finished and after the tap that finishes it.

function memoryStore(): PlaybackStore {
  const values = new Map<string, unknown>();
  const get = <T>(key: string) => structuredClone(values.get(key)) as T;
  const set = (key: string, value: unknown) => { values.set(key, structuredClone(value)); };
  return {
    load: (key) => get(key),
    save: (key, value) => set(key, value),
    remove: (key) => { values.delete(key); },
    loadStudentOperations: (key) => get(`${key}:ops`),
    saveStudentOperations: (key, value) => set(`${key}:ops`, value),
    loadStudentTaskProgress: (key) => get(`${key}:tasks`),
    saveStudentTaskProgress: (key, value) => set(`${key}:tasks`, value),
  } as PlaybackStore;
}

/** The lesson played to its end, as Learn opens it: the practice card task open, the card live. */
function played(source: string, key: string) {
  const events = parseCanonicalJsonl(source);
  const session = new BrowserLessonSession(events, memoryStore(), key, { reducedMotion: true });
  session.seek(session.projection.total_operations);
  const definitions = (events[0] as unknown as { lesson: { tasks: AuthoringStudentTask[] } }).lesson.tasks;
  const node = Object.entries(session.projection.board!.nodes).find(([, candidate]) => NATURAL_SIZE_CARD_KINDS.has(candidate.kind))!;
  const task = (id: string) => session.studentTasks.find((snapshot) => snapshot.task_id === id)!;
  return { session, definitions, nodeId: node[0], node: node[1], task };
}

describe.each([
  {
    name: "make-ten 7 + 5 (OLL 0027)", source: makeTenSource, kind: "make_ten", blanks: 4,
    // Three blue counters across: the third makes the ten.
    finish: ["give:1", "give:1", "give:1"],
  },
  {
    name: "times-ten 5 ones = ? hundredths (OLL 0028)", source: timesTenCountSource, kind: "place_value_times_ten", blanks: 1,
    // Each one into a row of ten tenths, then each row into a square of a hundred hundredths.
    finish: [0, 1, 2, 3, 4, 0, 1, 2, 3, 4].map((row) => `move:${row}`),
  },
  {
    name: "times-ten 4,000 is ? times 400 (OLL 0028)", source: timesTenTimesSource, kind: "place_value_times_ten", blanks: 2,
    // Each thousand dealt into the ten copies.
    finish: [0, 1, 2, 3].map((row) => `move:${row}`),
  },
])("$name", ({ source, kind, blanks, finish }) => {
  it("is held at natural size and draws its own how-to line, so Learn shows none beside its task", () => {
    const { node } = played(source, `${kind}-kind`);
    expect(node.kind).toBe(kind);
    expect(NATURAL_SIZE_CARD_KINDS.has(kind)).toBe(true);
    expect(cardTaskHowTo(node.kind, node.content)).toBeUndefined();
  });

  it("opens with no done, the hint from the start and its row of blanks waiting on the card", () => {
    const { definitions, nodeId, session, task } = played(source, `${kind}-open`);
    expect(definitions.map((definition) => definition.completion.kind)).toEqual(["card_fact", "numeric_row"]);
    const row = definitions[1]!;
    expect((row as { anchor?: string }).anchor).toBe(nodeId);
    expect(row.completion.kind === "numeric_row" && row.completion.parts.filter((part) => "blank" in part)).toHaveLength(blanks);
    const card = task(definitions[0]!.as);
    expect(card).toMatchObject({ available: true, auto_submit: true });
    expect(cardTaskHintFromStart(card)).toBe(true);
    expect(task(row.as).available).toBe(false);
    expect(answerWaitsOnCardTask(row.as, session.studentTasks, definitions)).toBe(true);
  });

  it("the tap that finishes the card ends its task and opens the row", () => {
    const { definitions, nodeId, session, task } = played(source, `${kind}-finish`);
    for (const [at, tap] of finish.entries()) {
      const [tapKind, place] = tap.split(":");
      expect(session.tapStudentCard(nodeId, { kind: tapKind!, place: Number(place) })).toHaveProperty("operation");
      if (at < finish.length - 1) expect(answerWaitsOnCardTask(definitions[1]!.as, session.studentTasks, definitions)).toBe(true);
    }
    expect(task(definitions[0]!.as).status).toBe("succeeded");
    expect(task(definitions[1]!.as).available).toBe(true);
    expect(answerWaitsOnCardTask(definitions[1]!.as, session.studentTasks, definitions)).toBe(false);
  });
});

// The compare card's task is the lesson's only one: it ends on the card, with the learner's sign, and nothing is typed
// under it. A tap names a place index (the place plus three: thousands 6, ones 3, tenths 2), a sign 10 to 12 (>, =, <).
describe.each([
  {
    name: "compare 6,281 and 6,218 (OLL 0029)", source: compareWholeSource,
    // Same on the thousands and hundreds, Different on the tens, then ">".
    judge: ["same:6", "same:5", "different:4"], wrong: "sign:12", sign: "sign:10",
  },
  {
    name: "compare 2.50 and 2.5 (OLL 0029)", source: compareEqualSource,
    // Same on every place, then "=".
    judge: ["same:3", "same:2", "same:1"], wrong: "sign:10", sign: "sign:11",
  },
])("$name", ({ source, judge, wrong, sign }) => {
  const tap = (session: BrowserLessonSession, nodeId: string, at: string) => {
    const [kind, place] = at.split(":");
    return session.tapStudentCard(nodeId, { kind: kind!, place: Number(place) });
  };

  it("is held at natural size and draws its own how-to line, so Learn shows none beside its task", () => {
    const { node } = played(source, "compare-kind");
    expect(node.kind).toBe("place_value_compare");
    expect(cardTaskHowTo(node.kind, node.content)).toBeUndefined();
  });

  it("opens with no done and the hint from the start; there is no row to wait on it", () => {
    const { definitions, task } = played(source, "compare-open");
    expect(definitions.map((definition) => definition.completion.kind)).toEqual(["card_fact"]);
    const card = task(definitions[0]!.as);
    expect(card).toMatchObject({ available: true, auto_submit: true });
    expect(cardTaskHintFromStart(card)).toBe(true);
  });

  it("a sign before the places are judged, and a wrong sign, leave it open; the true sign ends it", () => {
    const { definitions, nodeId, session, task } = played(source, "compare-finish");
    expect(tap(session, nodeId, sign)).not.toHaveProperty("operation");
    for (const at of judge) expect(tap(session, nodeId, at)).toHaveProperty("operation");
    expect(tap(session, nodeId, wrong)).not.toHaveProperty("operation");
    expect(task(definitions[0]!.as).status).not.toBe("succeeded");
    expect(tap(session, nodeId, sign)).toHaveProperty("operation");
    expect(task(definitions[0]!.as).status).toBe("succeeded");
  });
});

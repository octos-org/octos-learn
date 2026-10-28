import { expect, it } from "vitest";

import atlas from "./star-atlas/atlas.json";
import bank from "./topic-prompts-zh.json";
import { nextStepDraft } from "./next-step-line";
import { topicPrompts } from "./topic-prompts";

const prompts = bank.prompts as Record<string, string[]>;
const ids = (atlas.topics as unknown as [string][]).map(([id]) => id);

it("has three starter questions for every star on the atlas, none of them the old bare definition question", () => {
  expect(Object.keys(prompts).sort()).toEqual([...ids].sort());
  for (const id of ids) {
    expect(prompts[id]).toHaveLength(3);
    for (const text of prompts[id]) {
      expect(text.length).toBeGreaterThanOrEqual(10);
      expect(text.length).toBeLessThanOrEqual(80);
      expect(text).not.toMatch(/^[^，。？]{1,12}是什么？$/);
      // Each question stands alone; a new board has nothing to point back at.
      expect(text).not.toMatch(/^(这个|上面|刚才)/);
    }
  }
});

it("puts first the question that fits where the learner is", () => {
  const id = ids[0];
  const [hook, attempt, stretch] = prompts[id];
  expect(topicPrompts(id, "x").map((prompt) => prompt.text)).toEqual([hook, attempt, stretch]);
  expect(topicPrompts(id, "x", "practising")[0]).toMatchObject({ kind: "try", text: attempt, recommended: true });
  expect(topicPrompts(id, "x", "did-it")[0]).toMatchObject({ kind: "stretch", text: stretch, recommended: true });
  expect(topicPrompts(id, "x", "did-it").filter((prompt) => prompt.recommended)).toHaveLength(1);
});

it("suggestions start a new topic from its real-life question and continue a visited one where the learner is", () => {
  const [a, b] = ids;
  const topic = { topic_id: a, name: "A", subject: "Mathematics", domain: "Algebra", state: "practising" as const, last_at: "" };
  const resume = { session_id: "s", run_id: "r" };
  expect(nextStepDraft({ id: "1", type: "continue", topic, resume })).toBe(prompts[a][1]);
  expect(nextStepDraft({ id: "2", type: "next", topic, resume, target: { topic_id: b, name: "B", subject: "Mathematics", domain: "Algebra", strength: "hard", reason: "" } })).toBe(prompts[b][0]);
});

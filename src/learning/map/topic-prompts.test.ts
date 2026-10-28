import { expect, it } from "vitest";

import atlas from "./star-atlas/atlas.json";
import bank from "./topic-prompts-zh.json";
import { nextStepDraft } from "./next-step-line";
import { recommendedPrompt, topicPrompts } from "./topic-prompts";

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
  expect(recommendedPrompt(undefined)).toBe("hook");
  expect(recommendedPrompt("explored")).toBe("try");
  expect(recommendedPrompt("practising")).toBe("try");
  expect(recommendedPrompt("did-it")).toBe("stretch");
  expect(topicPrompts(prompts, id, "x").map((prompt) => prompt.text)).toEqual([hook, attempt, stretch]);
  expect(topicPrompts(prompts, id, "x", "stretch")[0]).toMatchObject({ kind: "stretch", text: stretch, recommended: true });
  expect(topicPrompts(prompts, id, "x", "stretch").filter((prompt) => prompt.recommended)).toHaveLength(1);
  // An entry without three questions (or no bank yet) falls back to one plain question.
  expect(topicPrompts({ [id]: [hook, attempt] }, id, "斜率")).toEqual([expect.objectContaining({ text: "斜率是什么？生活里哪里会用到它？" })]);
  expect(topicPrompts(null, id, "斜率")).toHaveLength(1);
});

it("suggestions start a new topic from its real-life question and continue or revisit one with a problem to try", async () => {
  const [a, b] = ids;
  const resume = { session_id: "s", run_id: "r" };
  const done = { topic_id: a, name: "A", subject: "Mathematics", domain: "Algebra", state: "did-it" as const, last_at: "" };
  expect(await nextStepDraft({ id: "1", type: "continue", topic: done, resume })).toBe(prompts[a][1]);
  expect(await nextStepDraft({ id: "2", type: "revisit", topic: done, resume, days_away: 12 })).toBe(prompts[a][1]);
  expect(await nextStepDraft({ id: "3", type: "next", topic: done, resume, target: { topic_id: b, name: "B", subject: "Mathematics", domain: "Algebra", strength: "hard", reason: "" } })).toBe(prompts[b][0]);
  // Other subjects have no starter questions yet and keep the plain request.
  const science = { ...done, topic_id: "sc_unknown", name: "Photosynthesis", subject: "Science" };
  expect(await nextStepDraft({ id: "4", type: "continue", topic: science, resume })).toBe("我想再学一下Photosynthesis");
});

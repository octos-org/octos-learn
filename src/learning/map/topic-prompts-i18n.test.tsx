import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { setLocale } from "@/i18n";
import english from "./topic-prompts-en.json";
import chinese from "./topic-prompts-zh.json";
import { loadPromptBank, topicDraft, usePromptBank } from "./topic-prompts";

afterEach(() => setLocale("zh-CN", false));

it("keeps all 567 topics and three distinct starter questions in both languages", () => {
  expect(Object.keys(english.prompts)).toEqual(Object.keys(chinese.prompts));
  expect(Object.keys(english.prompts)).toHaveLength(567);
  for (const [id, questions] of Object.entries(english.prompts)) {
    expect(questions, id).toHaveLength(3);
    expect(new Set(questions).size, id).toBe(3);
    for (const question of questions) expect(question.length, id).toBeGreaterThan(15);
  }
});

it("loads separate banks and applies only the latest language to visible recommendations", async () => {
  setLocale("zh-CN", false);
  const { result } = renderHook(() => usePromptBank());
  act(() => setLocale("en-US", false));
  await waitFor(() => expect(result.current).toEqual(english.prompts));
  expect(await loadPromptBank("zh-CN")).toEqual(chinese.prompts);
  expect(result.current).toEqual(english.prompts);
  act(() => setLocale("zh-CN", false));
  await waitFor(() => expect(result.current).toEqual(chinese.prompts));
});

it("pins a requested draft before async loading without rewriting a learner's question", async () => {
  setLocale("en-US", false);
  const id = Object.keys(english.prompts)[0] as keyof typeof english.prompts;
  const draft = topicDraft(id, "unused", "try");
  setLocale("zh-CN", false);
  expect(await draft).toBe(english.prompts[id][1]);
  expect(await topicDraft(id, "unused", "try")).toBe(chinese.prompts[id][1]);
});

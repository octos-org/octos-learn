import { afterEach, beforeEach, expect, it } from "vitest";

import { setLocale } from "@/i18n";
import { presenterLessonVoices, presenterVoiceNote } from "./speech-service";

beforeEach(() => setLocale("en-US"));
afterEach(() => setLocale("zh-CN"));

it("narrates a lesson in its character's own voice for the learner's speech resource", () => {
  expect(presenterLessonVoices("moon-cat", "seed-tts-2.0")).toEqual({ "seed-tts-2.0": { id: "zh_female_shaoergushi_uranus_bigtts" } });
  expect(presenterLessonVoices("red-panda", "azure")).toEqual({ azure: { id: "en-US-AndrewNeural" } });
  // Legacy or missing characters are presented by the default one.
  expect(presenterLessonVoices("avatar-3", "seed-tts-1.0")).toEqual({ "seed-tts-1.0": { id: "zh_male_shaonianzixin_moon_bigtts" } });
  // A resource without the characters' voices uses the saved settings voice.
  expect(presenterLessonVoices("moon-cat", "custom-resource")).toBeNull();
  expect(presenterLessonVoices("moon-cat", undefined)).toBeNull();
});

it("tells the learner when the characters' voices cannot be used", () => {
  expect(presenterVoiceNote("on", "seed-tts-2.0")).toBeNull();
  expect(presenterVoiceNote("checking", undefined)).toBeNull();
  expect(presenterVoiceNote("on", "custom-resource")).toBe("Your speech service doesn't have these characters' voices, so your lesson will use the voice saved in Settings.");
  expect(presenterVoiceNote("unavailable", undefined)).toMatch(/captions only/);
});

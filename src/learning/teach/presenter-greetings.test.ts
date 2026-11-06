import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

import { GREETINGS_MANIFEST, greetingLocale, nextGreeting, parseGreetingsManifest, PRESENTER_GREETINGS } from "./presenter-greetings";
import { PRESENTER_AVATARS } from "./presenters";

it("gives every character five to ten short lines in each language", () => {
  expect(Object.keys(PRESENTER_GREETINGS).sort()).toEqual(PRESENTER_AVATARS.map((avatar) => avatar.id).sort());
  for (const byLocale of Object.values(PRESENTER_GREETINGS)) {
    for (const lines of [byLocale.zh, byLocale.en]) {
      expect(lines.length).toBeGreaterThanOrEqual(5);
      expect(lines.length).toBeLessThanOrEqual(10);
      expect(new Set(lines).size).toBe(lines.length);
    }
    for (const line of byLocale.zh) expect(line.length).toBeLessThanOrEqual(24);
    for (const line of byLocale.en) expect(line.split(" ").length).toBeLessThanOrEqual(14);
  }
});

it("never says the same line twice in a row, and plays a clip only for the exact line it was made for", () => {
  const manifest = parseGreetingsManifest({ schema: "octos.presenter-greetings.v1", clips: [
    { avatar: "moon-cat", locale: "en", text: PRESENTER_GREETINGS["moon-cat"].en[0], file: "moon-cat/en-aaaaaaaaaaaa.mp3", provider: "azure", voice: "en-US-AvaNeural" },
    { avatar: "moon-cat", locale: "en", text: "An edited line", file: "moon-cat/en-bbbbbbbbbbbb.mp3", provider: "azure", voice: "en-US-AvaNeural" },
    { avatar: "moon-cat", locale: "en", text: "Bad path", file: "../secret.mp3", provider: "azure", voice: "x" },
  ] });
  expect(manifest?.clips).toHaveLength(2);
  const first = nextGreeting("moon-cat", "en", manifest, null, () => 0);
  expect(first).toEqual({ text: PRESENTER_GREETINGS["moon-cat"].en[0], clipUrl: "/teach-avatars/greetings/moon-cat/en-aaaaaaaaaaaa.mp3" });
  for (let draw = 0; draw < 1; draw += 0.1) {
    const next = nextGreeting("moon-cat", "en", manifest, first.text, () => draw);
    expect(next.text).not.toBe(first.text);
    expect(next.clipUrl).toBeNull();
  }
  expect(greetingLocale("zh-CN")).toBe("zh");
  expect(greetingLocale("en-US")).toBe("en");
});

it("lists only clips that exist, for current lines", () => {
  const path = `public/${GREETINGS_MANIFEST}`;
  if (!existsSync(path)) return;
  const manifest = parseGreetingsManifest(JSON.parse(readFileSync(path, "utf8")))!;
  for (const clip of manifest.clips) {
    expect(existsSync(`public/teach-avatars/greetings/${clip.file}`)).toBe(true);
    expect(PRESENTER_GREETINGS[clip.avatar][clip.locale]).toContain(clip.text);
    expect(PRESENTER_AVATARS.find((avatar) => avatar.id === clip.avatar)!.voices[clip.provider === "azure" ? "azure" : "seed-tts-2.0"]).toBe(clip.voice);
  }
});

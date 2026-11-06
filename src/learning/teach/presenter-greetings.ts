// What each presenter character says when a learner picks it. The lines are
// spoken in the character's own voice by clips made ahead of time
// (scripts/generate-presenter-greetings.ts), so a greeting plays at once and
// needs no speech service. Clips are listed in a manifest; a line without a
// clip is still shown, without sound.

import type { PresenterCharacterId } from "./presenters";

export type GreetingLocale = "zh" | "en";

/** Five to ten short lines per character and language, in the character's manner. */
export const PRESENTER_GREETINGS: Readonly<Record<PresenterCharacterId, Readonly<Record<GreetingLocale, readonly string[]>>>> = {
  // Curious, adventurous: the star map is a place to explore.
  "star-fox": {
    zh: [
      "嗨！我是星狐，这节课就交给我来讲吧！",
      "出发！我们一起去星图上探险！",
      "每个问题后面都藏着一颗星星，我们去找它！",
      "我已经等不及要讲你的课啦！",
      "好奇心就是我的指南针，走吧！",
      "准备好了吗？三、二、一，出发！",
    ],
    en: [
      "Hi! I'm Star Fox. Let me present your lesson!",
      "Let's go exploring the star map together!",
      "Every question hides a star. Let's go find it!",
      "I can't wait to teach your lesson!",
      "Curiosity is my compass. Let's go!",
      "Ready? Three, two, one, go!",
    ],
  },
  // Warm and patient: one step at a time.
  "red-panda": {
    zh: [
      "你好呀，我是小熊猫。别着急，我们一步一步来。",
      "你的课，我会认真讲好的。",
      "慢慢讲，讲清楚，就是最好的课。",
      "听的人哪里不懂，我就耐心再讲一遍。",
      "有我在，放心吧。",
      "今天也一起加油哦。",
    ],
    en: [
      "Hello, I'm Red Panda. No rush. We'll go step by step.",
      "I'll take good care of your lesson.",
      "Slow and clear makes the best lesson.",
      "If anyone gets stuck, I'll patiently explain it again.",
      "Don't worry, I've got you.",
      "Let's do our best together today.",
    ],
  },
  // Lively and full of ideas.
  "white-rabbit": {
    zh: [
      "哈喽哈喽！我是白兔，选我选我！",
      "我脑袋里装满了好点子，快来看！",
      "蹦一下，就到下一张卡片啦！",
      "我讲课又快又清楚，不信你听！",
      "哇，这个主题好有意思！",
      "耳朵竖起来，要开始啦！",
    ],
    en: [
      "Hi hi! I'm White Rabbit. Pick me, pick me!",
      "My head is full of great ideas. Come and see!",
      "One hop, and we're on the next card!",
      "I'm quick and clear. Just listen!",
      "Wow, this topic is so cool!",
      "Ears up! Here we go!",
    ],
  },
  // Quiet and imaginative: a lesson told like a story.
  "moon-cat": {
    zh: [
      "晚上好……啊不，你好。我是月猫。",
      "我们安静地，把这节课讲成一个小故事吧。",
      "月亮慢慢地走，我们也慢慢地讲。",
      "闭上眼睛想一想，答案会像星星一样亮起来。",
      "每个想法，都值得好好听完。",
      "让我用月光，把你的课照亮。",
    ],
    en: [
      "Good evening... oh, I mean hello. I'm Moon Cat.",
      "Let's tell this lesson quietly, like a little story.",
      "The moon moves slowly, and so will we.",
      "Close your eyes and think. The answer will light up like a star.",
      "Every idea deserves to be heard all the way through.",
      "Let me light up your lesson with moonlight.",
    ],
  },
};

export const GREETINGS_ROOT = "teach-avatars/greetings";
export const GREETINGS_MANIFEST = `${GREETINGS_ROOT}/manifest.json`;
export const GREETINGS_SCHEMA = "octos.presenter-greetings.v1";

/** One prepared clip: a line in a character's voice. */
export interface GreetingClip {
  avatar: PresenterCharacterId;
  locale: GreetingLocale;
  text: string;
  /** Relative to GREETINGS_ROOT. */
  file: string;
  provider: "volcano" | "azure";
  voice: string;
}

export interface GreetingsManifest {
  schema: typeof GREETINGS_SCHEMA;
  clips: GreetingClip[];
}

export function greetingLocale(appLocale: string): GreetingLocale {
  return appLocale.toLowerCase().startsWith("zh") ? "zh" : "en";
}

/** A greeting to say: its line, and its clip when one was made for that exact line. */
export interface Greeting {
  text: string;
  clipUrl: string | null;
}

/**
 * The next line for a character, never the same line twice in a row. Clips
 * whose text no longer matches a line are ignored, so an edited line plays
 * silently until its clip is made again.
 */
export function nextGreeting(avatar: PresenterCharacterId, locale: GreetingLocale, manifest: GreetingsManifest | null,
  previous: string | null, random: () => number = Math.random): Greeting {
  const lines = PRESENTER_GREETINGS[avatar][locale];
  const choices = lines.length > 1 ? lines.filter((line) => line !== previous) : lines;
  const text = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))]!;
  const clip = manifest?.clips.find((entry) => entry.avatar === avatar && entry.locale === locale && entry.text === text);
  return { text, clipUrl: clip ? `${import.meta.env.BASE_URL}${GREETINGS_ROOT}/${clip.file}` : null };
}

export function parseGreetingsManifest(raw: unknown): GreetingsManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { schema?: unknown; clips?: unknown };
  if (value.schema !== GREETINGS_SCHEMA || !Array.isArray(value.clips)) return null;
  const clips = value.clips.filter((clip): clip is GreetingClip => Boolean(clip) && typeof clip === "object"
    && typeof (clip as GreetingClip).avatar === "string" && ((clip as GreetingClip).locale === "zh" || (clip as GreetingClip).locale === "en")
    && typeof (clip as GreetingClip).text === "string" && typeof (clip as GreetingClip).file === "string" && /^[a-z0-9-]+\/[a-z0-9-]+\.mp3$/.test((clip as GreetingClip).file));
  return { schema: GREETINGS_SCHEMA, clips };
}

let manifestLoad: Promise<GreetingsManifest | null> | null = null;
/** The clip manifest, loaded once per page; null when there is none yet. */
export function loadGreetingsManifest(): Promise<GreetingsManifest | null> {
  manifestLoad ??= fetch(`${import.meta.env.BASE_URL}${GREETINGS_MANIFEST}`)
    .then((response) => (response.ok ? response.json() : null))
    .then(parseGreetingsManifest)
    .catch(() => null);
  return manifestLoad;
}

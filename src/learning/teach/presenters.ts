// Who presents a learner's lesson: one of the app's characters, each with its
// own synthetic voice, so a lesson never carries the learner's own face or
// voice. The lesson refers to the character only by catalog ID.

import { tr } from "@/i18n";

/** The painted 2D characters a lesson can be presented by (src/learning/avatar/painted-characters.ts). */
export type PresenterCharacterId = "star-fox" | "red-panda" | "white-rabbit" | "moon-cat";

/** A presenter avatar: one of the painted 2D characters, shown animated when the lesson has mouth motion. */
export interface PresenterAvatar {
  id: PresenterCharacterId;
  name: () => string;
  /** The completed upright portrait, relative to the app's base URL; the same file the animated character draws. */
  portrait: string;
  /** Background behind the portrait, and of the placeholder if it cannot load. */
  color: string;
  /** In a few words, how the character speaks. */
  manner: () => string;
  /**
   * The character's voice for each speech resource it can be narrated with
   * (Volcano resource ID, or "azure"). Greeting clips are made with the same voices.
   */
  voices: Readonly<Record<SpeechResourceId, string>>;
}

export type SpeechResourceId = "seed-tts-2.0" | "seed-tts-1.0" | "seed-tts-1.0-concurr" | "azure";

/**
 * The presenter catalog. Each ID is also the character ID of the animated
 * 2D stage and the catalog ID in the lesson's `avatar:` reference.
 * The earlier placeholder slots (octo, avatar-2 … avatar-6) never had artwork;
 * lessons that name them are shown with the default character.
 */
export const PRESENTER_AVATARS: PresenterAvatar[] = [
  { id: "star-fox", name: () => tr("星狐"), portrait: "teach-avatars/star-fox/painted-v0.3/portrait-extended.png", color: "#f3e3cf",
    manner: () => tr("好奇、爱冒险"),
    voices: { "seed-tts-2.0": "zh_male_linjiananhai_uranus_bigtts", "seed-tts-1.0": "zh_male_shaonianzixin_moon_bigtts", "seed-tts-1.0-concurr": "zh_male_shaonianzixin_moon_bigtts", azure: "en-US-BrianNeural" } },
  { id: "red-panda", name: () => tr("小熊猫"), portrait: "teach-avatars/red-panda/painted-v0.1/portrait.png", color: "#f1ddd6",
    manner: () => tr("温暖、有耐心"),
    voices: { "seed-tts-2.0": "zh_male_wennuanahu_uranus_bigtts", "seed-tts-1.0": "zh_male_wennuanahu_moon_bigtts", "seed-tts-1.0-concurr": "zh_male_wennuanahu_moon_bigtts", azure: "en-US-AndrewNeural" } },
  { id: "white-rabbit", name: () => tr("白兔"), portrait: "teach-avatars/white-rabbit/painted-v0.1/portrait.png", color: "#e9e7f2",
    manner: () => tr("活泼、点子多"),
    voices: { "seed-tts-2.0": "zh_female_tianmeiyueyue_uranus_bigtts", "seed-tts-1.0": "zh_female_shuangkuaisisi_moon_bigtts", "seed-tts-1.0-concurr": "zh_female_shuangkuaisisi_moon_bigtts", azure: "en-US-AnaNeural" } },
  { id: "moon-cat", name: () => tr("月猫"), portrait: "teach-avatars/moon-cat/painted-v0.1/portrait.png", color: "#e6e1f2",
    manner: () => tr("安静、爱想象"),
    voices: { "seed-tts-2.0": "zh_female_shaoergushi_uranus_bigtts", "seed-tts-1.0": "zh_female_shaoergushi_mars_bigtts", "seed-tts-1.0-concurr": "zh_female_shaoergushi_mars_bigtts", azure: "en-US-AvaNeural" } },
];

export const DEFAULT_AVATAR: PresenterCharacterId = "star-fox";

export function presenterAvatar(id: string | undefined): PresenterAvatar {
  return PRESENTER_AVATARS.find((avatar) => avatar.id === id) ?? PRESENTER_AVATARS.find((avatar) => avatar.id === DEFAULT_AVATAR)!;
}

/** The presenter a package names by its `avatar:` reference. */
export function presenterOfReference(reference: string | undefined): PresenterAvatar {
  return presenterAvatar(reference?.replace(/^avatar:/, ""));
}

/** Where an avatar's portrait is served from. */
export function avatarArtUrl(avatar: PresenterAvatar): string {
  return `${import.meta.env.BASE_URL}${avatar.portrait}`;
}

/** The character's own voice for the learner's speech resource; undefined when the resource has none (the saved settings voice is used). */
export function presenterVoiceFor(avatar: PresenterAvatar, resourceId: string | undefined): string | undefined {
  return (avatar.voices as Record<string, string | undefined>)[resourceId?.trim() ?? ""];
}

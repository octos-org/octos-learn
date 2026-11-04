// Who presents a learner's lesson: an avatar and a synthetic voice, chosen by
// the learner from catalogs the app controls, so a lesson never carries the
// learner's own face or voice. The lesson refers to them only by catalog ID.

import { tr } from "@/i18n";

/** A voice offered to learners, for one speech resource. */
export interface PresenterVoice {
  /** The provider's voice ID; also the catalog ID in the lesson's `voice:` reference. */
  id: string;
  name: () => string;
}

/**
 * Friendly voices that read English well, per Volcano speech resource. The
 * catalog has no native US English or child voices yet; this set is revisited
 * with the en-US provider decision.
 */
const VOICES: Record<string, PresenterVoice[]> = {
  "seed-tts-2.0": [
    { id: "zh_female_vv_uranus_bigtts", name: () => tr("Vivi") },
    { id: "zh_female_shaoergushi_uranus_bigtts", name: () => tr("讲故事的姐姐") },
    { id: "zh_male_linjiananhai_uranus_bigtts", name: () => tr("邻家男孩") },
    { id: "zh_female_tianmeiyueyue_uranus_bigtts", name: () => tr("甜美悦悦") },
    { id: "zh_male_yangguangqingnian_uranus_bigtts", name: () => tr("阳光哥哥") },
    { id: "zh_male_wennuanahu_uranus_bigtts", name: () => tr("温暖阿虎") },
  ],
  "seed-tts-1.0": [
    { id: "zh_female_yingyujiaoyu_mars_bigtts", name: () => tr("Tina 老师") },
    { id: "zh_female_shuangkuaisisi_moon_bigtts", name: () => tr("Skye") },
    { id: "zh_female_cancan_mars_bigtts", name: () => tr("Shiny") },
    { id: "zh_male_wennuanahu_moon_bigtts", name: () => tr("Alvin") },
    { id: "zh_male_shaonianzixin_moon_bigtts", name: () => tr("Brayan") },
    { id: "zh_female_shaoergushi_mars_bigtts", name: () => tr("讲故事的姐姐") },
  ],
};
VOICES["seed-tts-1.0-concurr"] = VOICES["seed-tts-1.0"]!;

/** The voices a learner can choose with this speech resource; none for an unknown resource. */
export function presenterVoices(resourceId: string | undefined): PresenterVoice[] {
  return VOICES[resourceId?.trim() ?? ""] ?? [];
}

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
}

/**
 * The presenter catalog. Each ID is also the character ID of the animated
 * 2D stage and the catalog ID in the lesson's `avatar:` reference.
 * The earlier placeholder slots (octo, avatar-2 … avatar-6) never had artwork;
 * lessons that name them are shown with the default character.
 */
export const PRESENTER_AVATARS: PresenterAvatar[] = [
  { id: "star-fox", name: () => tr("星狐"), portrait: "teach-avatars/star-fox/painted-v0.3/portrait-extended.png", color: "#f3e3cf" },
  { id: "red-panda", name: () => tr("小熊猫"), portrait: "teach-avatars/red-panda/painted-v0.1/portrait.png", color: "#f1ddd6" },
  { id: "white-rabbit", name: () => tr("白兔"), portrait: "teach-avatars/white-rabbit/painted-v0.1/portrait.png", color: "#e9e7f2" },
  { id: "moon-cat", name: () => tr("月猫"), portrait: "teach-avatars/moon-cat/painted-v0.1/portrait.png", color: "#e6e1f2" },
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

// Who presents a learner's lesson: an avatar and a synthetic voice, chosen by
// the learner from catalogs the app controls, so a lesson never carries the
// learner's own face or voice. The lesson refers to them only by catalog ID.

import { tr } from "@/i18n";
import { AZURE_VOICES } from "@/byok/azure-voices";

/** A voice offered to learners, for one speech resource. */
export interface PresenterVoice {
  /** The provider's voice ID; also the catalog ID in the lesson's `voice:` reference. */
  id: string;
  name: () => string;
}

/**
 * Friendly voices that read English well, per Volcano speech resource. The
 * catalog has no native US English or child voices; learners who need them
 * use Azure AI Speech (below).
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
/** Azure AI Speech native US English voices; Ana is a child's voice. */
VOICES["azure"] = [...AZURE_VOICES];

/** The voices a learner can choose with this speech resource (the provider for Azure); none for an unknown resource. */
export function presenterVoices(resourceId: string | undefined): PresenterVoice[] {
  return VOICES[resourceId?.trim() ?? ""] ?? [];
}

/** A presenter avatar. Its picture is the artwork file named by its ID, once added. */
export interface PresenterAvatar {
  id: string;
  name: () => string;
  /** Background of the placeholder shown until the artwork exists. */
  color: string;
}

/**
 * Presenter avatar slots. The artwork is provided separately: one square PNG
 * per slot at public/teach-avatars/<id>.png (transparent background, at least
 * 512 × 512). A slot without its file shows a placeholder.
 */
export const PRESENTER_AVATARS: PresenterAvatar[] = [
  { id: "octo", name: () => tr("小章鱼"), color: "#1b2457" },
  { id: "avatar-2", name: () => tr("形象 2"), color: "#0f766e" },
  { id: "avatar-3", name: () => tr("形象 3"), color: "#b45309" },
  { id: "avatar-4", name: () => tr("形象 4"), color: "#7a5aa3" },
  { id: "avatar-5", name: () => tr("形象 5"), color: "#2f6fb0" },
  { id: "avatar-6", name: () => tr("形象 6"), color: "#a3364b" },
];

export const DEFAULT_AVATAR = "octo";

export function presenterAvatar(id: string | undefined): PresenterAvatar {
  return PRESENTER_AVATARS.find((avatar) => avatar.id === id) ?? PRESENTER_AVATARS[0]!;
}

/** Where an avatar's artwork is served from. */
export function avatarArtUrl(id: string): string {
  return `${import.meta.env.BASE_URL}teach-avatars/${id}.png`;
}

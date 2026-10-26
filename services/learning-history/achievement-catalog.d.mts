export type AchievementRarity = "b" | "s" | "g" | "x";
export interface AchievementCategory { id: string; name: string; seal: string; description: string }
export interface AchievementDefinition {
  id: string; category: string; name: string; condition: string; /** One line in the academy's voice, beside the plain condition. */ flavor: string; rarity: AchievementRarity;
  hidden?: boolean; title?: string; season?: string; target?: number; teacher?: string; scoped?: "topic";
}
export interface TitleDefinition { id: string; name: string }
export const ACHIEVEMENT_CATEGORIES: readonly AchievementCategory[];
export const ACHIEVEMENTS: readonly AchievementDefinition[];
export const ACHIEVEMENT_BY_ID: ReadonlyMap<string, AchievementDefinition>;
export const DEFAULT_TITLE: TitleDefinition;
export const TITLES: readonly TitleDefinition[];
export const SPRING_FESTIVAL: Readonly<Record<number, string>>;
export const MID_AUTUMN: Readonly<Record<number, string>>;

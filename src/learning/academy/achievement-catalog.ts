import { localizedCatalog } from "@/i18n";
import * as catalog from "../../../services/learning-history/achievement-catalog.mjs";

// Presentation overlays only. Earning rules and stored IDs stay in the service.
export const ACHIEVEMENTS = localizedCatalog(catalog.ACHIEVEMENTS);
export const ACHIEVEMENT_CATEGORIES = localizedCatalog(catalog.ACHIEVEMENT_CATEGORIES);
export const DEFAULT_TITLE = localizedCatalog(catalog.DEFAULT_TITLE);
export const TITLES = localizedCatalog(catalog.TITLES);
export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map(item => [item.id, item]));
export { MID_AUTUMN, SPRING_FESTIVAL } from "../../../services/learning-history/achievement-catalog.mjs";
export type { AchievementDefinition } from "../../../services/learning-history/achievement-catalog.mjs";

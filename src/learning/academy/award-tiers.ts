import type { AchievementDefinition } from "@/learning/academy/achievement-catalog";

export type Rarity = AchievementDefinition["rarity"];

/** How loud each rarity's ceremony is: `level` adds layers (0 bronze: dust and
 * a glow; 1 silver: shards, flare, sheen; 2 gold: light pillar, rays,
 * constellation; 3 starlight: aurora and star confetti). */
export const AWARD_TIERS = {
  b: { level: 0, glow: "#e7a777", ray: "rgba(255, 220, 150, 0.18)", dust: 45 },
  s: { level: 1, glow: "#dfe9ff", ray: "rgba(255, 220, 150, 0.18)", dust: 90 },
  g: { level: 2, glow: "#ffd772", ray: "rgba(255, 220, 150, 0.18)", dust: 165 },
  x: { level: 3, glow: "#d6c8ff", ray: "rgba(214, 200, 255, 0.2)", dust: 270 },
} as const satisfies Record<Rarity, { level: number; glow: string; ray: string; dust: number }>;

export const RARITY_RANK: Record<Rarity, number> = { b: 0, s: 1, g: 2, x: 3 };

import { useId } from "react";

import { ACHIEVEMENT_CATEGORIES, type AchievementDefinition } from "../../../services/learning-history/achievement-catalog.mjs";

import { BADGE_ART } from "./achievement-display";

const METAL = {
  locked: ["#2a3050", "#1c2140", "#343b62"],
  b: ["#f0b884", "#9a5a30", "#d9925f"],
  s: ["#ffffff", "#8e9ab3", "#d6deee"],
  g: ["#fff1b8", "#b8862e", "#f2c95e"],
  x: ["#efe6ff", "#6b55c9", "#b9a6ff"],
} as const;

function starPoints(n: number, outer: number, inner: number, cx = 60, cy = 60, rotation = -Math.PI / 2): string {
  return Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer, a = rotation + (i * Math.PI) / n;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

/** A medal: the outline grows with rarity (circle, hexagon, eight- and
 * twelve-point stars with ribbons). A locked hidden one shows only "？". */
export function Medal({ achievement, locked = false, className = "" }: { achievement: AchievementDefinition; locked?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  const metal = locked ? METAL.locked : METAL[achievement.rarity];
  const seal = locked && achievement.hidden ? "？" : ACHIEVEMENT_CATEGORIES.find((category) => category.id === achievement.category)?.seal ?? "星";
  const art = BADGE_ART.has(achievement.id) && !(locked && achievement.hidden);
  const fill = `url(#m${id})`;
  const outline = achievement.rarity === "b" ? <circle cx="60" cy="60" r="50" fill={fill} />
    : achievement.rarity === "s" ? <polygon points={starPoints(6, 54, 47)} fill={fill} />
    : achievement.rarity === "g" ? <polygon points={starPoints(8, 58, 46)} fill={fill} />
    : <polygon points={starPoints(12, 60, 46)} fill={fill} />;
  return (
    <svg className={`academy-medal ${className}`} viewBox="0 0 120 124" aria-hidden="true">
      <defs>
        <linearGradient id={`m${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={metal[0]} /><stop offset="0.55" stopColor={metal[1]} /><stop offset="1" stopColor={metal[2]} />
        </linearGradient>
        <radialGradient id={`c${id}`}>
          <stop offset="0" stopColor={locked ? "#1a1f3a" : "#24306e"} /><stop offset="1" stopColor={locked ? "#12152c" : "#0e1436"} />
        </radialGradient>
        <clipPath id={`k${id}`}><circle cx="60" cy="60" r="33" /></clipPath>
      </defs>
      {!locked && (achievement.rarity === "g" || achievement.rarity === "x") && (
        <path d="M38,96 L30,118 L44,111 L50,122 L56,100 Z M82,96 L90,118 L76,111 L70,122 L64,100 Z" fill={achievement.rarity === "x" ? "#5a3fb5" : "#a3322e"} />
      )}
      {outline}
      <circle cx="60" cy="60" r="34" fill={`url(#c${id})`} stroke={metal[0]} strokeWidth="2" />
      {art ? (
        <image href={`${import.meta.env.BASE_URL}achievements/${achievement.id}.webp`} x="26" y="26" width="68" height="68"
          clipPath={`url(#k${id})`} preserveAspectRatio="xMidYMid slice" opacity={locked ? 0.28 : 1}
          style={locked ? { filter: "grayscale(1) blur(1.5px)" } : undefined} />
      ) : (
        <circle cx="60" cy="60" r="29" fill="none" stroke={metal[2]} strokeWidth="0.8" strokeDasharray="2 3" />
      )}
      {(!art || locked) && (
        <text x="60" y="71" textAnchor="middle" fontSize="30" fontFamily="'ZCOOL XiaoWei', 'Songti SC', serif" fill={locked ? "#4a527c" : metal[0]}>{seal}</text>
      )}
      {!locked && achievement.rarity === "x" && [0, 1, 2, 3].map((i) => (
        <polygon key={i} points={starPoints(4, 5, 1.6, 60 + 56 * Math.cos(i * 1.57 + 0.78), 60 + 56 * Math.sin(i * 1.57 + 0.78), 0)} fill="#fff" />
      ))}
    </svg>
  );
}

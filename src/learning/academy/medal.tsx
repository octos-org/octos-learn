import { useId } from "react";

import type { AchievementDefinition } from "../../../services/learning-history/achievement-catalog.mjs";

import { BADGE_ART } from "./achievement-display";

const METAL = {
  locked: ["#2c3354", "#1b2040", "#363e66"],
  b: ["#f6c79b", "#9a5a30", "#dc9762"],
  s: ["#ffffff", "#8e9ab3", "#d9e1f0"],
  g: ["#fff3c4", "#b8862e", "#f2c95e"],
  x: ["#f1e9ff", "#6b55c9", "#bba8ff"],
} as const;
const RIBBON = { b: null, s: "#2f5fa8", g: "#a3322e", x: "#5a3fb5" } as const;

/** One small line drawing per category, on a 24-unit grid, centred in the
 * medal's enamel. Strokes only, so the metal colour carries them. */
const EMBLEMS: Record<string, string> = {
  // Footprints: a compass rose.
  trail: "M12 2.5 L14.2 12 L12 21.5 L9.8 12 Z M2.5 12 L12 9.8 L21.5 12 L12 14.2 Z",
  // Keeping at it: a lamp flame.
  keep: "M12 3 C15.5 7 17.5 9.5 17.5 13.5 A5.5 5.5 0 0 1 6.5 13.5 C6.5 10.5 8.5 9 9.8 6.5 C10.8 8.6 12 8.8 12 3 Z M12 18 C10.6 18 9.8 17 9.8 15.6 C9.8 14.2 11 13.2 12 11.8 C13 13.2 14.2 14.2 14.2 15.6 C14.2 17 13.4 18 12 18 Z",
  // By hand: a pen nib.
  hand: "M12 2.5 L17.5 9 L14.5 18.5 L9.5 18.5 L6.5 9 Z M12 2.5 L12 12 M12 12 m-1.6 0 a1.6 1.6 0 1 0 3.2 0 a1.6 1.6 0 1 0 -3.2 0 M9.5 21.5 L14.5 21.5",
  // Good questions: a question mark.
  ask: "M8.2 8.6 A3.9 3.9 0 1 1 13.7 12 C12.6 12.7 12 13.5 12 15 M12 19.4 L12 19.6",
  // The atlas: a small constellation.
  sky: "M3.5 16.5 L8.5 9 L13.5 12.5 L20.5 4.5 M3.5 16.5 L10 20.5 M8.5 9 m-1.3 0 a1.3 1.3 0 1 0 2.6 0 a1.3 1.3 0 1 0 -2.6 0 M13.5 12.5 m-1.3 0 a1.3 1.3 0 1 0 2.6 0 a1.3 1.3 0 1 0 -2.6 0",
  // A teacher and a student: two linked rings.
  bond: "M9 12 m-5.5 0 a5.5 5.5 0 1 0 11 0 a5.5 5.5 0 1 0 -11 0 M15 12 m-5.5 0 a5.5 5.5 0 1 0 11 0 a5.5 5.5 0 1 0 -11 0",
  // Hidden: a keyhole.
  hidden: "M12 9.5 m-3.4 0 a3.4 3.4 0 1 0 6.8 0 a3.4 3.4 0 1 0 -6.8 0 M10.4 12.5 L9.2 19.5 L14.8 19.5 L13.6 12.5",
  // Seasons: a crescent moon and a star.
  season: "M14.5 3.5 A8.5 8.5 0 1 0 20.5 15.5 A6.5 6.5 0 1 1 14.5 3.5 Z M18.5 5 L19 6.5 L20.5 7 L19 7.5 L18.5 9 L18 7.5 L16.5 7 L18 6.5 Z",
};

function starPoints(n: number, outer: number, inner: number, cx = 60, cy = 60, rotation = -Math.PI / 2): string {
  return Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer, a = rotation + (i * Math.PI) / n;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

/** Leaves along an arc from `from` to `to` degrees (0° = right, clockwise). */
function laurel(key: string, from: number, to: number, radius: number, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const a = ((from + ((to - from) * i) / (count - 1)) * Math.PI) / 180;
    const x = 60 + radius * Math.cos(a), y = 60 + radius * Math.sin(a);
    const angle = (a * 180) / Math.PI + (to > from ? 60 : -60);
    return <ellipse key={`${key}${i}`} cx={x.toFixed(1)} cy={y.toFixed(1)} rx="4.2" ry="1.7" transform={`rotate(${angle.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})`} />;
  });
}

/** A medal. The outline grows with rarity (circle, hexagon, eight- and
 * twelve-point stars); silver and up hang from a ribbon, gold and starlight
 * carry a laurel; the enamel holds the category's emblem (or painted art) and
 * a counted achievement shows its number on a small plaque. A locked medal is
 * a dim silhouette; a hidden one shows only a question mark. */
export function Medal({ achievement, locked = false, className = "" }: { achievement: AchievementDefinition; locked?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  const rarity = achievement.rarity;
  const metal = locked ? METAL.locked : METAL[rarity];
  const secret = locked && achievement.hidden;
  const art = BADGE_ART.has(achievement.id) && !secret;
  const emblem = secret ? EMBLEMS.ask : EMBLEMS[achievement.category] ?? EMBLEMS.sky;
  const ribbon = locked ? null : RIBBON[rarity];
  const shape = (fill: string, scale = 1, extra: Record<string, string | number> = {}) => {
    const t = scale === 1 ? undefined : `translate(60 60) scale(${scale}) translate(-60 -60)`;
    return rarity === "b" ? <circle cx="60" cy="60" r="50" fill={fill} transform={t} {...extra} />
      : rarity === "s" ? <polygon points={starPoints(6, 54, 47)} fill={fill} transform={t} {...extra} />
      : rarity === "g" ? <polygon points={starPoints(8, 58, 47)} fill={fill} transform={t} {...extra} />
      : <polygon points={starPoints(12, 60, 47)} fill={fill} transform={t} {...extra} />;
  };
  // Painted art carries its own meaning; the number plaque is for emblem medals.
  const plaque = !secret && !art && achievement.target && achievement.target > 1 ? String(achievement.target) : null;
  return (
    <svg className={`academy-medal ${className}`} viewBox="0 0 120 126" aria-hidden="true">
      <defs>
        <linearGradient id={`m${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={metal[0]} /><stop offset="0.55" stopColor={metal[1]} /><stop offset="1" stopColor={metal[2]} />
        </linearGradient>
        <linearGradient id={`r${id}`} x1="1" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={metal[0]} /><stop offset="0.5" stopColor={metal[1]} /><stop offset="1" stopColor={metal[2]} />
        </linearGradient>
        <linearGradient id={`h${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" /><stop offset="0.42" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`c${id}`} cx="0.42" cy="0.36" r="0.75">
          <stop offset="0" stopColor={locked ? "#1d2342" : "#2b3a84"} /><stop offset="0.7" stopColor={locked ? "#141832" : "#121a48"} /><stop offset="1" stopColor={locked ? "#10132a" : "#0b1033"} />
        </radialGradient>
        <clipPath id={`k${id}`}><circle cx="60" cy="60" r="31" /></clipPath>
      </defs>

      {ribbon && (
        <g>
          <path d="M40,92 L31,121 L41,115 L47,124 L55,98 Z M80,92 L89,121 L79,115 L73,124 L65,98 Z" fill={ribbon} />
          <path d="M40,92 L31,121 L41,115 L47,124 L55,98 Z M80,92 L89,121 L79,115 L73,124 L65,98 Z" fill="url(#h${id})" opacity="0.5" />
        </g>
      )}

      {/* Rim: outer shape, knurled edge, bevel, highlight. */}
      {shape(`url(#m${id})`, 1, { stroke: locked ? "#3d4573" : metal[1], strokeWidth: 1.1 })}
      {!locked && <circle cx="60" cy="60" r="43.5" fill="none" stroke={metal[1]} strokeOpacity="0.55" strokeWidth="3" strokeDasharray="0.9 1.9" />}
      {!locked && shape(`url(#r${id})`, 0.84)}
      {!locked && shape(`url(#h${id})`, 1)}
      {locked && <circle cx="60" cy="60" r="43" fill="none" stroke="#4a5384" strokeWidth="0.9" strokeDasharray="2 3" />}

      {!locked && (rarity === "g" || rarity === "x") && (
        <g fill={metal[0]} opacity="0.95">{laurel("l", 160, 245, 38, 7)}{laurel("r", 20, -65, 38, 7)}</g>
      )}

      {/* Enamel: a metal lip, deep blue enamel with a few stars. */}
      <circle cx="60" cy="60" r="34.5" fill={locked ? "#262c4c" : metal[1]} />
      <circle cx="60" cy="60" r="33" fill={`url(#c${id})`} stroke={metal[0]} strokeOpacity={locked ? 0.35 : 0.9} strokeWidth="1.2" />
      {!locked && !art && (
        <g fill="#fff">
          <circle cx="45" cy="44" r="0.8" opacity="0.7" /><circle cx="76" cy="48" r="0.6" opacity="0.6" /><circle cx="70" cy="80" r="0.7" opacity="0.5" /><circle cx="42" cy="72" r="0.5" opacity="0.6" />
        </g>
      )}
      {art ? (
        <image href={`${import.meta.env.BASE_URL}achievements/${achievement.id}.webp`} x="29" y="29" width="62" height="62"
          clipPath={`url(#k${id})`} preserveAspectRatio="xMidYMid slice" opacity={locked ? 0.25 : 1}
          style={locked ? { filter: "grayscale(1) blur(1.5px)" } : undefined} />
      ) : (
        <g transform={`translate(${60 - 12 * 1.55} ${(plaque ? 55 : 60) - 12 * 1.55}) scale(1.55)`}>
          {!locked && <path d={emblem} fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" transform="translate(0.35 0.45)" />}
          <path d={emblem} fill="none" stroke={locked ? "#4f5888" : metal[0]} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {!locked && <path d="M37,45 A27,27 0 0 1 72,34" fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="2.4" strokeLinecap="round" />}

      {plaque && (
        <g>
          <rect x={60 - (plaque.length * 4 + 7)} y="76" width={plaque.length * 8 + 14} height="12" rx="3" fill={locked ? "#262c4c" : metal[1]} stroke={locked ? "#4a5384" : metal[0]} strokeWidth="0.8" />
          <text x="60" y="85.2" textAnchor="middle" fontSize="9" fontWeight="700" fontFamily="'Avenir Next', 'Helvetica Neue', sans-serif"
            fill={locked ? "#69729f" : metal[0]} style={{ fontVariantNumeric: "tabular-nums" }}>{plaque}</text>
        </g>
      )}

      {!locked && rarity === "x" && [0, 1, 2, 3].map((i) => (
        <polygon key={i} points={starPoints(4, 5.5, 1.6, 60 + 57 * Math.cos(i * 1.57 + 0.78), 60 + 57 * Math.sin(i * 1.57 + 0.78), 0)} fill="#fff" />
      ))}
    </svg>
  );
}

// What a presenter's reaction looks like around it, for a moment: confetti
// to celebrate, hearts and sparkles to encourage, "!" marks with an amber
// ring to say careful. Behind the character; a still badge when the viewer
// prefers less motion.

import type { CSSProperties } from "react";

import type { ReactionMoment } from "./presenter-reaction";

const CONFETTI = ["#e15d45", "#f2b33d", "#2f8f80", "#5b6fd6", "#d65ba3", "#7cc05a"];
const BADGE: Record<ReactionMoment["expression"], string> = { celebrating: "🎉", encouraging: "💛", careful: "❗" };

/** Pseudo-random but fixed per particle, so a burst renders the same way every time. */
const spread = (index: number, salt: number) => ((Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;

export function ReactionBurst({ moment }: { moment: ReactionMoment }) {
  const { expression } = moment;
  const count = expression === "celebrating" ? 26 : expression === "encouraging" ? 12 : 5;
  // The glow sits behind the character; the badge and particles in front, so the body does not hide them.
  return (
    <>
      <div className={`reaction-burst reaction-burst-back reaction-burst-${expression}`} aria-hidden="true">
        <span className="reaction-burst-glow" />
      </div>
      <div className={`reaction-burst reaction-burst-front reaction-burst-${expression}`} aria-hidden="true">
        <span className="reaction-burst-badge">{BADGE[expression]}</span>
        {Array.from({ length: count }, (_, index) => {
          const angle = expression === "careful" ? -150 + index * 30 : -90 + (spread(index, 1) - 0.5) * (expression === "celebrating" ? 220 : 120);
          const distance = expression === "celebrating" ? 70 + spread(index, 2) * 70 : 50 + spread(index, 2) * 50;
          const style = {
            "--dx": `${Math.cos((angle * Math.PI) / 180) * distance}px`,
            "--dy": `${Math.sin((angle * Math.PI) / 180) * distance}px`,
            // Confetti tumbles; hearts and "!" marks stay upright, to stay readable.
            "--spin": expression === "celebrating" ? `${(spread(index, 3) - 0.5) * 720}deg` : "0deg",
            "--delay": `${spread(index, 4) * 220}ms`,
            "--color": CONFETTI[index % CONFETTI.length],
          } as CSSProperties;
          return <span key={index} className="reaction-particle" style={style}>{expression === "encouraging" ? (index % 3 ? "✦" : "♥") : expression === "careful" ? "!" : ""}</span>;
        })}
      </div>
    </>
  );
}

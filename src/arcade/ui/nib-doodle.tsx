// Nib as a flat doodle, for pages and the results screen. The 3D Nib in the
// games uses the same colours: warm yellow pencil and ink-blue lines.

export function NibDoodle({ size = 120, mood = "happy" }: { size?: number; mood?: "happy" | "cheer" }) {
  const ink = "#28408f";
  const tentacles = [-62, -36, -12, 12, 36, 62];
  return (
    <svg className={`arcade-nib arcade-nib-${mood}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <g fill="#f5c84b" stroke={ink} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        {tentacles.map((angle, i) => {
          const x = 60 + Math.sin((angle * Math.PI) / 180) * 30;
          const lift = mood === "cheer" ? -10 : 0;
          const end = 60 + Math.sin((angle * Math.PI) / 180) * 50;
          return <path key={angle} d={`M${x} 78 Q${(x + end) / 2 + (i % 2 ? 6 : -6)} ${100 + lift} ${end} ${96 + lift + (i % 2 ? 4 : -2)}`} fill="none" strokeWidth="9" stroke="#f5c84b" />;
        })}
        {tentacles.map(angle => {
          const x = 60 + Math.sin((angle * Math.PI) / 180) * 30;
          const end = 60 + Math.sin((angle * Math.PI) / 180) * 50;
          const lift = mood === "cheer" ? -10 : 0;
          return <path key={`o${angle}`} d={`M${x} 78 Q${(x + end) / 2} ${100 + lift} ${end} ${96 + lift}`} fill="none" strokeWidth="2.6" />;
        })}
        <path d="M24 62c0-24 16-40 36-40s36 16 36 40c0 14-10 22-36 22S24 76 24 62z" />
        <path d="M56 22c-2-8 4-14 10-12 5 2 5 8 1 10" fill="none" />
      </g>
      <g stroke={ink} strokeWidth="2.6" strokeLinecap="round">
        <ellipse cx="47" cy="56" rx="8" ry="9" fill="#fffdf7" />
        <ellipse cx="73" cy="56" rx="8" ry="9" fill="#fffdf7" />
        <circle cx="48" cy="58" r="3.6" fill={ink} stroke="none" />
        <circle cx="74" cy="58" r="3.6" fill={ink} stroke="none" />
        <path d={mood === "cheer" ? "M52 70q8 9 16 0" : "M53 70q7 5 14 0"} fill="none" />
      </g>
      <g fill="#f2907f" opacity="0.8">
        <ellipse cx="36" cy="68" rx="5" ry="3" />
        <ellipse cx="84" cy="68" rx="5" ry="3" />
      </g>
      <g stroke="#e2b77d" strokeWidth="1.6" opacity="0.7">
        <path d="M34 46l6 -6M40 50l8 -8M78 40l6 6" />
      </g>
    </svg>
  );
}

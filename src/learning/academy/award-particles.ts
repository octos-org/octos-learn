import type { Rarity } from "./award-tiers";
import { AWARD_TIERS } from "./award-tiers";

const TAU = Math.PI * 2;
const STARLIGHT = ["#fff3c4", "#d6c8ff", "#9be8e0", "#ffd772"];

/** The canvas layer of a ceremony: dust gathers into the medal and bursts as
 * it lands; silver and up add shards; gold and up draw a constellation;
 * starlight rains star confetti. Returns a stop function. */
export function runAwardParticles(canvas: HTMLCanvasElement, rarity: Rarity, medal: HTMLElement | null): () => void {
  const g = canvas.getContext("2d");
  if (!g) return () => undefined;
  const { glow, dust: dustCount, level } = AWARD_TIERS[rarity];
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  // Everything gathers to and bursts from the medal's centre, wherever the
  // layout put it (centred on a wide screen, near the top on a phone).
  let centre = { x: 0, y: 0 };
  const fit = () => {
    canvas.width = window.innerWidth * dpr; canvas.height = window.innerHeight * dpr;
    const box = medal?.getBoundingClientRect();
    centre = box && box.width ? { x: (box.left + box.width / 2) * dpr, y: (box.top + box.height / 2) * dpr } : { x: canvas.width / 2, y: canvas.height * 0.42 };
  };
  fit();
  window.addEventListener("resize", fit);
  const cx = () => centre.x, cy = () => centre.y;
  const span = Math.max(window.innerWidth, window.innerHeight) * dpr;
  const random = Math.random;

  const dust = Array.from({ length: dustCount }, () => {
    const angle = random() * TAU, distance = (0.4 + random() * 0.7) * span;
    return { x: cx() + Math.cos(angle) * distance, y: cy() + Math.sin(angle) * distance, angle, speed: (2 + random() * 9) * dpr,
      r: (0.8 + random() * 2.6) * dpr, hue: random(), vx: 0, vy: 0, burst: false };
  });
  const shards = level >= 1 ? Array.from({ length: 14 + level * 10 }, () => ({ angle: random() * TAU, d: 0, speed: (10 + random() * 18) * dpr, len: (20 + random() * 60) * dpr })) : [];
  const points = level >= 3 ? 10 : 7;
  // The constellation arches over the medal so its lines never cross the
  // name and condition below it; it narrows with the screen.
  const reach = Math.min(1, window.innerWidth / 760) * dpr;
  const constellation = level >= 2 ? Array.from({ length: points }, (_, i) => {
    const angle = Math.PI * (1.04 + (0.92 * i) / (points - 1)), radius = (230 + (i % 2) * 60) * reach;
    return { x: cx() + Math.cos(angle) * radius, y: cy() + Math.sin(angle) * radius * 0.8 };
  }) : [];
  const confetti = level >= 3 ? Array.from({ length: 90 }, () => ({ x: random() * canvas.width, y: -random() * canvas.height * 0.6,
    vy: (1.2 + random() * 2.4) * dpr, rot: random() * TAU, vr: (random() - 0.5) * 0.15, s: (4 + random() * 6) * dpr, c: STARLIGHT[(random() * 4) | 0] })) : [];

  const star = (x: number, y: number, size: number, rotation: number) => {
    g.save(); g.translate(x, y); g.rotate(rotation); g.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? size * 0.42 : size, a = -Math.PI / 2 + (i * Math.PI) / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.fill(); g.restore();
  };

  const start = performance.now();
  let raf = 0;
  const frame = (now: number) => {
    const t = (now - start) / 1000;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.globalCompositeOperation = "lighter";
    for (const p of dust) {
      if (t < 0.9) { p.x += (cx() - p.x) * 0.07; p.y += (cy() - p.y) * 0.07; }
      else if (!p.burst) { p.burst = true; p.vx = Math.cos(p.angle) * p.speed; p.vy = Math.sin(p.angle) * p.speed - 2 * dpr; }
      else { p.x += p.vx; p.y += p.vy; p.vx *= 0.965; p.vy = p.vy * 0.965 + 0.05 * dpr; }
      g.globalAlpha = t < 0.9 ? Math.min(1, t * 2) : Math.max(0, 1 - (t - 0.9) / 3.2);
      g.fillStyle = rarity === "x" ? (p.hue > 0.66 ? "#e6dcff" : p.hue > 0.33 ? "#9be8e0" : "#fff3c4") : glow;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
    }
    if (t > 0.92) for (const s of shards) {
      s.d += s.speed; s.speed *= 0.93;
      const x = cx() + Math.cos(s.angle) * s.d, y = cy() + Math.sin(s.angle) * s.d;
      g.globalAlpha = Math.max(0, 1 - (t - 0.92) / 0.9); g.strokeStyle = "#fffbe8"; g.lineWidth = 2 * dpr;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(s.angle) * s.len, y - Math.sin(s.angle) * s.len); g.stroke();
    }
    if (constellation.length && t > 1.3) {
      const upto = Math.min(1, (t - 1.3) / 1.1) * constellation.length;
      g.globalAlpha = 0.85; g.strokeStyle = glow; g.lineWidth = 1.4 * dpr; g.beginPath();
      constellation.forEach((s, i) => { if (i < upto) { if (i) g.lineTo(s.x, s.y); else g.moveTo(s.x, s.y); } });
      g.stroke();
      g.fillStyle = "#fff";
      constellation.forEach((s, i) => { if (i < upto) { g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5 + i); star(s.x, s.y, 6 * dpr, t); } });
    }
    g.globalCompositeOperation = "source-over";
    if (t > 1.2) for (const c of confetti) {
      c.y += c.vy; c.x += Math.sin(t * 2 + c.rot) * 0.6 * dpr; c.rot += c.vr;
      g.globalAlpha = 0.9; g.fillStyle = c.c; star(c.x, c.y, c.s, c.rot);
    }
    g.globalAlpha = 1;
    if (t < 8) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", fit); };
}

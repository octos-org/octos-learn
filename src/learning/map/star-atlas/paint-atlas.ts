import type { LearningMapTopic } from "../../history/history-api";
import { domainLabel, topicLabel } from "../taxonomy-labels";
import { frameLevel, STAR_LEVEL, type Atlas, type View } from "./atlas-model";

export const RING_NAMES = [{ name: "启明部", note: "小学" }, { name: "星辉部", note: "初中" }, { name: "星穹部", note: "高中" }];
const HUES = [205, 285, 180, 150, 330, 25, 50, 95, 230, 260, 310, 10];
const FONT_BODY = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif';
const FONT_DISPLAY = '"ZCOOL XiaoWei", "Songti SC", "STSong", serif';

export interface PaintState {
  view: View; width: number; height: number; time: number; reduceMotion: boolean;
  lit: Map<number, LearningMapTopic>; near: Set<number>; unveil: boolean;
  selected: number | null; hover: number | null;
  /** When the stars started igniting; null once the opening has finished. */
  igniteFrom: number | null;
}

export const toScreen = (s: PaintState, x: number, y: number): [number, number] => [(x + s.view.x) * s.view.k + s.width / 2, (y + s.view.y) * s.view.k + s.height / 2];
export const toWorld = (s: Pick<PaintState, "view" | "width" | "height">, sx: number, sy: number): [number, number] => [(sx - s.width / 2) / s.view.k - s.view.x, (sy - s.height / 2) / s.view.k - s.view.y];

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${alpha})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
export function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rotation: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.beginPath();
  for (let k = 0; k < 8; k++) { const rr = k % 2 ? r * 0.28 : r, a = k * Math.PI / 4; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function frame(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, level: number, spin: number) {
  if (!level) return;
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = "rgba(246,220,155,0.75)"; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.arc(0, 0, size * 2.3, 0, Math.PI * 2); ctx.stroke();
  if (level >= 2) {
    ctx.rotate(spin);
    ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.arc(0, 0, size * 3, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "rgba(246,220,155,0.9)";
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; ctx.beginPath(); ctx.arc(Math.cos(a) * size * 3, Math.sin(a) * size * 3, 1.4, 0, Math.PI * 2); ctx.fill(); }
  }
  if (level >= 3) {
    ctx.rotate(-spin * 3);
    ctx.fillStyle = "rgba(242,199,102,0.85)";
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; sparkle(ctx, Math.cos(a) * size * 3.8, Math.sin(a) * size * 3.8, 3.2, a); }
  }
  ctx.restore();
}

/** The order explored stars ignite in during the opening: dimmest first. */
export const igniteOrder = (s: Pick<PaintState, "lit">) => [...s.lit.keys()].sort((a, b) => STAR_LEVEL[s.lit.get(a)!.state] - STAR_LEVEL[s.lit.get(b)!.state] || a - b);
const IGNITE_STEP = (count: number) => Math.min(260, 2600 / Math.max(1, count));
export const igniteDuration = (count: number) => 900 + count * IGNITE_STEP(count);

function star(ctx: CanvasRenderingContext2D, atlas: Atlas, s: PaintState, i: number, alpha: number) {
  const [x, y] = toScreen(s, atlas.stars[i].x, atlas.stars[i].y);
  if (x < -60 || y < -60 || x > s.width + 60 || y > s.height + 60) return;
  const topic = s.lit.get(i), k = Math.min(1.8, Math.max(0.6, s.view.k));
  const twinkle = s.reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(s.time / 700 + i);
  if (!topic) {
    const a = (s.unveil ? 0.55 : s.near.has(i) ? 0.5 : 0) * alpha;
    if (a <= 0) return;
    ctx.strokeStyle = `rgba(142,161,200,${a})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, 2.2 * k, 0, Math.PI * 2); ctx.stroke();
    return;
  }
  const level = STAR_LEVEL[topic.state];
  if (level === 1) {
    glow(ctx, x, y, 10 * k, "170,195,255", 0.55 * twinkle * alpha);
    ctx.fillStyle = `rgba(214,226,255,${0.95 * alpha})`; ctx.beginPath(); ctx.arc(x, y, 2.4 * k, 0, Math.PI * 2); ctx.fill();
  } else if (level === 2) {
    glow(ctx, x, y, 13 * k, "232,154,90", 0.5 * twinkle * alpha);
    ctx.fillStyle = `rgba(255,214,170,${alpha})`; ctx.beginPath(); ctx.arc(x, y, 2.8 * k, 0, Math.PI * 2); ctx.fill();
    // The seal around a star being practised: an arc broken where practice cracked it.
    ctx.save(); ctx.translate(x, y); ctx.rotate(s.reduceMotion ? 0.4 : s.time / 4000 + i);
    ctx.strokeStyle = `rgba(232,154,90,${0.85 * alpha})`; ctx.lineWidth = 1.4;
    for (let seg = 0; seg < 3; seg++) { ctx.beginPath(); ctx.arc(0, 0, 7.5 * k, seg * 2.1, seg * 2.1 + 1.5); ctx.stroke(); }
    ctx.restore();
  } else {
    glow(ctx, x, y, 26 * k, "242,199,102", 0.42 * twinkle * alpha);
    ctx.fillStyle = `rgba(255,236,190,${alpha})`;
    sparkle(ctx, x, y, 7.5 * k * twinkle, s.reduceMotion ? 0 : s.time / 9000);
    ctx.beginPath(); ctx.arc(x, y, 2.6 * k, 0, Math.PI * 2); ctx.fill();
    frame(ctx, x, y, 4 * k, frameLevel(topic), s.reduceMotion ? 0 : s.time / 6000);
  }
}

export function paintAtlas(ctx: CanvasRenderingContext2D, atlas: Atlas, s: PaintState) {
  const { width: w, height: h } = s;
  const sky = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h / 2, Math.max(w, h) * 0.8);
  sky.addColorStop(0, "#14204a"); sky.addColorStop(1, "#070b1c");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  for (let k = 0; k < 500; k++) {
    const x = ((Math.sin(k * 12.9898) * 43758.5453) % 1 + 1) % 1, y = ((Math.sin(k * 78.233) * 12345.678) % 1 + 1) % 1;
    ctx.fillStyle = `rgba(220,226,255,${((k * 13) % 10) / 20 + 0.08})`; ctx.fillRect(x * w, y * h, ((k * 7) % 10) / 10 + 0.3, ((k * 7) % 10) / 10 + 0.3);
  }

  // Academy rings; the outermost is drawn dashed until its stars are charted.
  const [cx, cy] = toScreen(s, 0, 0);
  atlas.rings.forEach((r, k) => {
    const radius = r * s.view.k * (k === 0 ? 1.02 : 1.06);
    ctx.strokeStyle = k === 2 ? "rgba(142,161,200,0.12)" : "rgba(242,199,102,0.12)"; ctx.lineWidth = 1;
    ctx.setLineDash(k === 2 ? [4, 10] : []); ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = `12px ${FONT_BODY}`; ctx.fillStyle = "rgba(242,199,102,0.5)"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText(`${RING_NAMES[k].name} · ${RING_NAMES[k].note}${k === 2 ? " · 尚未绘制" : ""}`, cx, cy - radius - 8);
  });

  // Domain nebulae brighten as more of the domain is explored.
  const litByDomain = atlas.domains.map(() => 0);
  for (const i of s.lit.keys()) litByDomain[atlas.stars[i].domain]++;
  atlas.domainCenters.forEach((c, d) => {
    const [x, y] = toScreen(s, c.x, c.y), hue = HUES[d % HUES.length];
    const g = ctx.createRadialGradient(x, y, 0, x, y, (90 + Math.sqrt(c.size) * 14) * s.view.k);
    const a = (s.unveil ? 0.07 : 0.03) + Math.min(0.16, litByDomain[d] * 0.025);
    g.addColorStop(0, `hsla(${hue},70%,60%,${a})`); g.addColorStop(1, `hsla(${hue},70%,60%,0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, (90 + Math.sqrt(c.size) * 14) * s.view.k, 0, Math.PI * 2); ctx.fill();
    if (s.view.k > 0.5 && (s.unveil || litByDomain[d])) {
      ctx.font = `${Math.round(13 + 3 * Math.min(1.5, s.view.k))}px ${FONT_DISPLAY}`; ctx.fillStyle = `hsla(${hue},60%,80%,0.6)`; ctx.textAlign = "center";
      ctx.fillText(domainLabel(atlas.domains[d]), x, y - (60 + Math.sqrt(c.size) * 6) * s.view.k);
    }
  });

  // Constellations: bright between explored stars of one domain; a faint arc
  // when a prerequisite crosses domains, so it does not cut across the sky.
  for (const [a, b] of atlas.edges) {
    const la = s.lit.has(a), lb = s.lit.has(b);
    const [x1, y1] = toScreen(s, atlas.stars[a].x, atlas.stars[a].y), [x2, y2] = toScreen(s, atlas.stars[b].x, atlas.stars[b].y);
    if (atlas.stars[a].domain !== atlas.stars[b].domain) {
      if (!(la && lb) && !s.unveil) continue;
      ctx.strokeStyle = la && lb ? "rgba(242,199,102,0.16)" : "rgba(142,161,200,0.04)"; ctx.lineWidth = 0.8;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx + (cx - mx) * 0.45, my + (cy - my) * 0.45, x2, y2); ctx.stroke();
      continue;
    }
    if (!(la || lb) && !s.unveil) continue;
    if (la && lb) { ctx.strokeStyle = "rgba(242,199,102,0.55)"; ctx.lineWidth = 1.2; }
    else if (la || lb) { ctx.strokeStyle = "rgba(142,161,200,0.28)"; ctx.lineWidth = 1; ctx.setLineDash([2, 4]); }
    else { ctx.strokeStyle = "rgba(142,161,200,0.06)"; ctx.lineWidth = 0.6; }
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
  }

  // Stars; during the opening the explored ones ignite one after another.
  for (let i = 0; i < atlas.stars.length; i++) if (!s.lit.has(i)) star(ctx, atlas, s, i, 1);
  const order = igniteOrder(s);
  order.forEach((i, k) => {
    let a = 1;
    if (s.igniteFrom !== null) {
      const at = s.igniteFrom + 500 + k * IGNITE_STEP(order.length);
      a = Math.max(0, Math.min(1, (s.time - at) / 600));
      if (a > 0 && a < 1) { const [x, y] = toScreen(s, atlas.stars[i].x, atlas.stars[i].y); glow(ctx, x, y, 60 * (1 - a) + 10, "255,240,200", 0.6 * (1 - a)); }
    }
    if (a > 0) star(ctx, atlas, s, i, a);
  });

  // Labels never overlap: selection and hover first, then the brightest stars.
  const placed: number[][] = [];
  const label = (i: number) => {
    const topic = s.lit.get(i), [x, y] = toScreen(s, atlas.stars[i].x, atlas.stars[i].y);
    const strong = topic?.state === "did-it", text = topicLabel(atlas.stars[i].id, topic?.name ?? atlas.stars[i].id);
    const ly = y + (strong ? 16 : 9) * Math.min(1.8, Math.max(0.6, s.view.k)), size = strong ? 15 : 13, half = text.length * size / 2 + 4;
    const box = [x - half, ly, x + half, ly + size + 4];
    if (placed.some(b => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3])) return;
    placed.push(box);
    ctx.font = `${size}px ${FONT_BODY}`; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillStyle = strong ? "rgba(246,220,155,0.95)" : topic ? "rgba(233,228,212,0.88)" : "rgba(165,169,194,0.85)";
    ctx.shadowColor = "rgba(7,11,28,0.9)"; ctx.shadowBlur = 6; ctx.fillText(text, x, ly); ctx.shadowBlur = 0;
  };
  if (s.selected !== null) label(s.selected);
  if (s.hover !== null && s.hover !== s.selected) label(s.hover);
  if (s.view.k > 0.8 || s.lit.size < 12) for (const i of [...order].reverse()) label(i);
  if (s.selected !== null) {
    const [x, y] = toScreen(s, atlas.stars[s.selected].x, atlas.stars[s.selected].y);
    ctx.strokeStyle = "rgba(246,220,155,0.9)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.stroke();
  }
}

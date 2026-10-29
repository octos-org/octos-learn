import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { LearningMapTopic } from "../../history/history-api";
import { domainLabel, topicLabel } from "../taxonomy-labels";
import { recommendedPrompt, topicPrompts, usePromptBank } from "../topic-prompts";
import { buildAtlas, fitView, frameLevel, placeTopics, type View } from "./atlas-model";
import { igniteDuration, paintAtlas, RING_NAMES, toScreen, toWorld, type PaintState } from "./paint-atlas";
import "./star-atlas.css";

const atlas = buildAtlas();
const STATE_TEXT = { explored: "已探索", practising: "正在破印", "did-it": "做出来过" } as const;
const FRAME_TEXT = ["", "练过两天，多了一圈星环", "练过三天以上，星环开始转动", "练过五天以上，星环长出花框"];
const ease = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** The learner's lit topics on the academy's star atlas (Mathematics for
 * now). Stars only reflect recorded facts: lighting one means "did it once
 * without hints", never mastery, and a lit star never dims. */
export function StarAtlas({ topics, onAsk }: { topics: LearningMapTopic[]; onAsk?: (draft: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const placed = useMemo(() => placeTopics(atlas, topics), [topics]);
  const [selected, setSelected] = useState<number | null>(null);
  const [unveil, setUnveil] = useState(false);
  const prompts = usePromptBank(Boolean(onAsk));
  // Everything the animation frame reads lives in one ref, so a frame never sees stale props.
  const live = useRef({ view: { x: 0, y: 0, k: 1 } as View, hover: null as number | null, selected: null as number | null, unveil: false,
    placed, width: 0, height: 0, flight: null as null | { from: View; to: View; start: number; ms: number }, igniteFrom: null as number | null });
  const reduceMotion = useMemo(() => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  useEffect(() => { live.current.placed = placed; }, [placed]);
  useEffect(() => { live.current.selected = selected; }, [selected]);
  useEffect(() => { live.current.unveil = unveil; }, [unveil]);

  const flyTo = (to: View, ms: number) => {
    const state = live.current;
    if (reduceMotion || !ms) { state.view = to; state.flight = null; return; }
    state.flight = { from: { ...state.view }, to, start: performance.now(), ms };
  };
  const home = (ms = 900) => flyTo(fitView(atlas, [...live.current.placed.lit.keys()], live.current.width, live.current.height), ms);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const state = live.current;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      state.width = canvas.clientWidth; state.height = canvas.clientHeight;
      canvas.width = Math.round(state.width * dpr); canvas.height = Math.round(state.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(canvas);
    // Opening: the whole sky, then the camera settles on the learner's stars as they ignite.
    const all = fitView(atlas, [], state.width, state.height, 60);
    state.view = { ...all, k: all.k * 0.8 };
    state.igniteFrom = reduceMotion ? null : performance.now();
    home(reduceMotion ? 0 : 2400);
    let frame = 0;
    const draw = (time: number) => {
      if (state.flight) {
        const p = Math.min(1, (time - state.flight.start) / state.flight.ms), e = ease(p), { from, to } = state.flight;
        state.view = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k * Math.pow(to.k / from.k, e) };
        if (p >= 1) state.flight = null;
      }
      if (state.igniteFrom !== null && time > state.igniteFrom + igniteDuration(state.placed.lit.size)) state.igniteFrom = null;
      if (!document.hidden && state.width && state.height) {
        const paint: PaintState = { view: state.view, width: state.width, height: state.height, time, reduceMotion, lit: state.placed.lit, near: state.placed.near,
          unveil: state.unveil, selected: state.selected, hover: state.hover, igniteFrom: state.igniteFrom };
        paintAtlas(ctx, atlas, paint);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
    // The opening runs once per mount; later changes reach the frame through `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drag to pan, wheel or pinch to zoom, tap a star.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = live.current, pointers = new Map<number, { x: number; y: number }>();
    let moved = 0, pinch: number | null = null;
    const local = (e: PointerEvent | WheelEvent) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
    const nearest = (sx: number, sy: number) => {
      const paint = { view: state.view, width: state.width, height: state.height } as PaintState;
      let best: number | null = null, bestDistance = 24 * 24;
      atlas.stars.forEach((star, i) => {
        if (!state.unveil && !state.placed.lit.has(i) && !state.placed.near.has(i)) return;
        const [x, y] = toScreen(paint, star.x, star.y), d = (x - sx) ** 2 + (y - sy) ** 2;
        if (d < bestDistance) { bestDistance = d; best = i; }
      });
      return best;
    };
    const zoomAt = (sx: number, sy: number, factor: number) => {
      const [wx, wy] = toWorld(state, sx, sy), k = Math.max(0.3, Math.min(5, state.view.k * factor));
      state.view = { k, x: (sx - state.width / 2) / k - wx, y: (sy - state.height / 2) / k - wy };
    };
    const down = (e: PointerEvent) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; state.flight = null; };
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) { const [x, y] = local(e); state.hover = nearest(x, y); return; }
      const previous = pointers.get(e.pointerId)!; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()], distance = Math.hypot(a.x - b.x, a.y - b.y), r = canvas.getBoundingClientRect();
        if (pinch) zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, distance / pinch);
        pinch = distance; moved += 10; return;
      }
      state.view = { ...state.view, x: state.view.x + (e.clientX - previous.x) / state.view.k, y: state.view.y + (e.clientY - previous.y) / state.view.k };
      moved += Math.abs(e.clientX - previous.x) + Math.abs(e.clientY - previous.y);
    };
    const up = (e: PointerEvent) => {
      if (pointers.size === 1 && moved < 8) { const [x, y] = local(e); setSelected(nearest(x, y)); }
      pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); state.flight = null; const [x, y] = local(e); zoomAt(x, y, Math.exp(-e.deltaY * 0.0015)); };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up); canvas.removeEventListener("wheel", wheel);
    };
  }, []);

  const focus = (i: number) => { setSelected(i); flyTo({ x: -atlas.stars[i].x, y: -atlas.stars[i].y, k: Math.max(live.current.view.k, 1.4) }, 700); };
  const zoom = (factor: number) => flyTo({ ...live.current.view, k: Math.max(0.3, Math.min(5, live.current.view.k * factor)) }, 350);
  const toggleUnveil = () => {
    const next = !unveil; setUnveil(next);
    flyTo(next ? fitView(atlas, [], live.current.width, live.current.height) : fitView(atlas, [...placed.lit.keys()], live.current.width, live.current.height), 900);
  };
  const counts = { lit: 0, sealed: 0, seen: 0 };
  for (const topic of placed.lit.values()) counts[topic.state === "did-it" ? "lit" : topic.state === "practising" ? "sealed" : "seen"]++;

  const star = selected === null ? null : atlas.stars[selected];
  const topic = selected === null ? undefined : placed.lit.get(selected);
  const name = star ? topicLabel(star.id, topic?.name ?? star.id) : "";
  const links = (indices: number[], title: string) => indices.length ? <div className="star-atlas-links">
    <h4>{title}</h4>
    <div>{indices.slice(0, 8).map(i => <button key={i} type="button" onClick={() => focus(i)}>
      {topicLabel(atlas.stars[i].id, placed.lit.get(i)?.name ?? atlas.stars[i].id)}{placed.lit.get(i)?.state === "did-it" ? " ✦" : ""}
    </button>)}</div>
  </div> : null;

  return <section className="star-atlas" aria-label="星图">
    <canvas ref={canvasRef} className="star-atlas-sky" role="img"
      aria-label={`数之星域：点亮 ${counts.lit} 颗，正在破印 ${counts.sealed} 颗，显现 ${counts.seen} 颗。拖动平移，滚轮或双指缩放，点击星辰查看详情；下方有按星域列出的版本。`} />
    <div className="star-atlas-top">
      <div className="star-atlas-title"><span>Star Atlas Academy</span><strong>数之星域</strong></div>
      <div className="star-atlas-tally" aria-live="polite">
        <span className="lit"><b>{counts.lit}</b>点亮</span><span><b>{counts.sealed}</b>正在破印</span><span><b>{counts.seen}</b>显现</span>
      </div>
      <button type="button" className="star-atlas-chip" aria-pressed={unveil} onClick={toggleUnveil}>{unveil ? "恢复迷雾" : "揭开全部迷雾"}</button>
    </div>
    <div className="star-atlas-zoom">
      <button type="button" aria-label="放大" onClick={() => zoom(1.5)}>+</button>
      <button type="button" aria-label="缩小" onClick={() => zoom(1 / 1.5)}>−</button>
      <button type="button" aria-label="回到我点亮的星辰" onClick={() => home()}>✦</button>
    </div>
    {star && <div className="star-atlas-card" role="dialog" aria-label={name}>
      <button type="button" className="star-atlas-close" aria-label="关闭" onClick={() => setSelected(null)}>×</button>
      <h3>{name}</h3>
      {topic && topic.name !== name && <p className="star-atlas-en">{topic.name}</p>}
      <span className={`star-atlas-state is-${topic?.state ?? "mist"}`}>{topic ? STATE_TEXT[topic.state] : "迷雾中"}</span>
      <dl>
        <dt>星域</dt><dd>{domainLabel(atlas.domains[star.domain])}</dd>
        <dt>学部</dt><dd>{RING_NAMES[star.ring].name}（{RING_NAMES[star.ring].note}）</dd>
        {topic && <>
          <dt>听过的讲解</dt><dd>{topic.evidence.played_beats} 段</dd>
          <dt>练习作答</dt><dd>{topic.evidence.task_attempts} 次</dd>
          <dt>不看提示做对</dt><dd>{topic.evidence.unassisted_successes} 次</dd>
          <dt>学过的日子</dt><dd>{topic.evidence.days.length} 天</dd>
        </>}
      </dl>
      {topic && <Link className="star-atlas-evidence" to={`/records?${new URLSearchParams({ topic: topic.topic_id, name: topic.name })}`}>查看这颗星的学习依据 →</Link>}
      {frameLevel(topic) > 0 && <p className="star-atlas-note">{FRAME_TEXT[frameLevel(topic)]}</p>}
      {topic?.state === "did-it" && <p className="star-atlas-note">“做出来过”表示不看提示做对过，不等于已经掌握。点亮的星辰不会熄灭。</p>}
      {!topic && <p className="star-atlas-note">{placed.near.has(selected!) ? "它就在你去过的星辰旁边，迷雾已经变薄。" : "这片星空还被迷雾遮着。"}</p>}
      {onAsk && <div className="star-atlas-asks" role="group" aria-label="在新白板上问问">
        <h4>在新白板上问问</h4>
        {/* The real questions, once loaded; never a stand-in to be tapped meanwhile. */}
        {!prompts && <p className="star-atlas-note">正在准备问题……</p>}
        {prompts && topicPrompts(prompts, star.id, name, recommendedPrompt(topic?.state)).map((prompt) => (
          <button key={prompt.kind} type="button" className="star-atlas-ask" data-recommended={prompt.recommended || undefined} onClick={() => onAsk(prompt.text)}>
            <span>{prompt.label}{prompt.recommended && <em>推荐</em>}</span>{prompt.text}
          </button>
        ))}
      </div>}
      {links(atlas.prerequisites[selected!], "前置星辰")}
      {links(atlas.leadsTo[selected!], "由此通往")}
    </div>}
  </section>;
}

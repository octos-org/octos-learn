import { useEffect, useRef, type CSSProperties } from "react";

import type { TeacherDefinition } from "./teachers";
import { portraitAsset } from "./teacher-portrait-state";
import "./teacher-card.css";

const reducedMotion = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

/** A teacher's card in two layers, the painted background and the cut-out
 * figure. The card tilts toward the pointer (or a finger), the layers shift
 * by different amounts and a warm key light follows, falling on the figure
 * only. Left alone it drifts slowly; it rests still under reduced motion and
 * stops working while scrolled out of view. */
export function TeacherCard({ teacherId }: { teacherId: TeacherDefinition["id"] }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    const state = { x: 0, y: 0, tx: 0, ty: 0, last: -Infinity };
    const move = (event: PointerEvent) => {
      const box = el.getBoundingClientRect();
      state.tx = Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width) * 2 - 1));
      state.ty = Math.max(-1, Math.min(1, ((event.clientY - box.top) / box.height) * 2 - 1));
      state.last = performance.now();
    };
    const leave = () => { state.last = -Infinity; };
    let raf = 0;
    let visible = true;
    const frame = (now: number) => {
      if (now - state.last > 2500) {
        // A slow, out-of-step drift so the three cards never move together.
        const s = now / 1000 + teacherId.length * 1.7;
        state.tx = Math.sin(s * 0.31) * 0.5;
        state.ty = Math.sin(s * 0.23 + 1.3) * 0.35;
      }
      state.x += (state.tx - state.x) * 0.07;
      state.y += (state.ty - state.y) * 0.07;
      el.style.setProperty("--px", state.x.toFixed(3));
      el.style.setProperty("--py", state.y.toFixed(3));
      if (visible) raf = requestAnimationFrame(frame);
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(frame);
    });
    observer?.observe(el);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerdown", move);
    el.addEventListener("pointerleave", leave);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerdown", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [teacherId]);

  const figure = portraitAsset(teacherId, "card-figure");
  return (
    <span ref={ref} className="teacher-card" aria-hidden="true" style={{ "--figure": `url("${figure}")` } as CSSProperties}>
      <span className="teacher-card-tilt">
        <img className="teacher-card-bg" src={portraitAsset(teacherId, "card-bg")} alt="" draggable={false} loading="lazy" decoding="async" />
        <img className="teacher-card-figure" src={figure} alt="" draggable={false} loading="lazy" decoding="async" />
        <span className="teacher-card-light" />
        <span className="teacher-card-glare" />
      </span>
    </span>
  );
}

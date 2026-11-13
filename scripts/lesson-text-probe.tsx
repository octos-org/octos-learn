/** Browser integration fixture; served by Vite only, never imported by the app. */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { LessonText } from "../src/learning/oll/lesson-text";
import "katex/dist/katex.min.css";
import "octos-lesson-language/web-runtime/styles.css";
import "../src/index.css";
import "../src/learning/learning-workspace.css";

// Every place Learn draws model-written lesson text through LessonText, with the wrappers and classes
// the app uses, so the workspace CSS reaches the formula exactly as it does in a lesson.
const FORMULA = "$x^2 + \\frac{1}{2}$";

// One container at a time: several are positioned or fixed in the real CSS and would cover each other.
const SHOW = window as unknown as { showProbe?: (name: string) => void; probeNames: string[] };

// eslint-disable-next-line react-refresh/only-export-components -- a fixture entry page, never hot-reloaded
function Probe() {
  const [only, setOnly] = useState<string | null>(null);
  useEffect(() => { SHOW.showProbe = setOnly; }, []);
  const t = <LessonText text={FORMULA} />;
  return (
    <div data-only={only ?? ""} style={{ display: "grid", gap: 24, padding: 24, width: 900 }}>
      <style>{only ? `[data-probe-group]:not([data-probe-group="${only}"]) { display: none !important; }` : ""}</style>
      <header className="learning-workspace-topbar" data-probe="title" data-probe-group="title"><div><span>label</span><strong>{t}</strong></div></header>
      <div className="learning-degraded-visuals" data-probe-group="degraded"><div className="learning-degraded-visual">
        <div><strong data-probe="degraded-title">{t}</strong><span data-probe="degraded-purpose">{t}</span></div>
      </div></div>
      <section className="learning-student-tasks" data-probe-group="task"><article className="learning-student-task is-succeeded">
        <p data-probe="task-prompt">{t}</p>
        <div className="learning-student-task-feedback is-success"><span>ok<small data-probe="task-success">{t}</small></span></div>
        <div className="learning-student-task-hint"><span data-probe="task-hint">{t}</span></div>
      </article></section>
      <section className="learning-student-tasks learning-reflection-card" data-probe-group="reflection">
        <p data-probe="reflection-prompt">{t}</p>
        <div className="learning-reflection-answer" data-probe="reflection-answer">{t}</div>
      </section>
      <section className="oll-course-topic" data-probe-group="outline"><header><span>01</span><h3 data-probe="outline-topic">{t}</h3></header>
        <ol><li className="oll-course-step"><div className="oll-course-step-row">
          <button type="button" className="oll-course-step-main"><span>1</span><span data-probe="outline-step">{t}</span></button>
        </div>
          <ol className="oll-course-beats"><li><button type="button" className="oll-course-beat-main"><span>1</span><b data-probe="outline-beat">{t}</b></button></li></ol>
        </li></ol>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Probe />);
SHOW.probeNames = ["title", "degraded", "task", "reflection", "outline"];

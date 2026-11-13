import { useLayoutEffect, useRef } from "react";
import { inlineMathSegments, renderInlineText } from "octos-lesson-language/web-runtime";

/**
 * Lesson text the host draws itself (the title, practice prompts, questions and answers). The model
 * writes it like board-card text, with inline math such as `$y = a x^2$`, so it is rendered by OLL's
 * own rule and KaTeX settings; a `$` then means the same on every card.
 */
export function LessonText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (ref.current) renderInlineText(ref.current, text);
  }, [text]);
  return <span ref={ref} className={className} data-lesson-text="" />;
}

/** The same text where only plain text fits (a list row, a tooltip): math keeps its source, without delimiters. */
export function lessonPlainText(text: string): string {
  return inlineMathSegments(text).map((segment) => segment.value).join("");
}

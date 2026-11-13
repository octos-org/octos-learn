import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LessonText, lessonPlainText } from "./lesson-text";

describe("lesson text drawn by the host", () => {
  it("renders inline math as on board cards, leaving no delimiters", () => {
    // A quadratic lesson's practice prompt (2026-11-12) showed "$a$" and "$5$" as raw text.
    const { container } = render(<LessonText text="请你把滑块 $a$ 的数值调到 $5$。" />);
    expect(container.querySelectorAll(".inline-math .katex")).toHaveLength(2);
    expect(container.textContent).not.toContain("$");
    expect(container.textContent).toContain("请你把滑块");
  });

  it("keeps plain text, an unpaired dollar and an escaped dollar as text", () => {
    const { container, rerender } = render(<LessonText text="费用为 $5，价格是 \$3" />);
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.textContent).toBe("费用为 $5，价格是 \\$3");
    rerender(<LessonText text="当 $a = 4$ 时" />);
    expect(container.querySelectorAll(".katex")).toHaveLength(1);
    expect(container.textContent).not.toContain("当 $a");
  });

  it("gives a plain-text form for list rows and tooltips", () => {
    expect(lessonPlainText("探索二次函数 $y = a x^2$ 中系数 $a$ 的影响")).toBe("探索二次函数 y = a x^2 中系数 a 的影响");
    expect(lessonPlainText("费用为 $5")).toBe("费用为 $5");
  });
});

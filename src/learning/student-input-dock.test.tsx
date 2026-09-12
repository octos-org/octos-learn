import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudentInputDock } from "./student-input-dock";

describe("StudentInputDock board references", () => {
  it("shows attached board content and lets the learner remove it before sending", () => {
    const remove = vi.fn();
    render(
      <StudentInputDock
        voiceState="idle"
        cameraActive={false}
        onMic={vi.fn()}
        onToggleCamera={vi.fn()}
        onSendText={vi.fn()}
        onSendImage={vi.fn()}
        references={[{ id: "ref-1", label: "截面公式" }]}
        onRemoveReference={remove}
      />,
    );

    expect(screen.getByLabelText("已引用的白板内容").textContent)
      .toContain("已引用：截面公式");
    fireEvent.click(screen.getByRole("button", { name: "移除引用：截面公式" }));
    expect(remove).toHaveBeenCalledWith("ref-1");
  });

  it("prefills a short-topic suggestion without starting generation", () => {
    const send = vi.fn();
    const view = render(
      <StudentInputDock
        voiceState="idle"
        cameraActive={false}
        onMic={vi.fn()}
        onToggleCamera={vi.fn()}
        onSendText={send}
        onSendImage={vi.fn()}
        suggestions={["斜率是什么？", "圆的面积为什么是 πr²？"]}
      />,
    );

    const dock = within(view.container);
    fireEvent.click(dock.getByRole("button", { name: "斜率是什么？" }));

    expect((dock.getByRole("textbox", { name: "输入学习问题" }) as HTMLInputElement).value)
      .toBe("斜率是什么？");
    expect(send).not.toHaveBeenCalled();
    expect(dock.queryByLabelText("试着从一个主题开始")).toBeNull();
  });

  it("keeps only text and send controls in meeting-display mode", () => {
    const view = render(
      <StudentInputDock
        textOnly
        voiceState="idle"
        cameraActive={false}
        onMic={vi.fn()}
        onToggleCamera={vi.fn()}
        onSendText={vi.fn()}
        onSendImage={vi.fn()}
      />,
    );

    const dock = within(view.container);
    expect(dock.queryByRole("button", { name: "上传题目图片" })).toBeNull();
    expect(dock.queryByRole("button", { name: "打开摄像头" })).toBeNull();
    expect(dock.queryByRole("button", { name: "语音提问" })).toBeNull();
    expect(dock.getByRole("textbox", { name: "输入学习问题" })).toBeTruthy();
    expect(dock.getByRole("button", { name: "发送问题" })).toBeTruthy();
  });
});

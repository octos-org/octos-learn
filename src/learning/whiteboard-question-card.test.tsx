import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WhiteboardQuestionCard } from "./whiteboard-question-card";
import type { WhiteboardQuestionRecord } from "./whiteboard-questions";

afterEach(cleanup);

const cameraQuestion: WhiteboardQuestionRecord = {
  id: "camera-question",
  sessionId: "learn-camera-question",
  text: "请看一下纸上的函数，并结合图像讲解。",
  origin: "composer",
  createdAt: "2026-08-26T08:00:00.000Z",
  status: "answered",
  imagePath: "uploads/camera-question.jpg",
};

describe("WhiteboardQuestionCard", () => {
  it("opens the attached camera frame in a viewport preview", () => {
    render(
      <WhiteboardQuestionCard
        question={cameraQuestion}
        left={100}
        top={120}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "放大查看本次问题图片",
    });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", {
      name: "本次问题图片预览",
    });
    const preview = screen.getByRole("img", {
      name: "放大的本次问题随附摄像头画面",
    });
    expect(dialog.contains(preview)).toBe(true);
    expect(preview.getAttribute("src")).toContain(
      "uploads%2Fcamera-question.jpg",
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", {
      name: "本次问题图片预览",
    })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes the preview from its close button", () => {
    render(
      <WhiteboardQuestionCard
        question={cameraQuestion}
        left={100}
        top={120}
      />,
    );

    fireEvent.click(screen.getByRole("button", {
      name: "放大查看本次问题图片",
    }));
    fireEvent.click(screen.getByRole("button", {
      name: "关闭图片预览",
    }));

    expect(screen.queryByRole("dialog", {
      name: "本次问题图片预览",
    })).toBeNull();
  });
});

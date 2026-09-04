import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_KEY } from "@/lib/constants";
import { WhiteboardQuestionCard } from "./whiteboard-question-card";
import type { WhiteboardQuestionRecord } from "./whiteboard-questions";

beforeEach(() => {
  localStorage.setItem(TOKEN_KEY, "camera-token");
  localStorage.setItem("selected_profile", "admin");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(
    new Blob(["jpeg"], { type: "image/jpeg" }),
    { status: 200 },
  )));
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:camera-frame"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("selected_profile");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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
  it("loads the camera frame with profile-aware headers and opens it", async () => {
    render(
      <WhiteboardQuestionCard
        question={cameraQuestion}
        left={100}
        top={120}
      />,
    );

    const trigger = await screen.findByRole("button", {
      name: "放大查看本次问题图片",
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/files?path=uploads%2Fcamera-question.jpg&session=learn-camera-question",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer camera-token",
          "X-Profile-Id": "admin",
        },
      }),
    );
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", {
      name: "本次问题图片预览",
    });
    const preview = screen.getByRole("img", {
      name: "放大的本次问题随附摄像头画面",
    });
    expect(dialog.contains(preview)).toBe(true);
    expect(preview.getAttribute("src")).toBe("blob:camera-frame");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", {
      name: "本次问题图片预览",
    })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes the preview from its close button", async () => {
    render(
      <WhiteboardQuestionCard
        question={cameraQuestion}
        left={100}
        top={120}
      />,
    );

    fireEvent.click(await screen.findByRole("button", {
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

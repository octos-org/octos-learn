import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OctosTeacher } from "./octos-teacher";

vi.mock("@/hooks/use-teacher-skin", () => ({
  useTeacherSkin: () => ({ skin: "ocean" }),
}));

vi.mock("@/components/octos-skin-art", () => ({
  OctosSkinArt: ({ activity }: { activity: string }) => (
    <span data-testid="teacher-art" data-activity={activity} />
  ),
}));

describe("OctosTeacher", () => {
  it("shows a generic preparation animation without exposing TTS details", () => {
    const onClick = vi.fn();
    render(
      <OctosTeacher
        state="idle"
        speech="下一步马上开始。"
        preparing
        onClick={onClick}
      />,
    );

    const avatar = screen.getByRole("button", {
      name: "Octos 正在准备下一步",
    });
    expect(avatar.getAttribute("aria-busy")).toBe("true");
    expect(avatar.getAttribute("data-preparing")).toBe("true");
    expect(screen.getByText("稍等一下")).toBeTruthy();
    expect(screen.queryByText(/TTS|语音生成/i)).toBeNull();
    expect(screen.getByTestId("teacher-art").getAttribute("data-activity"))
      .toBe("thinking");

    fireEvent.click(avatar);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

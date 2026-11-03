import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CaptureCallbacks } from "./face-capture";
import type { FaceFrame } from "./face-frame";

const captureMock = vi.hoisted(() => ({ starts: vi.fn(), stops: vi.fn(), callbacks: null as CaptureCallbacks | null }));
const stageMock = vi.hoisted(() => ({ frame: null as ((now: number) => FaceFrame) | null, active: false }));
vi.mock("../academy/academy-header", () => ({ AcademyHeader: () => <header /> }));
vi.mock("../teach/teach-board", () => ({ TeachBoard: () => <div /> }));
vi.mock("./avatar-stage", () => ({ AvatarStage: ({ frame, active }: { frame: (now: number) => FaceFrame; active: boolean }) => { stageMock.frame = frame; stageMock.active = active; return <div />; } }));
vi.mock("./avatar-audio-preview", () => ({ AvatarAudioPreview: () => <div /> }));
vi.mock("./face-capture", () => ({
  FaceCapture: class {
    callbacks: CaptureCallbacks;
    constructor(_video: HTMLVideoElement, callbacks: CaptureCallbacks) { this.callbacks = callbacks; captureMock.callbacks = callbacks; }
    start() { captureMock.starts(); return Promise.resolve(); }
    stop() { captureMock.stops(); this.callbacks.onState("idle"); }
  },
  selfTestFaceModel: vi.fn(async () => 1),
}));
import AvatarLabPage from "./avatar-lab-page";

beforeEach(() => { captureMock.starts.mockClear(); captureMock.stops.mockClear(); });
afterEach(cleanup);
const open = () => render(<MemoryRouter><AvatarLabPage /></MemoryRouter>);

it("does not open the camera on entry or when checking the local model", async () => {
  open();
  expect(captureMock.starts).not.toHaveBeenCalled();
  expect((screen.getByRole("button", { name: "录一段表情" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "自检表情模型" }));
  await screen.findByText("表情模型自检通过，未使用摄像头。");
  expect(captureMock.starts).not.toHaveBeenCalled();
});

it("inspects fixed model poses without opening the camera or running continuous animation", () => {
  open(); fireEvent.click(screen.getByRole("button", { name: "双眼闭合", exact: true }));
  expect(captureMock.starts).not.toHaveBeenCalled();
  expect(stageMock.active).toBe(false);
  expect(stageMock.frame!(0).channels).toEqual({ eyeBlinkLeft: 1, eyeBlinkRight: 1 });
  fireEvent.click(screen.getByRole("button", { name: "侧面检查", exact: true }));
  expect(stageMock.frame!(0).rotation).toEqual([0, -.65, 0]);
  expect(stageMock.frame!(0).source).toBe("demo");
});

it("cannot record a pending permission request and releases capture when leaving", () => {
  const page = open();
  fireEvent.click(screen.getByRole("button", { name: "开启摄像头跟随" }));
  expect(captureMock.starts).toHaveBeenCalledOnce();
  const record = () => screen.getByRole("button", { name: "录一段表情" }) as HTMLButtonElement;
  expect(record().disabled).toBe(true);
  act(() => captureMock.callbacks!.onState("loading"));
  expect(record().disabled).toBe(true);
  act(() => captureMock.callbacks!.onState("tracking"));
  expect(record().disabled).toBe(false);
  const stopped = captureMock.stops.mock.calls.length;
  page.unmount(); expect(captureMock.stops.mock.calls.length).toBeGreaterThan(stopped);
});

it("returns to a usable state if camera permission is refused", () => {
  open(); fireEvent.click(screen.getByRole("button", { name: "开启摄像头跟随" }));
  act(() => captureMock.callbacks!.onError("permission_denied"));
  expect(screen.getByRole("alert").textContent).toContain("摄像头权限未开启");
  expect((screen.getByRole("button", { name: "开启摄像头跟随" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "播放演示动作" }));
  expect(screen.getByText("演示动作，未使用摄像头")).toBeTruthy();
});

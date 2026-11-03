import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CaptureCallbacks } from "./face-capture";
import type { FaceFrame } from "./face-frame";

const captureMock = vi.hoisted(() => ({ starts: vi.fn(), stops: vi.fn(), callbacks: null as CaptureCallbacks | null }));
const stageMock = vi.hoisted(() => ({ frame: null as ((now: number) => FaceFrame) | null, active: false }));
vi.mock("../academy/academy-header", () => ({ AcademyHeader: () => <header /> }));
vi.mock("../teach/teach-board", () => ({ TeachBoard: () => <div /> }));
vi.mock("./illustrated-avatar-stage", () => ({ IllustratedAvatarStage: ({ frame, active }: { frame: (now: number) => FaceFrame; active: boolean }) => { stageMock.frame = frame; stageMock.active = active; return <div />; } }));
vi.mock("./avatar-audio-preview", () => ({ AvatarAudioPreview: () => <div /> }));
vi.mock("./face-capture", () => ({
  FaceCapture: class {
    callbacks: CaptureCallbacks;
    constructor(_video: HTMLVideoElement, callbacks: CaptureCallbacks) { this.callbacks = callbacks; captureMock.callbacks = callbacks; }
    start(options: unknown) { captureMock.starts(options); return Promise.resolve(); }
    stop() { captureMock.stops(); this.callbacks.onState("idle"); }
  },
  selfTestFaceModel: vi.fn(async () => 1),
}));
import AvatarLabPage from "./avatar-lab-page";

beforeEach(() => { captureMock.starts.mockClear(); captureMock.stops.mockClear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const open = () => render(<MemoryRouter><AvatarLabPage /></MemoryRouter>);

it("does not open the camera on entry or when checking the local model", async () => {
  open();
  expect(captureMock.starts).not.toHaveBeenCalled();
  expect((screen.getByRole("button", { name: "录一段动作" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "自检表情模型" }));
  await screen.findByText("表情模型自检通过，未使用摄像头。");
  expect(captureMock.starts).not.toHaveBeenCalled();
});

it("inspects fixed model poses without opening the camera or running continuous animation", () => {
  open(); fireEvent.click(screen.getByRole("button", { name: "双眼闭合", exact: true }));
  expect(captureMock.starts).not.toHaveBeenCalled();
  expect(stageMock.active).toBe(false);
  expect(stageMock.frame!(0).channels).toEqual({ eyeBlinkLeft: 1, eyeBlinkRight: 1 });
  fireEvent.click(screen.getByRole("button", { name: "轻轻偏头", exact: true }));
  expect(stageMock.frame!(0).rotation).toEqual([0, -.4, -.1]);
  expect(stageMock.frame!(0).source).toBe("demo");
});

it("cannot record a pending permission request and releases capture when leaving", () => {
  const page = open();
  fireEvent.click(screen.getByRole("button", { name: "开启摄像头跟随" }));
  expect(captureMock.starts).toHaveBeenCalledOnce();
  const record = () => screen.getByRole("button", { name: "录一段动作" }) as HTMLButtonElement;
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

it("routes captured expressions into the 2D stage and records them for replay", () => {
  vi.spyOn(performance, "now").mockReturnValue(1000);
  const page = open();
  fireEvent.click(screen.getByRole("button", { name: "开启摄像头跟随" }));
  act(() => {
    captureMock.callbacks!.onState("tracking");
    captureMock.callbacks!.onFrame({ timeMs: 1000, source: "mediapipe", tracked: true,
      channels: { jawOpen: .8, eyeBlinkLeft: .9, mouthSmileRight: .6 }, rotation: [.1, -.2, .05] }, 8, 12);
  });
  expect(stageMock.active).toBe(true);
  expect(stageMock.frame!(1000).source).toBe("mediapipe");
  expect(stageMock.frame!(1033).channels.jawOpen).toBeGreaterThan(.6);
  fireEvent.click(screen.getByRole("button", { name: "录一段动作", exact: true }));
  stageMock.frame!(1066); stageMock.frame!(1100);
  vi.mocked(performance.now).mockReturnValue(1133);
  fireEvent.click(screen.getByRole("button", { name: "结束动作片段", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "回放片段", exact: true }));
  expect(stageMock.frame!(1133).source).toBe("mediapipe");
  expect(stageMock.frame!(1133).channels.eyeBlinkLeft).toBeGreaterThan(.5);
  page.unmount();
});

it("manual sliders stop capture and deterministically redraw a paused synthetic expression", () => {
  open(); fireEvent.click(screen.getByRole("button", { name: "开启摄像头跟随" }));
  const stops = captureMock.stops.mock.calls.length;
  fireEvent.change(screen.getByRole("slider", { name: /嘴巴开合/ }), { target: { value: ".75" } });
  fireEvent.change(screen.getByRole("slider", { name: /左眼闭合/ }), { target: { value: "1" } });
  fireEvent.change(screen.getByRole("slider", { name: /歪头角度/ }), { target: { value: ".08" } });
  expect(captureMock.stops.mock.calls.length).toBeGreaterThan(stops);
  expect(stageMock.active).toBe(false);
  const frame = stageMock.frame!(0);
  expect(frame.source).toBe("demo"); expect(frame.channels.jawOpen).toBe(.75); expect(frame.channels.eyeBlinkLeft).toBe(1); expect(frame.rotation[2]).toBe(.08);
  fireEvent.click(screen.getByRole("button", { name: "恢复自然表情" }));
  expect(stageMock.frame!(0).channels.jawOpen).toBe(0); expect(stageMock.frame!(0).rotation).toEqual([0, 0, 0]);
});

it("keeps body capture disabled while arms are postponed", () => {
  open();
  expect(screen.queryByRole("checkbox", { name: "跟随上半身和双手" })).toBeNull();
  expect(screen.queryByRole("button", { name: "挥手演示" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "开启摄像头跟随" }));
  expect(captureMock.starts).toHaveBeenLastCalledWith(undefined);
});

it("records and replays rounded lips with facial and head controls", () => {
  vi.spyOn(performance, "now").mockReturnValue(1000); open();
  fireEvent.change(screen.getByRole("slider", { name: "圆唇程度" }), { target: { value: ".8" } });
  fireEvent.change(screen.getByRole("slider", { name: "点头幅度" }), { target: { value: ".2" } });
  fireEvent.click(screen.getByRole("button", { name: "录一段动作", exact: true }));
  stageMock.frame!(1000); stageMock.frame!(1100);
  vi.mocked(performance.now).mockReturnValue(1200);
  fireEvent.click(screen.getByRole("button", { name: "结束动作片段", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "回放片段", exact: true }));
  expect(stageMock.frame!(1200).channels.mouthPucker).toBe(.8);
  expect(stageMock.frame!(1200).rotation[0]).toBe(.2);
  expect(captureMock.starts).not.toHaveBeenCalled();
});

it("keeps a manual recording running across slider changes and replays the changing values", () => {
  vi.spyOn(performance,"now").mockReturnValue(1000);open();
  fireEvent.click(screen.getByRole("button",{name:"恢复自然表情"}));
  fireEvent.click(screen.getByRole("button",{name:"录一段动作",exact:true}));
  stageMock.frame!(1000);
  fireEvent.change(screen.getByRole("slider",{name:"嘴巴开合"}),{target:{value:".8"}});
  expect(screen.getByRole("button",{name:"结束动作片段",exact:true})).toBeTruthy();
  stageMock.frame!(1100);
  fireEvent.change(screen.getByRole("slider",{name:"圆唇程度"}),{target:{value:".6"}});
  stageMock.frame!(1200);vi.mocked(performance.now).mockReturnValue(1300);
  fireEvent.click(screen.getByRole("button",{name:"结束动作片段",exact:true}));
  fireEvent.click(screen.getByRole("button",{name:"回放片段",exact:true}));
  expect(stageMock.frame!(1300).channels.jawOpen).toBe(0);
  expect(stageMock.frame!(1400).channels.jawOpen).toBe(.8);
  expect(stageMock.frame!(1500).channels.mouthPucker).toBe(.6);
});

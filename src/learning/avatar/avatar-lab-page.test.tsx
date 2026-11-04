import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CaptureCallbacks } from "./face-capture";
import type { FaceFrame } from "./face-frame";

const captureMock = vi.hoisted(() => ({ starts: vi.fn(), stops: vi.fn(), callbacks: null as CaptureCallbacks | null }));
const stageMock = vi.hoisted(() => ({ frame: null as ((now: number) => FaceFrame) | null, active: false,characterId:'',idleMotion:false,earTurn:false,earDemo:false }));
vi.mock("../academy/academy-header", () => ({ AcademyHeader: () => <header /> }));
vi.mock("../teach/teach-board", () => ({ TeachBoard: () => <div /> }));
vi.mock("./illustrated-avatar-stage", () => ({ IllustratedAvatarStage: ({ frame, active,characterId,idleMotion=false,earTurn=false,earDemo=false }: { frame: (now: number) => FaceFrame; active: boolean;characterId?:string;idleMotion?:boolean;earTurn?:boolean;earDemo?:boolean }) => { stageMock.frame = frame; stageMock.active = active;stageMock.characterId=characterId??'star-fox';stageMock.idleMotion=idleMotion;stageMock.earTurn=earTurn;stageMock.earDemo=earDemo; return <div />; } }));
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

it('enables natural motion on entry without a camera and freezes it for pose inspection',()=>{
  open();expect(stageMock.idleMotion).toBe(true);expect(captureMock.starts).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox',{name:'毛发自然小动作'}));expect(stageMock.idleMotion).toBe(false);
  fireEvent.click(screen.getByRole('checkbox',{name:'毛发自然小动作'}));expect(stageMock.idleMotion).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'皱眉',exact:true}));expect(stageMock.idleMotion).toBe(false);
});

it('inspects the local ear and lock without a camera and can return to automatic following',()=>{
  open();
  expect((screen.getByRole('checkbox',{name:'使用新版发束与嘴型'}) as HTMLInputElement).checked).toBe(true);
  fireEvent.change(screen.getByRole('slider',{name:'右侧发束'}),{target:{value:'.8'}});
  expect(stageMock.idleMotion).toBe(false);expect(captureMock.starts).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'回到自动跟随'}));expect(stageMock.idleMotion).toBe(true);
  fireEvent.click(screen.getByRole('checkbox',{name:'使用新版发束与嘴型'}));
  expect(screen.queryByRole('slider',{name:'右侧发束'})).toBeNull();
});

it('switches the fitted character without restarting capture or losing the current expression',()=>{
  open();expect(stageMock.characterId).toBe('star-fox');
  fireEvent.change(screen.getByRole('slider',{name:'嘴巴开合'}),{target:{value:'.65'}});
  fireEvent.click(screen.getByRole('button',{name:'白兔',exact:true}));
  expect(stageMock.characterId).toBe('white-rabbit');expect(stageMock.frame!(0).channels.jawOpen).toBe(.65);
  expect(captureMock.starts).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'开启摄像头跟随'}));
  const stops=captureMock.stops.mock.calls.length;
  fireEvent.click(screen.getByRole('button',{name:'月猫',exact:true}));
  expect(stageMock.characterId).toBe('moon-cat');expect(captureMock.starts).toHaveBeenCalledTimes(1);
  expect(captureMock.stops).toHaveBeenCalledTimes(stops);
  expect(screen.getByRole('button',{name:'月猫',exact:true}).getAttribute('aria-pressed')).toBe('true');
});

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
  fireEvent.change(screen.getByRole("slider", { name: "左右视线" }), { target: { value: "-.7" } });
  fireEvent.change(screen.getByRole("slider", { name: "上下视线" }), { target: { value: ".4" } });
  fireEvent.change(screen.getByRole("slider", { name: "眯眼程度" }), { target: { value: ".6" } });
  fireEvent.click(screen.getByRole("button", { name: "录一段动作", exact: true }));
  stageMock.frame!(1000); stageMock.frame!(1100);
  vi.mocked(performance.now).mockReturnValue(1200);
  fireEvent.click(screen.getByRole("button", { name: "结束动作片段", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "回放片段", exact: true }));
  expect(stageMock.frame!(1200).channels.mouthPucker).toBe(.8);
  expect(stageMock.frame!(1200).rotation[0]).toBe(.2);
  expect(stageMock.frame!(1200).channels.eyeLookOutLeft).toBe(.7);
  expect(stageMock.frame!(1200).channels.eyeLookInRight).toBe(.7);
  expect(stageMock.frame!(1200).channels.eyeLookDownLeft).toBe(.4);
  expect(stageMock.frame!(1200).channels.eyeSquintRight).toBe(.6);
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

it('removes ear turning and keeps only hair controls without starting capture',()=>{
  open();expect(stageMock.earTurn).toBe(false);expect(stageMock.earDemo).toBe(false);
  expect(screen.queryByRole('button',{name:'播放左耳转向对照'})).toBeNull();
  expect(screen.queryByRole('checkbox',{name:'左耳使用绘制姿态动画（试验）'})).toBeNull();
  expect(screen.queryByRole('slider',{name:'左耳转向'})).toBeNull();
  expect(screen.queryByRole('slider',{name:'右耳转向'})).toBeNull();
  expect(captureMock.starts).not.toHaveBeenCalled();
});

it('records detailed manual lips and asymmetric brows and retains them on replay',()=>{
 vi.spyOn(performance,'now').mockReturnValue(1000);open();
 fireEvent.change(screen.getByRole('slider',{name:'抿嘴程度'}),{target:{value:'.6'}});
 fireEvent.change(screen.getByRole('slider',{name:'左眉挑起'}),{target:{value:'.8'}});
 fireEvent.change(screen.getByRole('slider',{name:'下唇内收'}),{target:{value:'.4'}});
 expect(stageMock.frame!(1000).channels).toMatchObject({mouthPressLeft:.6,mouthPressRight:.6,browOuterUpLeft:.8,browOuterUpRight:0,mouthRollLower:.4});
 fireEvent.click(screen.getByRole('button',{name:'录一段动作',exact:true}));stageMock.frame!(1033);stageMock.frame!(1066);
 vi.mocked(performance.now).mockReturnValue(1100);fireEvent.click(screen.getByRole('button',{name:'结束动作片段',exact:true}));
 fireEvent.click(screen.getByRole('button',{name:'回放片段',exact:true}));
 expect(stageMock.frame!(1100).channels).toMatchObject({mouthPressLeft:.6,browOuterUpLeft:.8,mouthRollLower:.4});
 expect(captureMock.starts).not.toHaveBeenCalled();
});

it('routes camera microexpressions and independent brow presets through the existing channels',()=>{
 open();fireEvent.click(screen.getByRole('button',{name:'左挑眉',exact:true}));expect(stageMock.frame!(0).channels).toEqual({browOuterUpLeft:.95});
 fireEvent.click(screen.getByRole('button',{name:'开启摄像头跟随'}));
 act(()=>{captureMock.callbacks!.onState('tracking');captureMock.callbacks!.onFrame({timeMs:1000,source:'mediapipe',tracked:true,rotation:[0,0,0],channels:{mouthPressLeft:.7,mouthRollLower:.8,browOuterUpRight:.6,browDownLeft:.4}},8,12);});
 const frame=stageMock.frame!(1000);expect(frame.channels.mouthPressLeft).toBeGreaterThan(.5);expect(frame.channels.mouthPressRight??0).toBe(0);expect(frame.channels.browOuterUpRight).toBeGreaterThan(.4);expect(frame.channels.browDownRight??0).toBe(0);
});

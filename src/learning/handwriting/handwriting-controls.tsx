import { HandwritingSetupControls, HandwritingPracticeOverlay } from "./handwriting-setup-controls";
import { ChevronDown, ChevronUp, ScanLine, X } from "lucide-react";
import { tr } from "@/i18n";
import type { useHandwritingInput } from "./use-handwriting-input";
import "./handwriting-controls.css";

type Input = ReturnType<typeof useHandwritingInput>;
function handwritingStatus(state: Input["state"], pinch: boolean): string {
  if (state.status === "failed") {
    if (state.error === "permission_denied") return tr("未获得摄像头权限");
    if (state.error === "camera_busy") return tr("当前摄像头朝向不适合手势，请先关闭给老师看的画面再重试。");
    if (state.error === "model_failed") return tr("手部识别模型加载失败");
    return tr("摄像头不可用");
  }
  if (state.status === "paused") {
    if (state.reason === "view") return tr("画面位置已变化，点击继续后重新张掌定位。");
    if (state.reason === "playback") return tr("课程播放中已暂停隔空书写。");
    if (state.reason === "direct" || state.reason === "tool") return tr("已切换为直接操作，点击继续可恢复隔空书写。");
    if (state.reason === "dialog") return tr("面板打开时已暂停隔空书写。");
    return tr("隔空书写已暂停");
  }
  if (state.status === "starting") return tr("正在加载摄像头与手部识别…");
  if (state.gesture?.phase === "drawing") return tr("按住 · 正在操作");
  if (state.gesture?.phase === "pending") return pinch ? tr("捏合确认中 · 目标已锁定") : tr("合手确认中 · 起笔位置已锁定");
  if (state.gesture?.phase === "holding") return pinch ? tr("松开确认中 · 已停止操作") : tr("张掌确认中 · 暂停画线");
  if (state.gesture?.phase === "ready") return tr("抬笔 · 可以移动");
  return pinch ? tr("先分开拇指和食指，再移动光标瞄准目标。") : tr("先张掌，将光标移到起笔位置。");
}

export function HandwritingToolbarButton({ state, start, stop, disabled }: Pick<Input, "state" | "start" | "stop"> & { disabled: boolean }) {
  const on = state.status !== "off" && state.status !== "failed";
  return <button type="button" className={`board-handwriting-toggle${on ? " is-active" : ""}`} data-handwriting-controls=""
    disabled={disabled} aria-label={tr("隔空书写（试用）")} aria-pressed={on}
    title={disabled ? tr("暂停课程后可以使用隔空书写") : tr("隔空书写（试用）")}
    onClick={on ? stop : start}>
    <ScanLine size={17} /><span>{tr("隔空书写")}</span>
  </button>;
}

export function HandwritingControls(input: Input & { canResume: boolean }) {
  const { state, videoRef, overlayRef, cursorRef, collapsed, setCollapsed, start, pause, stop, canResume, gestureMode, setGestureMode, zoomBy } = input;
  const on = state.status !== "off";
  const pinch = gestureMode === "palm-pinch";
  const paused = state.status === "paused" || state.status === "failed";
  return <>
    <aside className="board-handwriting-controls" data-learning-board-occlusion="" data-handwriting-controls=""
      data-training={input.training ? "true" : undefined}
      aria-label={tr("隔空书写控制")} hidden={!on}>
      <header>
        <strong>{tr("隔空书写")}</strong>
        <span>{paused ? tr("已暂停") : tr("摄像头已开启")}</span>
        <button type="button" aria-label={collapsed ? tr("展开手势预览") : tr("收起手势预览")}
          data-air-command="preview" onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</button>
        <button type="button" data-air-command="stop" aria-label={tr("关闭隔空书写")} onClick={stop}><X size={16} /></button>
      </header>
      <div className="board-handwriting-body" hidden={collapsed || Boolean(input.training)}>
        <div className="board-handwriting-camera">
          <video ref={videoRef} autoPlay muted playsInline aria-label={tr("本机摄像头预览")} />
          <canvas ref={overlayRef} aria-label={tr("实时手部关键点与骨架")} />
        </div>
        <p>{pinch ? tr("移动手来瞄准，捏住拇指和食指操作，松开结束。先点工具，再书写或框选。") : tr("张掌找位置，松松合拢后移动整只手书写，再张掌停止。")}</p>
        <label>{tr("手势方案")}<select value={gestureMode} disabled={state.status === "active" || state.status === "starting"}
          onChange={event => setGestureMode(event.target.value as "grip" | "palm-pinch")}>
          <option value="palm-pinch">{tr("掌部定位与捏合（试用）")}</option>
          <option value="grip">{tr("松握拳（对比）")}</option>
        </select></label>
        <p className="board-handwriting-note">{tr("仅在本机识别，不会因开启手势而给老师发送画面。")}</p>
      </div>
      <HandwritingSetupControls input={input} />
      <div className="board-handwriting-state" role="status" data-state={state.status} data-phase={state.gesture?.phase ?? "none"}>
        {handwritingStatus(state, pinch)}
      </div>
      <footer><div className="board-handwriting-zoom">
        <button type="button" data-air-command="zoom-out" aria-label={tr("缩小白板")} onClick={() => zoomBy(1 / 1.2)}>−</button>
        <button type="button" data-air-command="zoom-in" aria-label={tr("放大白板")} onClick={() => zoomBy(1.2)}>＋</button>
      </div><button data-air-command="pause" type="button" onClick={paused ? start : pause} disabled={paused && !canResume}>
        {paused ? tr("继续隔空书写") : tr("暂停隔空书写")}
      </button></footer>
    </aside>
    <HandwritingPracticeOverlay input={input} />
    <div ref={cursorRef} className="board-handwriting-cursor" hidden aria-hidden="true"><i /></div>
  </>;
}

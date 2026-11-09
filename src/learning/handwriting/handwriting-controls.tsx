import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Hand, Minus, Pause, Play, Plus, Settings2, X } from "lucide-react";
import { tr } from "@/i18n";
import { HandwritingSetupControls } from "./handwriting-setup-controls";
import type { useHandwritingInput } from "./use-handwriting-input";
import "./handwriting-controls.css";

type Input = ReturnType<typeof useHandwritingInput>;
function handwritingStatus(state: Input["state"]): string {
  if (state.status === "failed") {
    if (state.error === "permission_denied") return tr("未获得摄像头权限");
    if (state.error === "camera_busy") return tr("摄像头正忙，请重试");
    if (state.error === "model_failed") return tr("手部识别模型加载失败");
    return tr("摄像头不可用");
  }
  if (state.status === "paused") return tr("已暂停");
  if (state.status === "starting") return tr("准备中…");
  if (state.gesture?.phase === "drawing") return tr("按住");
  if (state.gesture?.phase === "pending") return tr("捏合中");
  if (state.gesture?.phase === "holding") return tr("松开中");
  if (state.gesture?.phase === "blocked") return tr("悬停");
  if (state.gesture?.phase === "ready") return tr("移动");
  return state.gesture?.reading.valid ? tr("请松开手指") : tr("寻找手部");
}

export function HandwritingInputButton({ state, start, stop, disabled }: Pick<Input, "state" | "start" | "stop"> & { disabled: boolean }) {
  const on = state.status !== "off" && state.status !== "failed";
  const label = on ? tr("关闭手势") : tr("启用手势");
  return <button type="button" className={`learning-mode-button learning-gesture-toggle${on ? " is-active" : ""}`} data-handwriting-controls="" data-air-command="toggle-gestures"
    disabled={disabled && !on} aria-label={label} aria-pressed={on}
    title={disabled && !on ? tr("暂停课程后可以启用手势") : label}
    onClick={on ? stop : start}>
    <Hand size={16} /><span>{label}</span>
  </button>;
}

/** `children` adds optional tools (such as the finger-snap tidy-up) below the setup controls. */
export function HandwritingControls(input: Input & { canResume: boolean; children?: ReactNode }) {
  const { state, videoRef, overlayRef, cursorRef, collapsed, setCollapsed, start, pause, stop, canResume, gestureMode, setGestureMode, zoomBy } = input;
  const on = state.status !== "off";
  const paused = state.status === "paused" || state.status === "failed";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!settingsOpen) return;
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) setSettingsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation(); setSettingsOpen(false); settingsButton.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [settingsOpen]);
  if (!on && settingsOpen) setSettingsOpen(false);
  const beginSetup = (kind: "pinch" | "region") => {
    setSettingsOpen(false); input.beginSetup(kind);
  };
  return <>
    <aside ref={panel} className="board-handwriting-controls" data-learning-board-occlusion="" data-handwriting-controls=""
      data-state={state.status} aria-label={tr("手势控制")} hidden={!on}>
      <header>
        <span className="board-handwriting-mark" aria-hidden="true"><Hand size={17} /></span>
        <strong>{tr("手势")}</strong>
        <div className="board-handwriting-actions">
          <button ref={settingsButton} type="button" data-air-command="gesture-settings" aria-label={tr("手势设置")} title={tr("手势设置")}
            aria-haspopup="menu" aria-expanded={settingsOpen} aria-controls={menuId} onClick={() => setSettingsOpen(value => !value)}><Settings2 size={16} /></button>
          <button type="button" data-air-command="preview" aria-label={collapsed ? tr("展开手势预览") : tr("收起手势预览")}
            title={collapsed ? tr("展开手势预览") : tr("收起手势预览")} aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}><ChevronDown size={16} className={collapsed ? "" : "is-expanded"} /></button>
          <button type="button" data-air-command="stop" aria-label={tr("关闭手势")} title={tr("关闭手势")} onClick={stop}><X size={16} /></button>
        </div>
      </header>
      {settingsOpen ? <div ref={menu} id={menuId} role="menu" className="board-handwriting-settings" aria-label={tr("手势设置")}
        onKeyDown={event => {
          if (event.target instanceof HTMLSelectElement) return;
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            buttons[(index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
          }
        }}>
        <button type="button" role="menuitem" data-air-command="calibrate" disabled={state.status !== "active" || gestureMode !== "palm-pinch"} onClick={() => beginSetup("pinch")}>{tr("校准捏合")}</button>
        <button type="button" role="menuitem" data-air-command="movement-area" disabled={state.status !== "active"} onClick={() => beginSetup("region")}>{tr("设置活动范围")}</button>
        <button type="button" role="menuitem" data-air-command="reset-gesture" onClick={() => { input.resetPreferences(); setSettingsOpen(false); }}>{tr("恢复默认设置")}</button>
        <label>{tr("手势方案")}<select value={gestureMode} disabled={state.status === "active" || state.status === "starting"}
          onChange={event => setGestureMode(event.target.value as "grip" | "palm-pinch")}>
          <option value="palm-pinch">{tr("捏合")}</option><option value="grip">{tr("松握拳")}</option>
        </select></label>
      </div> : null}
      <div className="board-handwriting-body" hidden={collapsed}>
        <div className="board-handwriting-camera">
          <video ref={videoRef} autoPlay muted playsInline aria-label={tr("本机手势预览")} />
          <canvas ref={overlayRef} aria-label={tr("实时手部关键点与骨架")} />
          {paused ? <div className="board-handwriting-camera-idle" aria-hidden="true"><Hand size={28} /></div> : null}
        </div>
      </div>
      <HandwritingSetupControls input={input} />
      {input.children}
      <footer>
        <div className="board-handwriting-state" role="status" data-state={state.status} data-phase={state.gesture?.phase ?? "none"}>
          <i aria-hidden="true" />{handwritingStatus(state)}
        </div>
        <div className="board-handwriting-actions">
          <button type="button" data-air-command="zoom-out" aria-label={tr("缩小白板")} title={tr("缩小白板")} onClick={() => zoomBy(1 / 1.2)}><Minus size={15} /></button>
          <button type="button" data-air-command="zoom-in" aria-label={tr("放大白板")} title={tr("放大白板")} onClick={() => zoomBy(1.2)}><Plus size={15} /></button>
          <button type="button" data-air-command="pause" aria-label={paused ? tr("继续手势") : tr("暂停手势")} title={paused ? tr("继续手势") : tr("暂停手势")}
            onClick={paused ? start : pause} disabled={paused && !canResume}>{paused ? <Play size={15} /> : <Pause size={15} />}</button>
        </div>
      </footer>
    </aside>
    {createPortal(<div ref={cursorRef} className="board-handwriting-cursor" hidden aria-hidden="true"><i /></div>, document.body)}
  </>;
}

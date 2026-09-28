import { Activity, Bug, Layers, RotateCcw, Sparkles } from "lucide-react";
import { useDebugSettings } from "@/hooks/use-debug-settings";

interface ToggleSwitchProps {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
  testId?: string;
}

function ToggleSwitch({
  id,
  checked,
  disabled = false,
  onChange,
  label,
  testId,
}: ToggleSwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "bg-accent" : "bg-border-strong/60 dark:bg-border"
      }`}
    >
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function DeveloperTab() {
  const {
    settings,
    updateDebugSettings,
    resetDebugSettings,
    isJevDebuggerVisible,
    isTraceInspectorVisible,
  } = useDebugSettings();

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="glass-section p-5">
        <div className="flex items-start gap-3">
          <div className="workbench-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Bug size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text-strong">
              Developer Options / 开发者与调试选项
            </h2>
            <p className="mt-1 text-sm text-muted">
              控制全局调试模式、TypeSafe Jev System One 实时准入监控浮窗及白板实验性诊断工具。
            </p>
          </div>
        </div>
      </section>

      {/* Master Debug Mode Card */}
      <section className="glass-section p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-strong">
                调试模式 (Debug Mode)
              </span>
              <span
                className="workbench-status-pill text-xs"
                data-tone={settings.debugMode ? "accent" : "neutral"}
                data-testid="debug-mode-status-pill"
              >
                {settings.debugMode ? "已开启 · Active" : "已停用 · Inactive"}
              </span>
            </div>
            <p className="text-xs leading-5 text-muted">
              全站调试总开关。关闭时将隐藏白板上的所有调试浮层与测试探针；开启后可在下方按需启用各项具体调试工具。
            </p>
          </div>

          <div className="flex items-center gap-3">
            <ToggleSwitch
              id="master-debug-mode-switch"
              checked={settings.debugMode}
              onChange={(next) => updateDebugSettings({ debugMode: next })}
              label="调试模式 (Debug Mode)"
              testId="toggle-debug-mode"
            />
          </div>
        </div>
      </section>

      {/* Sub-features list */}
      <section className="glass-section p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-text-strong">
            调试功能清单 (Debug Features)
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            {settings.debugMode
              ? "调试模式已就绪，可针对各项功能单独启用或隐藏："
              : "调试模式当前处于停用状态。开启总开关后，以下配置将实时生效。"}
          </p>
        </div>

        <div className="divide-y divide-border/40">
          {/* Jev Admission Debugger */}
          <div className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 mt-0.5">
                <Sparkles size={16} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-strong">
                    TypeSafe Jev 准入监视浮窗
                  </span>
                  <span
                    className="workbench-status-pill text-[10px]"
                    data-tone={isJevDebuggerVisible ? "accent" : "neutral"}
                    data-testid="jev-debugger-status-pill"
                  >
                    {isJevDebuggerVisible ? "已在白板显示" : "已隐藏"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  在学习白板右下角显示 Jev System One 快速门禁决策（准入排课 / 静默拦截 / 追问）、时延置信度监控与真机快速注入测试工具。
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center">
              <ToggleSwitch
                id="jev-debugger-switch"
                checked={settings.showJevAdmissionDebugger}
                disabled={!settings.debugMode}
                onChange={(next) =>
                  updateDebugSettings({ showJevAdmissionDebugger: next })
                }
                label="TypeSafe Jev 准入监视浮窗"
                testId="toggle-jev-debugger"
              />
            </div>
          </div>

          {/* Learning Trace Inspector */}
          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 mt-0.5">
                <Activity size={16} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-strong">
                    白板学习链路追踪探针 (Learn Trace)
                  </span>
                  <span
                    className="workbench-status-pill text-[10px]"
                    data-tone={isTraceInspectorVisible ? "accent" : "neutral"}
                    data-testid="trace-inspector-status-pill"
                  >
                    {isTraceInspectorVisible ? "已在白板显示" : "已隐藏"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  在白板侧边记录提问、手写框选、LLM 课时生成全链路事件与关键时序数据。
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center">
              <ToggleSwitch
                id="trace-inspector-switch"
                checked={settings.showLearningTraceInspector}
                disabled={!settings.debugMode}
                onChange={(next) =>
                  updateDebugSettings({ showLearningTraceInspector: next })
                }
                label="学习链路追踪探针"
                testId="toggle-trace-inspector"
              />
            </div>
          </div>

          {/* Extensibility Slot Info */}
          <div className="flex items-start gap-3 py-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 mt-0.5">
              <Layers size={16} />
            </div>
            <div className="min-w-0">
              <span className="text-sm font-medium text-text-strong">
                预留调试扩展槽 (Extensible Debug Slots)
              </span>
              <p className="mt-1 text-xs text-muted">
                调试设置已采用统一的键值扩展模型。未来新增的实验性功能（如 ACS 多模态视觉诊断、弱网/丢包时延模拟、笔迹实时渲染 FPS 监控等）将在此无缝挂载。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Actions */}
      <section className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span>设置修改后通过内部事件总线实时生效，无需刷新页面。</span>
        <button
          type="button"
          data-testid="reset-debug-settings"
          onClick={resetDebugSettings}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium text-muted transition hover:border-accent hover:text-text active:scale-95"
        >
          <RotateCcw size={13} />
          重置调试选项
        </button>
      </section>
    </div>
  );
}

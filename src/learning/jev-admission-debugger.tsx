import { useEffect, useState, useSyncExternalStore } from "react";
import {
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import {
  evaluateAdmissionFastGate,
  getAdmissionEventHistory,
  clearAdmissionEventHistory,
  subscribeAdmissionEvents,
  getSystemOneStatus,
  type AdmissionEventRecord,
} from "./admission-fast-gate";

export function JevAdmissionDebugger() {
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{
    available: boolean;
    hasKey: boolean;
    keyPreview?: string;
    source: "grant" | "env" | "none";
  }>({
    available: false,
    hasKey: false,
    source: "none",
  });

  const events = useSyncExternalStore(
    subscribeAdmissionEvents,
    getAdmissionEventHistory,
    getAdmissionEventHistory,
  );

  const refreshStatus = async (fetchIfMissing = true) => {
    try {
      const current = await getSystemOneStatus({ fetchIfMissing });
      setStatus(current);
    } catch {
      setStatus({ available: false, hasKey: false, source: "none" });
    }
  };

  useEffect(() => {
    let cancelled = false;
    void getSystemOneStatus({ fetchIfMissing: false }).then(
      (current) => {
        if (!cancelled) setStatus(current);
      },
      () => {
        if (!cancelled) setStatus({ available: false, hasKey: false, source: "none" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const runQuickTest = async (sampleText: string) => {
    if (testing) return;
    setTesting(true);
    try {
      await evaluateAdmissionFastGate({
        text: sampleText,
        modality: "voice",
      });
    } finally {
      setTesting(false);
    }
  };

  const latestEvent = events[0] as AdmissionEventRecord | undefined;
  const ignoreCount = events.filter((e) => e.result.disposition === "ignore" && e.result.source !== "passthrough").length;
  const clarifyCount = events.filter((e) => e.result.disposition === "clarify" && e.result.source !== "passthrough").length;
  const lessonCount = events.filter((e) => e.result.disposition === "generate_lesson" && e.result.source === "jev_direct").length;
  const passthroughCount = events.filter((e) => e.result.source === "passthrough").length;

  return (
    <aside
      aria-label="TypeSafe Jev 准入网关监视器"
      className="fixed bottom-4 right-4 z-50 font-sans pointer-events-auto select-none"
    >
      {!open ? (
        /* Collapsed Floating Pill */
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-900/90 hover:bg-slate-800 text-slate-100 border border-emerald-500/30 shadow-lg shadow-black/40 backdrop-blur-md transition-all duration-200 active:scale-95 group text-xs cursor-pointer"
          title="点击展开 TypeSafe Jev 准入网关实时监视窗口"
        >
          <span className="relative flex h-2.5 w-2.5">
            {status.hasKey ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            )}
          </span>
          <span className="flex items-center gap-1 font-semibold tracking-wide text-emerald-400">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            Jev 准入
          </span>
          {latestEvent ? (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                latestEvent.result.source === "passthrough"
                  ? "bg-slate-800 text-slate-300 border border-slate-600"
                  : latestEvent.result.disposition === "ignore"
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                    : latestEvent.result.disposition === "clarify"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
              }`}
            >
              {latestEvent.result.source === "passthrough"
                ? "降级"
                : latestEvent.result.disposition === "ignore"
                  ? "拦截"
                  : latestEvent.result.disposition === "clarify"
                    ? "追问"
                    : "准入"}{" "}
              {latestEvent.result.latencyMs}ms
            </span>
          ) : (
            <span className="text-slate-400 text-[10px]">待机</span>
          )}
          <ChevronUp className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 transition-colors" />
        </button>
      ) : (
        /* Expanded Floating Window */
        <div className="flex flex-col w-[380px] max-w-[calc(100vw-32px)] max-h-[500px] rounded-2xl bg-slate-950/95 text-slate-100 border border-slate-700/80 shadow-2xl shadow-black/80 backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
          {/* Header */}
          <header className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900/80 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <strong className="text-xs font-semibold text-slate-200">
                TypeSafe Jev 准入监视
              </strong>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                  status.hasKey
                    ? "bg-emerald-950/80 text-emerald-400 border-emerald-500/40"
                    : "bg-amber-950/80 text-amber-400 border-amber-500/40"
                }`}
                title={status.hasKey ? `凭据就绪: ${status.keyPreview} (${status.source})` : "无凭据 (降级直通模式)"}
              >
                {status.hasKey ? `Key 就绪 (${status.source})` : "无凭据 (直通降级)"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void refreshStatus()}
                className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition-colors"
                title="刷新状态"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={clearAdmissionEventHistory}
                className="p-1 text-slate-400 hover:text-rose-300 rounded hover:bg-slate-800 transition-colors"
                title="清空记录"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition-colors"
                title="收起"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Warning Banner if No Key */}
          {!status.hasKey && (
            <div className="px-3 py-1.5 bg-amber-950/40 border-b border-amber-500/30 text-[10px] text-amber-300 leading-tight">
              ⚠️ 当前未检测到 Jev 凭据，输入将自动降级直通。本地调试请配置 .env.local。
            </div>
          )}

          {/* Quick Stats Bar */}
          <div className="grid grid-cols-5 gap-0.5 px-2 py-1.5 bg-slate-900/40 border-b border-slate-800/60 text-[10px] text-slate-300 text-center font-mono">
            <div>总计: <span className="font-semibold text-slate-100">{events.length}</span></div>
            <div className="text-rose-400">拦截: <span className="font-semibold">{ignoreCount}</span></div>
            <div className="text-amber-400">追问: <span className="font-semibold">{clarifyCount}</span></div>
            <div className="text-emerald-400">准入: <span className="font-semibold">{lessonCount}</span></div>
            <div className="text-slate-400">降级: <span className="font-semibold">{passthroughCount}</span></div>
          </div>

          {/* Quick Manual Test Bar */}
          <div className="px-3 py-2 bg-slate-900/20 border-b border-slate-800/60">
            <div className="flex items-center gap-1.5 mb-1.5 text-[10px] text-slate-400 font-medium">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>快速真机测试 (点击立即验证 Jev 返回):</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={testing}
                onClick={() => void runQuickTest("呃...那个")}
                className="flex-1 py-1 px-2 rounded bg-slate-800/80 hover:bg-slate-700 text-rose-300 border border-rose-500/20 text-[10px] font-medium transition-colors disabled:opacity-50"
              >
                测试语气词
              </button>
              <button
                type="button"
                disabled={testing}
                onClick={() => void runQuickTest("讲讲这个")}
                className="flex-1 py-1 px-2 rounded bg-slate-800/80 hover:bg-slate-700 text-amber-300 border border-amber-500/20 text-[10px] font-medium transition-colors disabled:opacity-50"
              >
                测试残缺提问
              </button>
              <button
                type="button"
                disabled={testing}
                onClick={() => void runQuickTest("勾股定理怎么证明")}
                className="flex-1 py-1 px-2 rounded bg-slate-800/80 hover:bg-slate-700 text-emerald-300 border border-emerald-500/20 text-[10px] font-medium transition-colors disabled:opacity-50"
              >
                测试正常课程
              </button>
            </div>
          </div>

          {/* Event Stream */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[300px] text-xs">
            {events.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                <Zap className="w-6 h-6 text-slate-600 animate-pulse" />
                <p>等待语音或键盘输入...</p>
                <p className="text-[11px] text-slate-600">
                  你可以对着麦克风说话、打字提问，或点击上方按钮进行快速测试
                </p>
              </div>
            ) : (
              events.map((event) => {
                const timeStr = new Date(event.timestampEpochMs).toLocaleTimeString();
                const isPassthrough = event.result.source === "passthrough";
                const isIgnore = event.result.disposition === "ignore";
                const isClarify = event.result.disposition === "clarify";

                return (
                  <article
                    key={event.id}
                    className={`p-2.5 rounded-xl border transition-all ${
                      isPassthrough
                        ? "bg-slate-900/60 border-slate-800"
                        : isIgnore
                          ? "bg-rose-950/20 border-rose-500/30"
                          : isClarify
                            ? "bg-amber-950/20 border-amber-500/30"
                            : "bg-emerald-950/20 border-emerald-500/30"
                    }`}
                  >
                    {/* Top Status Row */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isPassthrough
                              ? "bg-slate-800 text-slate-300 border border-slate-600"
                              : isIgnore
                                ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                                : isClarify
                                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                                  : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          }`}
                        >
                          {isPassthrough
                            ? "🔄 降级放行"
                            : isIgnore
                              ? "🚫 静默拦截"
                              : isClarify
                                ? "❓ 引导追问"
                                : "✅ 准入排课"}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {event.input.modality === "voice" ? "🎙️ 语音" : "⌨️ 文字"}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {timeStr}
                      </span>
                    </div>

                    {/* Content Text */}
                    <div className="text-slate-200 text-xs font-medium mb-1.5 bg-slate-900/60 px-2 py-1 rounded border border-slate-800">
                      “{event.input.text}”
                    </div>

                    {/* Metrics Row */}
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-400">
                      <span className="text-slate-300">
                        时延: <strong className="text-slate-100">{event.result.latencyMs}ms</strong>
                      </span>
                      <span>
                        置信度:{" "}
                        <strong className="text-slate-100">
                          {isPassthrough ? "--" : `${Math.round(event.result.confidence * 100)}%`}
                        </strong>
                      </span>
                      {event.result.subject && (
                        <span>学科: {event.result.subject}</span>
                      )}
                      <span className="text-slate-500">
                        ({event.result.source})
                      </span>
                    </div>

                    {/* Reason / Prompt if clarify */}
                    {event.result.reason && (
                      <div className="mt-1 text-[10px] text-slate-400 italic">
                        {event.result.reason}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

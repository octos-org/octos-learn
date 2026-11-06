import { useState } from "react";
import { FlaskConical, ScanLine } from "lucide-react";
import { useExperimentalFeatures } from "@/hooks/use-experimental-features";
import { tr } from "@/i18n";
import { useLocale } from "@/i18n/use-locale";

export function ExperimentsTab() {
  useLocale();
  const { airWritingEnabled, setAirWritingEnabled } = useExperimentalFeatures();
  const [saveFailed, setSaveFailed] = useState(false);

  return (
    <div className="space-y-6">
      <section className="glass-section p-5">
        <div className="flex items-start gap-3">
          <div className="workbench-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <FlaskConical size={20} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text-strong">{tr("实验功能")}</h2>
            <p className="mt-1 text-sm text-muted">{tr("提前试用仍在完善的新功能。开关仅保存在当前浏览器，开启后立即生效。")}</p>
          </div>
        </div>
      </section>
      <section className="glass-section p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <ScanLine size={20} className="mt-0.5 shrink-0 text-accent" />
            <div>
              <h3 id="air-writing-label" className="text-sm font-semibold text-text-strong">{tr("隔空书写")}</h3>
              <p id="air-writing-description" className="mt-1 text-sm leading-6 text-muted">
                {tr("用摄像头识别手势，在学习白板上写字、画图。开启后，白板工具栏会显示“隔空书写”入口。")}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted">
                {tr("点击白板上的入口后才会启动摄像头；手势识别在本机完成，不会因此给老师发送画面。目前仅支持学习白板，暂不支持讲课录制。")}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-labelledby="air-writing-label"
            aria-describedby="air-writing-description"
            aria-checked={airWritingEnabled}
            onClick={() => setSaveFailed(!setAirWritingEnabled(!airWritingEnabled))}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${airWritingEnabled ? "bg-accent" : "bg-border-strong/60 dark:bg-border"}`}
          >
            <span aria-hidden="true" className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform ${airWritingEnabled ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
        {saveFailed && <p role="alert" className="mt-3 text-sm text-red-500">{tr("无法保存开关，请检查浏览器是否允许本地存储后重试。")}</p>}
      </section>
    </div>
  );
}

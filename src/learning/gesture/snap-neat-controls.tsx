import { tr } from "@/i18n";
import type { useSnapNeat } from "./use-snap-neat";
import "./snap-neat.css";

export function SnapNeatControls({ snap }: { snap: ReturnType<typeof useSnapNeat> }) {
  return <section className="snap-neat-controls" aria-label={tr("响指整理彩蛋")}>
    <div className="snap-neat-heading"><strong>{tr("✦ 响指整理")}</strong>
      <button type="button" aria-pressed={snap.enabled} onClick={snap.enabled ? snap.stop : () => void snap.start()}>
        {snap.enabled ? tr("关闭彩蛋") : tr("开启彩蛋")}
      </button>
    </div>
    <video ref={snap.videoRef} muted playsInline hidden={!snap.armed} aria-label={tr("响指手型预览")} />
    <p role="status" data-ready={snap.handReady}>{snap.notice || snap.status}</p>
    {!snap.enabled && <small>{tr("开启麦克风后，手型和声音同时命中才会整理。只识别选中的公式，使用你的模型配置。")}</small>}
  </section>;
}

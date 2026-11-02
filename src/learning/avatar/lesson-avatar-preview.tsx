import { useCallback, useState } from "react";
import { tr } from "@/i18n";
import type { AudioPlaybackClock } from "@/home/voice/audio-playback";
import { AvatarStage } from "./avatar-stage";
import { lipSyncFrame, type LipSyncTrack } from "./lip-sync";
import "./lesson-avatar-preview.css";

const ignoreMetrics = () => undefined;

/** Shares the existing lesson audio; no second player, capture or synthesis. */
export default function LessonAvatarPreview({ track, clock, playing, preparing }: {
  track: LipSyncTrack | null;
  clock: AudioPlaybackClock | null;
  playing: boolean;
  preparing: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const onGraphicsError = useCallback(() => setFailed(true), []);
  const frame = useCallback(() => {
    const time = playing ? clock?.read() : null;
    // An unrelated/live/native narration without an authoritative clock never
    // borrows another clip's mouth motion or guesses from wall-clock time.
    return lipSyncFrame(track, time?.positionMs ?? 0, Boolean(time));
  }, [track, clock, playing]);
  return <aside className="teach-watch-avatar" aria-label={tr("课程动态头像预览")}>
    <div className="teach-watch-avatar-stage">
      {!failed && <AvatarStage frame={frame} fpsLimit={30} active={playing && Boolean(track && clock)} onMetrics={ignoreMetrics} onError={onGraphicsError} />}
      <span>{tr("工程测试角色")}</span>
    </div>
    <p role="status">{failed ? tr("这台设备暂时无法显示动态头像，声音和白板仍可播放。")
      : preparing ? tr("正在准备配音…") : !playing ? tr("播放课程时，头像会跟随配音。")
        : !track ? tr("这张卡片没有配音嘴型。") : clock ? tr("正在跟随课程配音")
          : tr("当前播放方式暂不支持头像同步，声音和白板仍可播放。")}</p>
    <small>{tr("当前使用工程测试角色和基础嘴型，正式星狐与精细发音仍待完善。")}</small>
  </aside>;
}

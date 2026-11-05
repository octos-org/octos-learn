import { useCallback, useState } from "react";
import { tr } from "@/i18n";
import type { AudioPlaybackClock } from "@/home/voice/audio-playback";
import { IllustratedAvatarStage } from "./illustrated-avatar-stage";
import { lipSyncFrame, type LipSyncTrack } from "./lip-sync";
import { performanceFrame, presenterFrame, type LessonPerformanceTrack } from "./lesson-performance";
import { paintedCharacter, type PaintedCharacterId } from "./painted-characters";
import "./lesson-avatar-preview.css";

const ignoreMetrics = () => undefined;

/**
 * The lesson's presenter, animated by the package's final-audio mouth motion.
 * Shares the existing lesson audio: no second player, capture or synthesis.
 * The mouth follows the narration's own media clock; nothing is guessed from
 * wall-clock time. Decorative ear and hair motion stays off here until its
 * naturalness is approved in the avatar lab.
 */
export default function LessonAvatarPreview({ characterId, track, performance = null, clock, playing, preparing, mode = "preview", placement = "panel" }: {
  characterId: PaintedCharacterId;
  track: LipSyncTrack | null;
  /** The learner's expression and head, re-timed onto this clip; mouth motion alone without it. */
  performance?: LessonPerformanceTrack | null;
  clock: AudioPlaybackClock | null;
  playing: boolean;
  preparing: boolean;
  /** "preview" for the author's "Watch my lesson", "player" for a saved lesson. */
  mode?: "preview" | "player";
  /**
   * "board": in the whiteboard's bottom-right corner, like a teacher beside
   * the board, with no frame; the board keeps its content clear of it.
   */
  placement?: "panel" | "board";
}) {
  const [failed, setFailed] = useState(false);
  const onGraphicsError = useCallback(() => setFailed(true), []);
  const frame = useCallback(() => {
    const time = playing ? clock?.read() : null;
    // An unrelated/live/native narration without an authoritative clock never
    // borrows another clip's mouth motion or guesses from wall-clock time.
    const position = time?.positionMs ?? 0, available = Boolean(time);
    return presenterFrame(performanceFrame(performance, position, available), lipSyncFrame(track, position, available));
  }, [track, performance, clock, playing]);
  const character = paintedCharacter(characterId);
  const status = failed ? tr("这台设备暂时无法显示动态头像，声音和白板仍可播放。")
    : preparing ? tr("正在准备配音…") : !playing ? tr("播放课程时，头像会跟随配音。")
      : !track ? tr("这张卡片没有配音嘴型。") : clock ? tr("正在跟随课程配音")
        : tr("当前播放方式暂不支持头像同步，声音和白板仍可播放。");
  if (placement === "board") {
    if (failed) return null;
    return <aside className="teach-board-presenter" data-learning-board-occlusion="" aria-label={mode === "player" ? tr("讲课的形象") : tr("课程动态头像预览")}>
      <IllustratedAvatarStage key={character.id} characterId={character.id} frame={frame} fpsLimit={30} transparentBackground
        active={playing && Boolean(track && clock)} onMetrics={ignoreMetrics} onError={onGraphicsError} />
      <p role="status" className="teach-visually-hidden">{status}</p>
    </aside>;
  }
  return <aside className={`teach-watch-avatar teach-watch-avatar-${mode}`} aria-label={mode === "player" ? tr("讲课的形象") : tr("课程动态头像预览")}>
    <div className="teach-watch-avatar-stage">
      {!failed && <IllustratedAvatarStage key={character.id} characterId={character.id} frame={frame} fpsLimit={30}
        active={playing && Boolean(track && clock)} onMetrics={ignoreMetrics} onError={onGraphicsError} />}
      <span>{character.name()}</span>
    </div>
    <p role="status" className={mode === "player" && !failed ? "teach-visually-hidden" : undefined}>{status}</p>
    {mode === "preview" && <small>{performance ? tr("嘴型跟随最终配音；表情和转头来自你录这张卡片时的摄像头动作，已按配音重新对齐。")
      : tr("形象只跟随最终配音的基础张嘴，精细发音嘴型仍在完善。")}</small>}
  </aside>;
}

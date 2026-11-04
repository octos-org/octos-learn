import { useCallback, useState } from "react";

import { tr } from "@/i18n";
import type { FaceFrame } from "../avatar/face-frame";
import { IllustratedAvatarStage } from "../avatar/illustrated-avatar-stage";
import type { PaintedCharacterId } from "../avatar/painted-characters";
import { paintedCharacter } from "../avatar/painted-characters";
import type { TakeCameraState } from "./use-take-camera";

/**
 * The learner's character, following their face live while "the camera moves
 * my character" is on, so they see it working before and while they record.
 * Only the character is drawn; the camera image is never shown.
 */
export default function StudioAvatar({ characterId, frame, state, onOpen }: {
  characterId: PaintedCharacterId;
  frame: (now: number) => FaceFrame;
  state: TakeCameraState;
  /** Turns the camera on (again, after it failed). */
  onOpen: () => void;
}) {
  const [graphicsFailed, setGraphicsFailed] = useState(false);
  const onGraphicsError = useCallback(() => setGraphicsFailed(true), []);
  const character = paintedCharacter(characterId);
  const live = state === "starting" || state === "tracking" || state === "lost";
  return (
    <section className="teach-studio-avatar" aria-label={tr("你的形象")}>
      <div className="teach-studio-avatar-stage">
        {live && !graphicsFailed && <IllustratedAvatarStage key={character.id} characterId={character.id} frame={frame} fpsLimit={30}
          active={state === "tracking" || state === "lost"} onError={onGraphicsError} />}
        {!live && (
          <button type="button" className="teach-secondary" onClick={onOpen}>
            {state === "failed" ? tr("再试一次") : tr("打开摄像头")}
          </button>
        )}
        <span>{character.name()}</span>
      </div>
      <p role="status" className="teach-camera-status" data-state={state}>{statusText(state, graphicsFailed)}</p>
    </section>
  );
}

function statusText(state: TakeCameraState, graphicsFailed: boolean): string {
  if (graphicsFailed) return tr("这台设备暂时画不出形象。摄像头动作仍会记下来，看课时形象会跟着动。");
  return state === "tracking" ? tr("摄像头：形象正在跟着你")
    : state === "lost" ? tr("摄像头：看不到你的脸，形象会先停在原来的样子")
      : state === "failed" ? tr("摄像头不能用，这次形象只跟着配音动嘴。")
        : state === "starting" ? tr("摄像头：正在准备…")
          : tr("摄像头还没打开。打开后，你的形象会跟着你的表情和转头动。");
}

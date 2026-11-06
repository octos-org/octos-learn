import { tr } from "@/i18n";
import type { useHandwritingInput } from "./use-handwriting-input";

type Input = ReturnType<typeof useHandwritingInput>;
function setupInstruction(stage: NonNullable<Input["setup"]>["stage"]) {
  switch (stage) {
    case "open": return tr("放松手掌，分开拇指和食指，保持片刻。");
    case "open-ready": return tr("张开样本已记录。准备好后点击下一步，再自然捏合。");
    case "closed": return tr("轻捏拇指和食指，保持片刻，其他手指自然放松。");
    case "pinch-ready": return tr("开合区分清晰，可以保存个人捏合设置。");
    case "top-left": return tr("把掌心移到你舒适活动范围的左上角，保持片刻。");
    case "corner-ready": return tr("左上角已记录。点击下一步，再移动到舒适范围的右下角。");
    case "bottom-right": return tr("把掌心移到舒适活动范围的右下角，保持片刻。");
    case "region-ready": return tr("活动范围已记录，可以保存。较小的活动范围会让光标移动更快。");
    case "failed": return tr("样本不够稳定或区分不清。请调整光线、手的位置或活动范围后重试。");
  }
}
export function HandwritingSetupControls({ input }: { input: Input }) {
  const active = input.state.status === "active";
  if (input.setup) {
    const stage = input.setup.stage;
    const next = stage === "open-ready" || stage === "corner-ready";
    return <section className="board-handwriting-setup">
      <p role="status">{setupInstruction(stage)}</p>
      <progress value={input.setup.progress} max={100} aria-label={tr("采样进度")} />
      {next || input.setup.result ? <button type="button" onClick={input.nextSetup}>{next ? tr("下一步") : tr("保存设置")}</button> : null}
      <button type="button" onClick={input.cancelSetup}>{tr("取消设置")}</button>
    </section>;
  }
  if (input.training) {
    const stage = input.training.stage;
    const instruction = stage === "aim" ? tr("松开手指，把光标移进左边的圆。")
      : stage === "pinch" ? tr("在圆内轻捏拇指和食指。")
      : stage === "draw" ? tr("保持捏合，移动手画一段短线，再松开。")
      : stage === "move" ? tr("保持松开，把光标移进右边的圆。")
      : tr("练习完成。现在可以选择画笔、框选或操作课程控件。");
    return <section className="board-handwriting-setup">
      <p role="status">{instruction}</p>
      <p>{tr("练习轨迹只用于引导。")}</p>
      <button type="button" onClick={input.finishPractice}>{stage === "done" ? tr("开始使用") : tr("跳过练习")}</button>
    </section>;
  }
  return <section className="board-handwriting-setup">
    {!input.preferences.tutorialDone && active ? <p>{tr("第一次使用？可以先练习瞄准、落笔和抬笔，也可以跳过。")}</p> : null}
    <div className="board-handwriting-setup-actions">
      <button type="button" data-air-command="practice" disabled={!active} onClick={input.beginPractice}>{tr("手势练习")}</button>
      {!input.preferences.tutorialDone && active ? <button type="button" data-air-command="skip-practice" onClick={input.finishPractice}>{tr("跳过练习")}</button> : null}
      <button type="button" disabled={!active || input.gestureMode !== "palm-pinch"} onClick={() => input.beginSetup("pinch")}>{tr("校准捏合")}</button>
      <button type="button" disabled={!active} onClick={() => input.beginSetup("region")}>{tr("设置活动范围")}</button>
      <button type="button" onClick={input.resetPreferences}>{tr("恢复默认设置")}</button>
    </div>
    {!input.saved ? <p role="status">{tr("设置已在本次使用中生效，浏览器未能保存。")}</p> : null}
  </section>;
}
export function HandwritingPracticeOverlay({ input }: { input: Input }) {
  const training = input.training;
  if (!training) return null;
  return <svg className="board-handwriting-practice" aria-hidden="true">
    <circle cx={training.first.x} cy={training.first.y} r={32} className={training.stage === "move" || training.stage === "done" ? "" : "is-active"} />
    <circle cx={training.second.x} cy={training.second.y} r={32} className={training.stage === "move" ? "is-active" : ""} />
    <polyline points={training.points.map(p => `${p.x},${p.y}`).join(" ")} />
  </svg>;
}

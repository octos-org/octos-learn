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
    case "region-ready": return tr("活动范围已记录，可以保存。悬停仍能到达整个白板，落笔时会限制灵敏度。");
    case "failed": return tr("样本不够稳定或区分不清。请调整光线、手的位置或活动范围后重试。");
  }
}
export function HandwritingSetupControls({ input }: { input: Input }) {
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
  return !input.saved ? <p className="board-handwriting-save-error" role="status">{tr("设置已在本次使用中生效，浏览器未能保存。")}</p> : null;
}

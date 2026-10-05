const messages: Record<string, string> = {
  LESSON_MODEL_NOT_CONFIGURED: "请先在设置中选择课程模型",
  LESSON_MODEL_UNSUPPORTED: "当前模型平台暂不支持生成课程，请在设置中选择 Gemini",
  LESSON_CREDENTIAL_MISSING: "请在设置中填写你的 Gemini API Key",
  GEMINI_AUTH_FAILED: "Gemini API Key 无效，或没有访问该模型的权限",
  GEMINI_MODEL_NOT_FOUND: "所选模型不存在或你的 Key 无权使用，请在设置中更换",
  GEMINI_RATE_LIMITED: "你的 Gemini 额度已用尽或请求过快，请稍后再试",
};

export function lessonModelErrorMessage(code?: string): string | undefined {
  return code && Object.hasOwn(messages, code) ? messages[code] : undefined;
}

/** Read the plugin's structured metadata; never infer a code from prose. */
export function lessonModelErrorCode(result: unknown): string | undefined {
  if (!result || typeof result !== "object" || Array.isArray(result)) return;
  const metadata = (result as Record<string, unknown>).structured_metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return;
  const code = (metadata as Record<string, unknown>).error_code;
  return typeof code === "string" && lessonModelErrorMessage(code) ? code : undefined;
}

export class LessonModelError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(lessonModelErrorMessage(code) ?? "课程生成失败，请重试。");
    this.code = code;
  }
}

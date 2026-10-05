import { expect, it } from "vitest";
import { lessonModelErrorCode, lessonModelErrorMessage } from "./lesson-model-errors";

it.each([
  ["LESSON_MODEL_NOT_CONFIGURED", "请先在设置中选择课程模型"],
  ["LESSON_MODEL_UNSUPPORTED", "当前模型平台暂不支持生成课程，请在设置中选择 Gemini"],
  ["LESSON_CREDENTIAL_MISSING", "请在设置中填写你的 Gemini API Key"],
  ["GEMINI_AUTH_FAILED", "Gemini API Key 无效，或没有访问该模型的权限"],
  ["GEMINI_MODEL_NOT_FOUND", "所选模型不存在或你的 Key 无权使用，请在设置中更换"],
  ["GEMINI_RATE_LIMITED", "你的 Gemini 额度已用尽或请求过快，请稍后再试"],
])("maps the structured %s code", (code, message) => {
  expect(lessonModelErrorMessage(lessonModelErrorCode({ structured_metadata: { error_code: code } }))).toBe(message);
});

it("never extracts model error codes from unstructured output", () => {
  expect(lessonModelErrorCode({ output: "GEMINI_AUTH_FAILED" })).toBeUndefined();
  expect(lessonModelErrorCode({ structured_metadata: { error_code: "unknown" } })).toBeUndefined();
  expect(lessonModelErrorMessage("toString")).toBeUndefined();
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LlmTab } from "./llm-tab";
import { normalizeProfile } from "./settings-api";

const mocks = vi.hoisted(() => ({ save: vi.fn(), models: vi.fn(async () => []) }));
vi.mock("./settings-api", async (original) => ({
  ...await original<typeof import("./settings-api")>(),
  updateMyProfileConfig: mocks.save,
  fetchProviderModels: mocks.models,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("keeps an unsupported saved selection and explains course support", async () => {
  const profile = normalizeProfile({ id: "p", config: { llm: { primary: { family_id: "openai", model_id: "gpt-5" } } } });
  render(<LlmTab profile={profile} onProfileUpdated={vi.fn()} />);
  expect(screen.getByText("暂不支持课程生成")).toBeTruthy();
  expect(screen.getByDisplayValue("GPT-5")).toBeTruthy();
  await waitFor(() => expect(mocks.models).toHaveBeenCalled());
  expect(mocks.save).not.toHaveBeenCalled();
});

it("recommends the tuned model without replacing an older saved Gemini model", async () => {
  const profile = normalizeProfile({ id: "p", config: { llm: { primary: { family_id: "google", model_id: "gemini-3-flash-preview" } } } });
  mocks.save.mockImplementation(async (p, config) => ({ ...p, config: { ...p.config, ...config } }));
  render(<LlmTab profile={profile} onProfileUpdated={vi.fn()} />);
  expect(screen.getByText("可用于课程生成")).toBeTruthy();
  expect(screen.getByText("课程已针对 Gemini 3.6 Flash 调优，推荐选择该模型")).toBeTruthy();
  const selector = screen.getByDisplayValue("Gemini 3 Flash");
  expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.change(selector, { target: { value: "gemini-3.6-flash" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  expect(await screen.findByText("已保存，下一次生成课程时生效")).toBeTruthy();
  expect(mocks.save.mock.calls[0][1].llm.primary.model_id).toBe("gemini-3.6-flash");
});

for (const [runtime_disposition, message] of [
  ["reloaded", "已生效，下一次生成使用新模型"],
  ["restart_required", "已保存，服务重启后生效"],
  ["persisted_but_not_live", "已保存，模型暂未就绪，请检查 Key 后重试"],
] as const) {
  it(`shows the server runtime state after save: ${runtime_disposition}`, async () => {
    const profile = normalizeProfile({ id: "p", config: { llm: { primary: { family_id: "google", model_id: "gemini-3-flash-preview" } } } });
    mocks.save.mockImplementation(async (p, config) => normalizeProfile({ ...p, config: { ...p.config, ...config }, runtime_disposition, config_revision: "revision" }));
    render(<LlmTab profile={profile} onProfileUpdated={vi.fn()} />);
    fireEvent.change(screen.getByDisplayValue("Gemini 3 Flash"), { target: { value: "gemini-3.6-flash" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByText(message)).toBeTruthy();
  });
}

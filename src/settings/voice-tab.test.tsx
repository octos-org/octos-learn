import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
const state = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), remove: vi.fn(), synthesize: vi.fn() }));
vi.mock("@/byok/services", () => ({
  listClientServices: state.list, saveClientService: state.save, deleteClientService: state.remove,
  prepareClientServices: vi.fn(async () => {}), getService: () => undefined,
  getServiceStatus: () => ({ state: "unconfigured", detail: "此设备尚未验证" }), subscribeServices: () => () => {},
}));
vi.mock("@/byok/providers", () => ({ synthesizeDirect: state.synthesize, validateService: vi.fn(), directJson: vi.fn(), serviceFailure: (_id: string, error: Error) => error, transcribeDirect: vi.fn() }));
vi.mock("@/home/voice/use-voice-capture", () => ({ useVoiceCapture: () => ({ start: vi.fn(), stop: vi.fn(), capturing: false, error: null }) }));
vi.mock("@/home/voice/audio-playback", () => ({ unlockAudio: vi.fn(), playAudioBlob: vi.fn(async () => true) }));
import { VoiceTab } from "./voice-tab";
import type { Profile } from "./settings-api";
beforeEach(() => { state.list.mockResolvedValue({ profile_id: "alice", services: {} }); state.save.mockReset(); state.save.mockResolvedValue(undefined); state.synthesize.mockReset(); });
afterEach(cleanup);
const show = () => render(<VoiceTab profile={{ id: "alice" } as Profile} onProfileUpdated={vi.fn()} />);
describe("BYOK voice settings", () => {
  it("shows independent optional services and no platform allowance or auto-paid test", async () => {
    show(); await screen.findByRole("region", { name: "听讲解" });
    expect(screen.getByRole("region", { name: "语音输入" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "输入预判（Jev，可选）" })).toBeTruthy();
    expect(screen.queryByText("平台语音额度")).toBeNull(); expect(state.synthesize).not.toHaveBeenCalled();
  });
  it("saves only the selected capability without implicitly testing or collecting microphone permission", async () => {
    show(); const tts = await screen.findByRole("region", { name: "听讲解" });
    fireEvent.change(within(tts).getByLabelText("API Key"), { target: { value: "own-test-key" } });
    fireEvent.click(within(tts).getByRole("button", { name: "保存配置" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledWith("tts", expect.objectContaining({ provider: "azure", key: "own-test-key" }), undefined));
    expect(state.synthesize).not.toHaveBeenCalled();
  });
  it("keeps an unsaved key draft after a failed direct synthesis test", async () => {
    state.synthesize.mockRejectedValue(new Error("资源无权限")); show();
    const tts = await screen.findByRole("region", { name: "听讲解" });
    fireEvent.change(within(tts).getByLabelText("API Key"), { target: { value: "own-test-key" } });
    fireEvent.click(within(tts).getByRole("button", { name: "测试草稿并试听" }));
    await screen.findByText("资源无权限");
    expect(within(tts).getByLabelText("API Key")).toHaveProperty("value", "own-test-key");
    expect(state.save).not.toHaveBeenCalled();
  });
});

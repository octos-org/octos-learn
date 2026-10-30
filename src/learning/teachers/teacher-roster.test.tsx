import { tr } from "@/i18n";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

const speech = vi.hoisted(() => ({ calls: [] as string[], synthesize: vi.fn() }));
vi.mock("@/byok/services", async (original) => ({
  ...(await original<object>()),
  prepareClientServices: vi.fn(async () => { speech.calls.push("prepare"); }),
}));
vi.mock("@/byok/providers", async (original) => ({
  ...(await original<object>()),
  synthesizeTeacherSample: speech.synthesize,
}));

import { ServiceError } from "@/byok/providers";
import { TeacherRoster } from "./teacher-roster";

afterEach(() => { cleanup(); speech.calls.length = 0; speech.synthesize.mockReset(); vi.unstubAllGlobals(); localStorage.clear(); });

it("introduces each teacher with a portrait and their words, chooses the teacher, and explains how to hear them", async () => {
  speech.synthesize.mockRejectedValue(new ServiceError("unconfigured", "语音服务尚未配置"));
  render(<MemoryRouter><TeacherRoster /></MemoryRouter>);
  for (const name of ["阿澜", "窦鸢", "苏绯"]) expect(screen.getByRole("heading", { level: 2, name })).toBeTruthy();
  expect(screen.getByRole("list", { name: "苏绯的话" }).textContent).toContain(tr("这个数，从哪里来？"));
  expect(screen.getByText(new RegExp(tr("她腰上挂着一只洗得发白的旧布口袋，里面好像什么都掏得出来。她有一条规矩：一次只掏一样。").replace(/[.*+?^${}()|[]\\]/g, "\\$&"), ""))).toBeTruthy();
  expect(screen.queryByText(/读一段小说/)).toBeNull();
  fireEvent.click(screen.getByTestId("teacher-sufei"));
  expect(screen.getByTestId("teacher-sufei").textContent).toContain(tr("正在陪你上课"));
  expect(screen.getByTestId("teacher-alan").textContent).toContain("请阿澜上课");
  expect(screen.queryByRole("button", { name: /听听我的声音/ })).toBeNull();
  // Without the learner's own speech service, the roster says where to set it up.
  fireEvent.click(screen.getByRole("button", { name: "听阿澜说：这是一个值得收藏的问题。" }));
  expect(await screen.findByText(new RegExp(tr("在“设置”里配置自己的语音服务后，就能听到老师的声音。").replace(/[.*+?^${}()|[]\\]/g, "\\$&"), ""))).toBeTruthy();
});

it("reads each quote in the teacher's voice, after loading the learner's saved speech service", async () => {
  speech.synthesize.mockImplementation(async () => { speech.calls.push("synthesize"); return new Blob(["mp3"], { type: "audio/mpeg" }); });
  URL.createObjectURL = vi.fn(() => "blob:voice");
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal("Audio", class { onended: (() => void) | null = null; pause() {} async play() {} });
  render(<MemoryRouter><TeacherRoster /></MemoryRouter>);
  // Every quote has its own speaker.
  expect(screen.getAllByRole("button", { name: /^听(阿澜|窦鸢|苏绯)说：/ })).toHaveLength(12);
  fireEvent.click(screen.getByRole("button", { name: "听苏绯说：这个数，从哪里来？" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "停止播放：这个数，从哪里来？" })).toBeTruthy());
  expect(speech.calls).toEqual(["prepare", "synthesize"]);
  expect(speech.synthesize).toHaveBeenCalledWith("这个数，从哪里来？", expect.objectContaining({ "seed-tts-2.0": expect.anything() }));
  expect(screen.queryByText(new RegExp(tr("在“设置”里配置自己的语音服务后，就能听到老师的声音。").replace(/[.*+?^${}()|[]\\]/g, "\\$&"), ""))).toBeNull();
  // A second tap on the playing quote stops it.
  fireEvent.click(screen.getByRole("button", { name: "停止播放：这个数，从哪里来？" }));
  expect(screen.getByRole("button", { name: "听苏绯说：这个数，从哪里来？" })).toBeTruthy();
});

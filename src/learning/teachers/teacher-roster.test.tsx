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
  expect(screen.getByRole("list", { name: "苏绯的话" }).textContent).toContain("这个数，从哪里来？");
  expect(screen.getByText(/一次只掏一样/)).toBeTruthy();
  expect(screen.queryByText(/读一段小说/)).toBeNull();
  fireEvent.click(screen.getByTestId("teacher-sufei"));
  expect(screen.getByTestId("teacher-sufei").textContent).toContain("正在陪你上课");
  expect(screen.getByTestId("teacher-alan").textContent).toContain("请阿澜上课");
  // Without the learner's own speech service, the roster says where to set it up.
  fireEvent.click(screen.getAllByRole("button", { name: /听听我的声音/ })[0]);
  expect(await screen.findByText(/配置自己的语音服务后，就能听到老师的声音/)).toBeTruthy();
});

it("loads the learner's saved speech service before speaking, even when the whiteboard was never opened", async () => {
  speech.synthesize.mockImplementation(async () => { speech.calls.push("synthesize"); return new Blob(["mp3"], { type: "audio/mpeg" }); });
  URL.createObjectURL = vi.fn(() => "blob:voice");
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal("Audio", class { onended: (() => void) | null = null; pause() {} async play() {} });
  render(<MemoryRouter><TeacherRoster /></MemoryRouter>);
  fireEvent.click(screen.getAllByRole("button", { name: /听听我的声音/ })[0]);
  await waitFor(() => expect(screen.getByRole("button", { name: /停止/ })).toBeTruthy());
  expect(speech.calls).toEqual(["prepare", "synthesize"]);
  expect(screen.queryByText(/配置自己的语音服务/)).toBeNull();
});

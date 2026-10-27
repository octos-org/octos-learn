import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

const calls: string[] = [];
vi.mock("@/byok/services", async (original) => ({
  ...(await original<object>()),
  prepareClientServices: vi.fn(async () => { calls.push("prepare"); }),
}));
vi.mock("@/byok/providers", async (original) => ({
  ...(await original<object>()),
  synthesizeTeacherSample: vi.fn(async () => { calls.push("synthesize"); return new Blob(["mp3"], { type: "audio/mpeg" }); }),
}));
vi.mock("@/api/client", async (original) => ({ ...(await original<object>()), getToken: () => "token" }));
vi.mock("@/auth/auth-context", () => ({ useAuth: () => ({ token: "token", logout: vi.fn(async () => undefined) }) }));

import { TeachersPage } from "./teachers-page";

afterEach(() => { cleanup(); calls.length = 0; vi.unstubAllGlobals(); });

it("loads the learner's saved speech service before speaking, even when the whiteboard was never opened", async () => {
  URL.createObjectURL = vi.fn(() => "blob:voice");
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal("Audio", class { onended: (() => void) | null = null; pause() {} async play() {} });
  render(<MemoryRouter><TeachersPage /></MemoryRouter>);
  fireEvent.click(screen.getAllByRole("button", { name: /听听我的声音/ })[0]);
  await waitFor(() => expect(screen.getByRole("button", { name: /停止/ })).toBeTruthy());
  expect(calls).toEqual(["prepare", "synthesize"]);
  expect(screen.queryByText(/配置自己的语音服务/)).toBeNull();
});

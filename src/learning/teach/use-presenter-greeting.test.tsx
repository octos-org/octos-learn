import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { setLocale } from "@/i18n";
import { PRESENTER_GREETINGS } from "./presenter-greetings";

const played: string[] = [];
beforeEach(() => {
  setLocale("en-US");
  const clips = PRESENTER_GREETINGS["moon-cat"].en.map((text, index) => ({ avatar: "moon-cat", locale: "en", text, file: `moon-cat/en-${String(index).padStart(12, "0")}.mp3`, provider: "volcano", voice: "v" }));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.endsWith("manifest.json")
    ? new Response(JSON.stringify({ schema: "octos.presenter-greetings.v1", clips }))
    : new Response(new Blob([url], { type: "audio/mpeg" })))));
  vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL: (blob: Blob & { size: number }) => `blob:${blob.size}`, revokeObjectURL: () => undefined }));
  vi.stubGlobal("Audio", class { onended: (() => void) | null = null; constructor(public src: string) {} play() { played.push(this.src); return Promise.resolve(); } pause() {} });
});
afterEach(() => { vi.unstubAllGlobals(); played.length = 0; setLocale("zh-CN"); });

it("plays a picked character's line in its own prepared clip, a different line each time", async () => {
  const { usePresenterGreeting } = await import("./use-presenter-greeting");
  const { result } = renderHook(() => usePresenterGreeting());
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2)); // the manifest, then the next clip of the one character that has clips
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  act(() => result.current.greet("moon-cat"));
  await waitFor(() => expect(result.current.current?.state).toBe("playing"));
  expect(played).toHaveLength(1);
  const first = result.current.current!.text;
  expect(PRESENTER_GREETINGS["moon-cat"].en).toContain(first);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  act(() => result.current.greet("moon-cat"));
  await waitFor(() => expect(played).toHaveLength(2));
  expect(result.current.current!.text).not.toBe(first);
});

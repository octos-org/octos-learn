import { act, renderHook, waitFor } from "@testing-library/react";
import type { CanonicalEvent } from "octos-lesson-language";
import { expect, it, vi } from "vitest";

const speech = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("@/api/voice", () => ({ synthesizeSpeech: async (text: string) => { speech.calls.push(text); return new Blob([text], { type: "audio/mpeg" }); } }));
vi.mock("../avatar/prepare-preview-audio", () => ({
  preparePreviewAudio: async (bytes: ArrayBuffer) => ({ schema: "octos.avatar-lip-sync.v1", audioSha256: "b".repeat(64), durationMs: 2000, keys: [{ timeMs: 0, channels: { jawOpen: bytes.byteLength / 100 } }] }),
}));
import { useLiveNarrationAvatar } from "./live-narration-avatar";
import { bytes } from "./make-learner-package";

const events = [{ step: { beats: [
  { id: "l:beat:card-1", narration: { text: " The unit circle. " } },
  { id: "l:beat:card-2", narration: { text: "Unwrap it." } },
] } }] as unknown as CanonicalEvent[];
const moves = { "l:beat:card-1": { track: { schema: "octos.avatar-performance.v1" as const, durationMs: 1000, frames: [
  { timeMs: 0, source: "mediapipe" as const, tracked: true, channels: {}, rotation: [0, 0.2, 0] as [number, number, number] },
  { timeMs: 900, source: "mediapipe" as const, tracked: true, channels: {}, rotation: [0, 0.4, 0] as [number, number, number] },
] }, speechSpanMs: [0, 1000] as [number, number] } };

it("makes a card's narration while the lesson plays, with mouth motion and the learner's re-timed movement, and readies the next card", async () => {
  speech.calls = [];
  const { result } = renderHook(() => useLiveNarrationAvatar({ enabled: true, events, voices: null, language: "en-US", performances: async () => moves }));
  let audio: Blob | null = null;
  await act(async () => { audio = await result.current.resolveAudio!("l:beat:card-1", "The unit circle.", new AbortController().signal); });
  expect(new TextDecoder().decode(await bytes(audio!))).toBe("The unit circle.");
  await waitFor(() => expect(result.current.mouthTrack("l:beat:card-1", "The unit circle.")).not.toBeNull());
  expect(result.current.performanceTrack("l:beat:card-1", "The unit circle.")?.keys.length).toBeGreaterThan(0);
  // The next card is made while this one plays, once; card 2 has no recorded movement.
  await waitFor(() => expect(speech.calls).toEqual(["The unit circle.", "Unwrap it."]));
  await act(async () => { await result.current.resolveAudio!("l:beat:card-2", "Unwrap it.", new AbortController().signal); });
  expect(speech.calls).toHaveLength(2);
  await waitFor(() => expect(result.current.mouthTrack("l:beat:card-2", "Unwrap it.")).not.toBeNull());
  expect(result.current.performanceTrack("l:beat:card-2", "Unwrap it.")).toBeNull();
});

it("leaves narration to the usual path when off", () => {
  const { result } = renderHook(() => useLiveNarrationAvatar({ enabled: false, events, voices: null, language: "en-US", performances: async () => ({}) }));
  expect(result.current.resolveAudio).toBeUndefined();
  expect(result.current.mouthTrack("l:beat:card-1", "The unit circle.")).toBeNull();
});

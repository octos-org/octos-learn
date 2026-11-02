import { normalizeAuthoringLesson } from "octos-lesson-language";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { calibrationWav, envelopeLipSync, audioDigest } from "../avatar/lip-sync";
import { preparePreviewAudio } from "../avatar/prepare-preview-audio";

vi.mock("@/api/voice", () => ({ synthesizeSpeech: vi.fn() }));
vi.mock("../avatar/prepare-preview-audio", () => ({ preparePreviewAudio: vi.fn() }));
import { synthesizeSpeech } from "@/api/voice";
import { compileRecording } from "./compile-recording";
import { appendEvent, createRecording, finishTake, planCards, startTake } from "./recording";
import { learnerAuthor } from "./studio-helpers";
import { readLearnerPackage, LEARNER_MOUTH_PACKAGE_SCHEMA, LEARNER_PACKAGE_SCHEMA } from "./learner-package";
import { makeLearnerPackage } from "./make-learner-package";

const now = "2026-11-02T12:00:00.000Z";
function input(signal = new AbortController().signal) {
  let recording = planCards(createRecording({ id: "mouth-test", now, topic: { text: "Addition", type: "math_off_map" }, goals: [] }), now, [{ title: "One" }]);
  recording = finishTake(appendEvent(startTake(recording, "card-1", now), "card-1", { t: 0, type: "component.insert", panel: "coordinate_grid", alias: "grid-1", x: [-1, 6], y: [-1, 9] }, now), "card-1", now, { durationMs: 4000, asrText: "Two plus two is four." });
  const compiled = compileRecording(recording, { author: learnerAuthor("local"), language: "en-US" });
  const events = normalizeAuthoringLesson(compiled.lesson, { lessonId: "mouth-test", boardId: "board", baseRevision: 0, resourceContext: compiled.resourceContext });
  return { lessonId: "mouth-test", title: "Addition", language: "en-US", events, snapshots: {}, voices: null, signal, onProgress: vi.fn() };
}
beforeEach(() => {
  vi.mocked(synthesizeSpeech).mockReset().mockResolvedValue(new Blob([calibrationWav()], { type: "audio/wav" }));
  vi.mocked(preparePreviewAudio).mockReset().mockImplementation(async (bytes) => envelopeLipSync([new Float32Array(16000 * 4).fill(.1)], 16000, await audioDigest(bytes)));
  vi.stubGlobal("Audio", undefined); // legacy duration uses its documented reading estimate
});
afterEach(() => vi.unstubAllGlobals());

it("synthesizes each card once, then stores the exact audio's mouth track for offline reading", async () => {
  const source = input(), result = await makeLearnerPackage({ ...source, includeLipSync: true });
  expect(synthesizeSpeech).toHaveBeenCalledOnce(); expect(preparePreviewAudio).toHaveBeenCalledOnce();
  expect(result.manifest.schema).toBe(LEARNER_MOUTH_PACKAGE_SCHEMA);
  const loaded = await readLearnerPackage(result.archive), clip = loaded.manifest.narration[0]!;
  expect(loaded.mouthTrack(clip.beatId, "Two plus two is four.")?.method).toBe("envelope-v1");
  expect(clip.durationMs).toBe(4000);
});
it("keeps ordinary packaging on v1 with no analysis unless explicitly selected", async () => {
  const result = await makeLearnerPackage(input());
  expect(result.manifest.schema).toBe(LEARNER_PACKAGE_SCHEMA);
  expect(preparePreviewAudio).not.toHaveBeenCalled(); expect(synthesizeSpeech).toHaveBeenCalledOnce();
});
it("does not silently drop a failed requested mouth track", async () => {
  vi.mocked(preparePreviewAudio).mockRejectedValue(new Error("invalid_audio"));
  await expect(makeLearnerPackage({ ...input(), includeLipSync: true })).rejects.toThrow("未能准备嘴型");
  expect(synthesizeSpeech).toHaveBeenCalledOnce();
});
it("cancels before requesting speech and refuses a late synthesis after cancellation", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(makeLearnerPackage(input(controller.signal))).rejects.toMatchObject({ name: "AbortError" });
  expect(synthesizeSpeech).not.toHaveBeenCalled();
  const late = new AbortController();
  vi.mocked(synthesizeSpeech).mockImplementation(async () => { late.abort(); return new Blob([calibrationWav()]); });
  await expect(makeLearnerPackage({ ...input(late.signal), includeLipSync: true })).rejects.toMatchObject({ name: "AbortError" });
  expect(preparePreviewAudio).not.toHaveBeenCalled();
});

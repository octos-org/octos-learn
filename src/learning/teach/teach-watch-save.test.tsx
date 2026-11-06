import { setLocale } from "@/i18n";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const savedHash = "a".repeat(64);
const saving = vi.hoisted(() => ({
  make: vi.fn(), sync: vi.fn(), upload: vi.fn(), write: vi.fn(), achievements: vi.fn(),
}));
vi.mock("@/api/client", () => ({ getToken: () => "token", getSelectedProfileId: () => "learner-1" }));
vi.mock("@/byok/providers", async (original) => ({ ...(await original<object>()), availableService: () => true }));
vi.mock("@/byok/services", () => ({ prepareClientServices: async () => undefined, getService: () => undefined }));
vi.mock("../academy/academy-header", () => ({ AcademyHeader: () => null }));
vi.mock("../history/history-api", () => ({ openHistoryApi: async () => ({ achievements: saving.achievements }) }));
vi.mock("../oll/oll-lesson-runtime", () => ({ LearningWhiteboard: () => null }));
vi.mock("../oll/use-oll-lesson-runtime", () => ({ useOllLessonRuntime: () => null }));
vi.mock("../oll/use-oll-narration-tts", () => ({ useOllNarrationTts: () => ({ preparing: false, error: null }) }));
vi.mock("./lesson-check", () => ({ cardChecks: () => [], lessonReady: () => true }));
vi.mock("./draft-sync", () => ({ syncLessonDrafts: saving.sync }));
vi.mock("./learner-lessons-api", () => ({ listLessons: async () => [], saveLessonPackage: saving.upload }));
vi.mock("./make-learner-package", () => ({ makeLearnerPackage: saving.make }));
const takes = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("./take-performance-store", () => ({ readTakePerformance: takes.read }));
vi.mock("./learner-package-store", () => ({ readStoredLearnerPackage: async () => undefined, writeStoredLearnerPackage: saving.write }));
vi.mock("./learner-package", async (original) => ({
  ...(await original<object>()),
  readLearnerPackage: async () => ({ manifest: { contentSha256: "a".repeat(64) }, narration: async () => null, mouthTrack: () => null }),
}));

import { appendEvent, createRecording, finishTake, planCards, setPresenter, startTake } from "./recording";
import { loadRecordingDrafts } from "./recording-store";
import { saveRecordingDraft } from "./recording-store";
import { TeachWatchPage } from "./teach-watch-page";

const built = () => ({ archive: new Uint8Array([1, 2, 3]), manifest: { contentSha256: savedHash, createdAt: "2026-11-03T12:00:00Z" } });
beforeEach(() => {
  localStorage.clear(); setLocale("en-US");
  for (const mock of Object.values(saving)) mock.mockReset();
  saving.make.mockResolvedValue(built());
  saving.upload.mockResolvedValue({ saved: { content_sha256: savedHash } });
  const now = "2026-11-03T11:00:00Z";
  let recording = planCards(createRecording({ id: "merge-save", now, topic: { text: "Slope", type: "math_off_map" }, goals: [] }), now, [{ title: "One" }]);
  recording = finishTake(appendEvent(startTake(recording, "card-1", now), "card-1", {
    t: 0, type: "component.insert", panel: "coordinate_grid", alias: "grid-1", x: [-1, 6], y: [-1, 9],
  }, now), "card-1", now, { durationMs: 1000, asrText: "A grid." });
  saveRecordingDraft(localStorage, "learner-1", recording);
});
afterEach(() => { cleanup(); setLocale("zh-CN"); });
function open() {
  render(<MemoryRouter initialEntries={["/teach/merge-save/watch"]}><Routes>
    <Route path="/teach/:id/watch" element={<TeachWatchPage />} />
  </Routes></MemoryRouter>);
}
/** Saving and its options are in the panel under the top-right button. */
async function openSavePanel() {
  fireEvent.click(await screen.findByRole("button", { name: "Save this lesson" }));
  return screen.findByRole("dialog", { name: "Save this lesson" });
}

it("keeps M6 draft sync, account save and achievement refresh after adding optional mouth preparation", async () => {
  open();
  await openSavePanel();
  const button = await screen.findByRole("button", { name: "Save to My lessons" });
  await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  fireEvent.click(button);
  expect(await screen.findByRole("link", { name: "Go to My lessons" })).toBeTruthy();
  expect(saving.make.mock.calls[0]![0]).toMatchObject({ includeLipSync: false });
  expect(saving.sync).toHaveBeenCalledWith(localStorage, "learner-1");
  expect(saving.upload).toHaveBeenCalledWith("merge-save", new Uint8Array([1, 2, 3]).buffer);
  expect(saving.sync.mock.invocationCallOrder[0]).toBeLessThan(saving.upload.mock.invocationCallOrder[0]!);
  expect(saving.achievements).toHaveBeenCalledOnce();
});

it("does not upload a package completed after the learner changes the presenter", async () => {
  let finish!: (value: ReturnType<typeof built>) => void;
  saving.make.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  open();
  await openSavePanel();
  const button = await screen.findByRole("button", { name: "Save to My lessons" });
  await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  fireEvent.click(button);
  await waitFor(() => expect(saving.make).toHaveBeenCalledOnce());
  const signal = saving.make.mock.calls[0]![0].signal as AbortSignal;
  fireEvent.click(screen.getByRole("button", { name: "Change the avatar or voice" }));
  fireEvent.click(screen.getByRole("button", { name: "Moon Cat" }));
  expect(signal.aborted).toBe(true);
  await act(async () => { finish(built()); });
  expect(saving.write).not.toHaveBeenCalled();
  expect(saving.sync).not.toHaveBeenCalled();
  expect(saving.upload).not.toHaveBeenCalled();
});

it("re-times the camera takes kept on this device into the package, only when the learner includes them", async () => {
  const [draft] = loadRecordingDrafts(localStorage, "learner-1");
  const card = draft!.cards[0]!;
  const withCamera = setPresenter({ ...draft!, cards: [{ ...card, takes: card.takes.map((take) => ({ ...take, camera: true as const })) }] },
    { cameraMotion: "on", mouthMotion: "basic" }, "2026-11-03T11:30:00Z");
  saveRecordingDraft(localStorage, "learner-1", withCamera);
  const track = { schema: "octos.avatar-performance.v1", durationMs: 1000, frames: [] };
  takes.read.mockResolvedValue(track);
  open();
  await openSavePanel();
  expect(await screen.findByRole("checkbox", { name: /^Include my expressions and head turns from recording/ })).toHaveProperty("checked", true);
  const button = await screen.findByRole("button", { name: "Save to My lessons" });
  await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  fireEvent.click(button);
  await waitFor(() => expect(saving.make).toHaveBeenCalledOnce());
  expect(takes.read).toHaveBeenCalledWith({ profileId: "learner-1", recordingId: "merge-save", cardKey: "card-1", take: 1 });
  const performances = saving.make.mock.calls[0]![0].performances as Record<string, { track: unknown; speechSpanMs?: unknown }>;
  expect(Object.keys(performances)).toHaveLength(1);
  expect(Object.keys(performances)[0]).toMatch(/:step:card-1:beat:card-1-s1$/);
  expect(Object.values(performances)[0]!.track).toBe(track);
  expect(saving.make.mock.calls[0]![0]).toMatchObject({ includeLipSync: true });
});

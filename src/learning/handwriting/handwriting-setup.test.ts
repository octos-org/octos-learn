import { beforeEach, describe, expect, it } from "vitest";
import { HandwritingSetup } from "./handwriting-setup";
import { DEFAULT_HANDWRITING_PREFERENCES, HANDWRITING_PREFERENCES_KEY, loadHandwritingPreferences, saveHandwritingPreferences } from "./handwriting-preferences";
import { handPalmCenter } from "./handwriting-gesture";
import { makeHandwritingLandmarks } from "./simulated-trajectory";

beforeEach(() => localStorage.clear());
function feed(setup: HandwritingSetup, start: number, score: number, x = 0.4, y = 0.4) {
  for (let i = 0; i < 25; i++) {
    const landmarks = makeHandwritingLandmarks({ x: 0.4, y: 0.3 }, score, "pinch");
    const center = handPalmCenter(landmarks);
    setup.add({ timeMs: start + i * 33, tracked: true, landmarks: landmarks.map(p => ({ x: p.x + 1 - x - center.x, y: p.y + y - center.y })) });
  }
}
describe("personal hand setup", () => {
  it("derives separated thresholds from open and closed samples and persists them", () => {
    const setup = new HandwritingSetup("pinch", DEFAULT_HANDWRITING_PREFERENCES);
    feed(setup, 0, 0.8); expect(setup.snapshot.stage).toBe("open-ready");
    setup.next(); feed(setup, 900, 0.15);
    expect(setup.snapshot.stage).toBe("pinch-ready");
    const prefs = setup.snapshot.result!;
    expect(prefs.pinch.down).toBeGreaterThan(0.15);
    expect(prefs.pinch.up).toBeGreaterThan(prefs.pinch.down);
    expect(saveHandwritingPreferences(prefs)).toBe(true);
    expect(loadHandwritingPreferences()).toEqual(prefs);
  });
  it("rejects indistinguishable poses", () => {
    const setup = new HandwritingSetup("pinch", DEFAULT_HANDWRITING_PREFERENCES);
    feed(setup, 0, 0.4); setup.next(); feed(setup, 900, 0.39);
    expect(setup.snapshot).toEqual({ stage: "failed", progress: 0 });
  });
  it("records the mirrored comfortable region and rejects inverted corners", () => {
    const setup = new HandwritingSetup("region", DEFAULT_HANDWRITING_PREFERENCES);
    feed(setup, 0, 0.8, 0.25, 0.2); setup.next(); feed(setup, 900, 0.8, 0.8, 0.85);
    expect(setup.snapshot.result?.region.left).toBeCloseTo(0.25);
    expect(setup.snapshot.result?.region.right).toBeCloseTo(0.8);
    const inverted = new HandwritingSetup("region", DEFAULT_HANDWRITING_PREFERENCES);
    feed(inverted, 0, 0.8, 0.8, 0.85); inverted.next(); feed(inverted, 900, 0.8, 0.25, 0.2);
    expect(inverted.snapshot.stage).toBe("failed");
  });
  it("requires sustained valid observations after a gap", () => {
    const setup = new HandwritingSetup("pinch", DEFAULT_HANDWRITING_PREFERENCES);
    setup.add({ timeMs: 0, tracked: false });
    expect(setup.snapshot.progress).toBe(0);
    feed(setup, 1000, 0.8);
    expect(setup.snapshot.stage).toBe("open-ready");
  });
  it("rejects corrupt, older, out of range or overlapping saved settings", () => {
    for (const value of ["{", JSON.stringify({ version: 0 }), JSON.stringify({ ...DEFAULT_HANDWRITING_PREFERENCES, pinch: { down: 0.8, up: 0.7 } })]) {
      localStorage.setItem(HANDWRITING_PREFERENCES_KEY, value);
      expect(loadHandwritingPreferences()).toEqual(DEFAULT_HANDWRITING_PREFERENCES);
    }
  });
  it("replaces old distance thresholds when the contact measurement changes", () => {
    const old = { ...DEFAULT_HANDWRITING_PREFERENCES, pinchMetric: undefined,
      pinch: { down: 0.03, up: 0.08 }, tutorialDone: true, region: { left: 0.2, top: 0.2, right: 0.8, bottom: 0.8 } };
    localStorage.setItem(HANDWRITING_PREFERENCES_KEY, JSON.stringify(old));
    const migrated = loadHandwritingPreferences();
    expect(migrated.pinch).toEqual(DEFAULT_HANDWRITING_PREFERENCES.pinch);
    expect(migrated.pinchMetric).toBe(2);
    expect(migrated.region).toEqual(old.region);
    expect(migrated.tutorialDone).toBe(true);
  });

});

import { describe, expect, it, vi } from "vitest";
import { CameraConflictError, createCameraSource } from "./camera-source";
function stream(facing = "user") {
  const track = { stop: vi.fn(), readyState: "live", getSettings: () => ({ facingMode: facing }) };
  return { track, media: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream };
}
describe("camera source leases", () => {
  it("shares one pending request across local recognition and an independently enabled teacher camera", async () => {
    const camera = stream();
    let resolve!: (stream: MediaStream) => void;
    const acquire = vi.fn(() => new Promise<MediaStream>(done => { resolve = done; }));
    const source = createCameraSource(acquire);
    const local = source.acquire("handwriting-local"), teacher = source.acquire("teacher-frame");
    expect(acquire).toHaveBeenCalledOnce();
    expect(acquire.mock.calls[0]?.[0]).toMatchObject({ audio: false, video: { facingMode: "user" } });
    resolve(camera.media);
    const a = await local, b = await teacher;
    expect(a.stream).toBe(b.stream);
    a.release(); a.release(); expect(camera.track.stop).not.toHaveBeenCalled();
    b.release(); expect(camera.track.stop).toHaveBeenCalledOnce();
  });
  it("does not close an authorized local stream when teacher-frame use stops", async () => {
    const camera = stream(), acquire = vi.fn(async () => camera.media);
    const source = createCameraSource(acquire);
    const teacher = await source.acquire("teacher-frame"), local = await source.acquire("handwriting-local");
    teacher.release(); expect(camera.track.stop).not.toHaveBeenCalled();
    local.release(); expect(camera.track.stop).toHaveBeenCalledOnce();
  });
  it("refuses a conflicting rear camera without changing the existing teacher lease", async () => {
    const camera = stream("environment"); const source = createCameraSource(async () => camera.media);
    const teacher = await source.acquire("teacher-frame");
    await expect(source.acquire("handwriting-local")).rejects.toBeInstanceOf(CameraConflictError);
    expect(camera.track.stop).not.toHaveBeenCalled(); teacher.release(); expect(camera.track.stop).toHaveBeenCalledOnce();
  });
  it("releases a failed request and permits retry", async () => {
    const camera = stream(), acquire = vi.fn().mockRejectedValueOnce(new Error("denied")).mockResolvedValueOnce(camera.media);
    const source = createCameraSource(acquire);
    await expect(source.acquire("handwriting-local")).rejects.toThrow("denied");
    const lease = await source.acquire("handwriting-local"); lease.release(); expect(acquire).toHaveBeenCalledTimes(2);
  });
  it("replaces an ended source and isolates releases from its old consumers", async () => {
    const first = stream(), second = stream(); const acquire = vi.fn().mockResolvedValueOnce(first.media).mockResolvedValueOnce(second.media);
    const source = createCameraSource(acquire); const a = await source.acquire("teacher-frame"); first.track.readyState = "ended";
    const b = await source.acquire("handwriting-local"); a.release(); expect(second.track.stop).not.toHaveBeenCalled(); b.release(); expect(second.track.stop).toHaveBeenCalledOnce();
  });
});

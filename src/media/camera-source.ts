/** Shared physical camera; a lease never enables another consumer's sending policy. */
export interface CameraLease { stream: MediaStream; release(): void }
export type CameraPurpose = "handwriting-local" | "teacher-frame";
export class CameraConflictError extends Error {}

export function createCameraSource(acquire: (constraints: MediaStreamConstraints) => Promise<MediaStream>) {
  let entry: { promise: Promise<MediaStream>; users: number; stream?: MediaStream } | null = null;
  return {
    async acquire(purpose: CameraPurpose): Promise<CameraLease> {
      if (entry?.stream && entry.stream.getTracks().some(track => track.readyState === "ended")) entry = null;
      if (!entry) {
        const next = { users: 0, promise: Promise.resolve(null as unknown as MediaStream), stream: undefined as MediaStream | undefined };
        next.promise = acquire({ audio: false, video: {
          width: { ideal: 1920 }, height: { ideal: 1080 },
          ...(purpose === "handwriting-local" ? { facingMode: "user" } : {}),
        } }).then(stream => { next.stream = stream; return stream; });
        entry = next;
      }
      const current = entry;
      current.users += 1;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        current.users -= 1;
        if (!current.users) {
          if (entry === current) entry = null;
          current.stream?.getTracks().forEach(track => track.stop());
        }
      };
      try {
        const stream = await current.promise;
        if (purpose === "handwriting-local" && stream.getVideoTracks?.().some(track => track.getSettings?.().facingMode === "environment")) {
          throw new CameraConflictError("camera_in_use");
        }
        return { stream, release };
      } catch (error) {
        release();
        throw error;
      }
    },
  };
}

export const cameraSource = createCameraSource(constraints => navigator.mediaDevices.getUserMedia(constraints));

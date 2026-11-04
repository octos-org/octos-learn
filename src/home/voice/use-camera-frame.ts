import { cameraSource, type CameraLease } from "@/media/camera-source";
import { useCallback, useEffect, useRef, useState } from "react";

export type CameraRotation = 0 | 90 | 180 | 270;

export interface CameraFrameSettings {
  rotation: CameraRotation;
  mirror: boolean;
  zoom: number;
  offsetX: number;
  offsetY: number;
  documentMode: boolean;
}

export const DEFAULT_CAMERA_FRAME_SETTINGS: CameraFrameSettings = {
  rotation: 0,
  mirror: false,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  documentMode: true,
};

const CAMERA_FRAME_SETTINGS_KEY = "octos_camera_frame_settings_v1";

export interface CameraFrame {
  /** Whether the camera stream is live. */
  active: boolean;
  /** Live camera stream, for binding to a preview `<video>`. Null when off. */
  stream: MediaStream | null;
  /** Last error (permission denied / no device / capture failure). */
  error: string | null;
  /** The exact visual transform shared by preview and uploaded frames. */
  settings: CameraFrameSettings;
  updateSettings: (patch: Partial<CameraFrameSettings>) => void;
  resetSettings: () => void;
  /** Request camera access and start the stream. */
  start: () => Promise<boolean>;
  /** Stop the stream and release the device. */
  stop: () => void;
  /** Capture the current frame as a downscaled JPEG `File`, or `null` if the
   *  camera isn't active or capture fails (caller then sends audio only). */
  grabFrame: () => Promise<File | null>;
}

/** Longest edge of a captured frame, in px — caps vision-token cost + upload. */
export const MAX_LONG_EDGE = 768;
/** Document mode keeps worksheet text readable for the vision model. */
export const DOCUMENT_MAX_LONG_EDGE = 1600;
/** JPEG quality for captured frames. */
export const JPEG_QUALITY = 0.7;
export const DOCUMENT_JPEG_QUALITY = 0.88;
/** Capture size used before the video reports its real dimensions. */
const FALLBACK_W = 640;
const FALLBACK_H = 480;

/** Target canvas size, downscaled so the longest edge is `maxEdge` (never
 *  upscaling). Exported for unit tests. */
export function computeDownscaledSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeCameraFrameSettings(
  candidate: Partial<CameraFrameSettings>,
): CameraFrameSettings {
  const rotation = [0, 90, 180, 270].includes(candidate.rotation ?? -1)
    ? candidate.rotation as CameraRotation
    : DEFAULT_CAMERA_FRAME_SETTINGS.rotation;
  return {
    rotation,
    mirror: candidate.mirror === true,
    zoom: clamp(Number(candidate.zoom) || 1, 1, 3),
    offsetX: clamp(Number(candidate.offsetX) || 0, -1, 1),
    offsetY: clamp(Number(candidate.offsetY) || 0, -1, 1),
    documentMode: candidate.documentMode !== false,
  };
}

export interface CameraFrameGeometry {
  rotatedWidth: number;
  rotatedHeight: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
}

export function computeCameraFrameGeometry(
  width: number,
  height: number,
  settings: CameraFrameSettings,
): CameraFrameGeometry {
  const quarterTurn = settings.rotation === 90 || settings.rotation === 270;
  const rotatedWidth = quarterTurn ? height : width;
  const rotatedHeight = quarterTurn ? width : height;
  const zoom = clamp(settings.zoom, 1, 3);
  const cropWidth = rotatedWidth / zoom;
  const cropHeight = rotatedHeight / zoom;
  const availableX = rotatedWidth - cropWidth;
  const availableY = rotatedHeight - cropHeight;
  return {
    rotatedWidth,
    rotatedHeight,
    cropX: availableX * ((clamp(settings.offsetX, -1, 1) + 1) / 2),
    cropY: availableY * ((clamp(settings.offsetY, -1, 1) + 1) / 2),
    cropWidth,
    cropHeight,
  };
}

/** Paint the exact outgoing camera view onto `canvas`. */
export function drawCameraFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  settings: CameraFrameSettings,
  maxLongEdge: number,
  scratchCanvas?: HTMLCanvasElement,
): boolean {
  const width = video.videoWidth || FALLBACK_W;
  const height = video.videoHeight || FALLBACK_H;
  const geometry = computeCameraFrameGeometry(width, height, settings);
  const output = computeDownscaledSize(
    geometry.cropWidth,
    geometry.cropHeight,
    maxLongEdge,
  );
  if (output.width === 0 || output.height === 0) return false;

  const rotated = scratchCanvas ?? document.createElement("canvas");
  rotated.width = geometry.rotatedWidth;
  rotated.height = geometry.rotatedHeight;
  canvas.width = output.width;
  canvas.height = output.height;
  const rotatedContext = rotated.getContext("2d");
  const outputContext = canvas.getContext("2d");
  if (!rotatedContext || !outputContext) return false;

  rotatedContext.save();
  rotatedContext.translate(geometry.rotatedWidth / 2, geometry.rotatedHeight / 2);
  rotatedContext.scale(settings.mirror ? -1 : 1, 1);
  rotatedContext.rotate((settings.rotation * Math.PI) / 180);
  rotatedContext.drawImage(video, -width / 2, -height / 2, width, height);
  rotatedContext.restore();

  outputContext.drawImage(
    rotated,
    geometry.cropX,
    geometry.cropY,
    geometry.cropWidth,
    geometry.cropHeight,
    0,
    0,
    output.width,
    output.height,
  );
  return true;
}

function loadCameraFrameSettings(): CameraFrameSettings {
  try {
    const stored = localStorage.getItem(CAMERA_FRAME_SETTINGS_KEY);
    return stored
      ? normalizeCameraFrameSettings(JSON.parse(stored) as Partial<CameraFrameSettings>)
      : DEFAULT_CAMERA_FRAME_SETTINGS;
  } catch {
    return DEFAULT_CAMERA_FRAME_SETTINGS;
  }
}

/**
 * Manage a single camera stream behind a tiny start/stop/grab interface.
 *
 * The stream is attached to an off-DOM `<video>` element (no preview is
 * rendered in the MVP); `grabFrame` paints the current frame onto an off-screen
 * canvas, downscales it, and returns a JPEG. Failures are swallowed into `null`
 * so a voice turn degrades to audio-only rather than breaking.
 */
export function useCameraFrame(): CameraFrame {
  const streamRef = useRef<MediaStream | null>(null);
  const leaseRef = useRef<CameraLease | null>(null);
  const generationRef = useRef(0);
  const startingRef = useRef<Promise<boolean> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [active, setActive] = useState(false);
  // Exposed so a preview <video> can bind the live stream.
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState(loadCameraFrameSettings);

  useEffect(() => {
    try {
      localStorage.setItem(CAMERA_FRAME_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Camera calibration remains usable even when storage is unavailable.
    }
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<CameraFrameSettings>) => {
    setSettings((current) => normalizeCameraFrameSettings({ ...current, ...patch }));
  }, []);
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_CAMERA_FRAME_SETTINGS);
  }, []);

  const stop = useCallback(() => {
    generationRef.current += 1;
    startingRef.current = null;
    streamRef.current = null;
    leaseRef.current?.release();
    leaseRef.current = null;
    const video = videoRef.current;
    if (video) {
      try {
        video.srcObject = null;
      } catch {
        // ignore
      }
    }
    videoRef.current = null;
    setStream(null);
    setActive(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback((): Promise<boolean> => {
    if (streamRef.current) return Promise.resolve(true);
    if (startingRef.current) return startingRef.current;
    const generation = generationRef.current;
    setError(null);
    const starting = (async () => {
      try {
        const lease = await cameraSource.acquire("teacher-frame");
        if (generation !== generationRef.current) { lease.release(); return false; }
        leaseRef.current = lease;
        streamRef.current = lease.stream;
        for (const track of lease.stream.getTracks()) track.addEventListener?.("ended", () => {
          if (generation !== generationRef.current) return;
          stop(); setError("camera unavailable");
        }, { once: true });
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = lease.stream;
        videoRef.current = video;
        try { await video.play?.(); } catch { /* Frame capture can resume after autoplay. */ }
        if (generation !== generationRef.current) return false;
        setStream(lease.stream);
        setActive(true);
        return true;
      } catch (cause) {
        if (generation !== generationRef.current) return false;
        leaseRef.current?.release(); leaseRef.current = null;
        streamRef.current = null; videoRef.current = null;
        setError(cause instanceof Error ? cause.message : "camera unavailable");
        setActive(false); setStream(null);
        return false;
      } finally {
        if (generation === generationRef.current) startingRef.current = null;
      }
    })();
    startingRef.current = starting;
    return starting;
  }, [stop]);

  const grabFrame = useCallback(async (): Promise<File | null> => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return null;
    try {
      const canvas = document.createElement("canvas");
      const maxLongEdge = settings.documentMode
        ? DOCUMENT_MAX_LONG_EDGE
        : MAX_LONG_EDGE;
      if (!drawCameraFrame(video, canvas, settings, maxLongEdge)) return null;

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(
          (b) => resolve(b),
          "image/jpeg",
          settings.documentMode ? DOCUMENT_JPEG_QUALITY : JPEG_QUALITY,
        );
      });
      if (!blob) return null;
      return new File([blob], `frame-${Date.now()}.jpg`, { type: "image/jpeg" });
    } catch (e) {
      console.error("[camera] grabFrame failed", e);
      return null;
    }
  }, [settings]);

  return {
    active,
    stream,
    error,
    settings,
    updateSettings,
    resetSettings,
    start,
    stop,
    grabFrame,
  };
}

/** Capture failures are local-device/runtime failures, not supplier authentication. */
export function describeCaptureError(error: unknown): string {
  const details = error !== null && typeof error === "object" ? error as { name?: unknown; message?: unknown } : null;
  const name = typeof details?.name === "string" ? details.name : "";
  const message = typeof details?.message === "string" ? details.message : String(error);
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return "Microphone access was blocked. Allow microphone access for this site and for your browser in system settings, then try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "No microphone was found. Connect a microphone and select an input device in system settings.";
  if (name === "NotReadableError" || name === "TrackStartError") return "The microphone could not be opened. Check whether another application is using it and whether the device is working.";
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") return "The microphone does not support the requested audio settings. Try another input device.";
  return `Voice capture could not initialize: ${message || "unknown device or audio runtime error"}`;
}

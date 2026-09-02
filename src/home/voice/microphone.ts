// Keep the microphone constraints shared by Silero VAD and the private-ASR
// adapter. The browser owns acoustic processing; the same physical capture is
// cloned for VAD while Agora publishes the original track.
export const MIC_CONSTRAINTS_WITH_ALL_SYSTEM_AEC = {
  channelCount: 1,
  echoCancellation: "all",
  autoGainControl: true,
  noiseSuppression: true,
} as unknown as MediaTrackConstraints;

export async function getEchoCancelledMicStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: MIC_CONSTRAINTS_WITH_ALL_SYSTEM_AEC,
  });
}

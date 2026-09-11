// Keep the microphone constraints shared by Silero VAD and the private-ASR
// adapter. The browser owns acoustic processing; the same physical capture is
// cloned for VAD while Agora publishes the original track.
export const MIC_CONSTRAINTS_WITH_ALL_SYSTEM_AEC = {
  channelCount: 1,
  echoCancellation: "all",
  autoGainControl: true,
  noiseSuppression: true,
} as unknown as MediaTrackConstraints;

const MIC_CONSTRAINTS_WITH_BOOLEAN_AEC: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: true,
  autoGainControl: true,
  noiseSuppression: true,
};

type AndroidAudioBridge = {
  describeInputDevices?: () => string;
  prepareForVoiceCapture?: () => string;
  startVoiceCapture?: () => string;
  stopVoiceCapture?: () => void;
  startPrivateAsr?: (
    appId: string,
    channel: string,
    token: string,
    uid: number,
  ) => string;
  setPrivateAsrListening?: (listening: boolean) => string;
  stopPrivateAsr?: () => void;
  describePrivateAsr?: () => string;
};

declare global {
  interface Window {
    OctosNativeAudio?: AndroidAudioBridge;
  }
}

function nativeAudioBridge(): AndroidAudioBridge | undefined {
  return typeof window === "undefined" ? undefined : window.OctosNativeAudio;
}

export const NATIVE_AUDIO_EVENT = "octos-native-audio";

export interface NativeAudioEventDetail {
  type:
    | "speech-start"
    | "utterance"
    | "misfire"
    | "error"
    | "private-asr-error";
  sampleRate?: number;
  device?: string;
  message?: string;
  wavBase64?: string;
}

interface NativeCaptureResult {
  ok?: boolean;
  error?: string;
  device?: string;
  sampleRate?: number;
}

export interface NativePrivateAsrCredentials {
  appId: string;
  channel: string;
  token: string;
  uid: number;
}

export interface NativePrivateAsrResult {
  ok?: boolean;
  error?: string;
  state?: string;
  joined?: boolean;
  listening?: boolean;
  framesPushed?: number;
}

export function nativeAudioCaptureAvailable(): boolean {
  const bridge = nativeAudioBridge();
  return typeof bridge?.startVoiceCapture === "function"
    && typeof bridge.stopVoiceCapture === "function";
}

export function nativePrivateAsrAvailable(): boolean {
  const bridge = nativeAudioBridge();
  return typeof bridge?.startPrivateAsr === "function"
    && typeof bridge.setPrivateAsrListening === "function"
    && typeof bridge.stopPrivateAsr === "function";
}

function parseNativePrivateAsrResult(raw: string): NativePrivateAsrResult {
  try {
    const result = JSON.parse(raw) as NativePrivateAsrResult;
    return result.ok
      ? result
      : {
          ...result,
          ok: false,
          error: result.error || "Android Agora 原生音频不可用",
        };
  } catch (error) {
    return { ok: false, error: microphoneErrorMessage(error) };
  }
}

export function startNativePrivateAsr(
  credentials: NativePrivateAsrCredentials,
): NativePrivateAsrResult {
  const bridge = nativeAudioBridge();
  if (!nativePrivateAsrAvailable() || !bridge?.startPrivateAsr) {
    return { ok: false, error: "Android Agora 原生音频接口不可用" };
  }
  try {
    return parseNativePrivateAsrResult(bridge.startPrivateAsr(
      credentials.appId,
      credentials.channel,
      credentials.token,
      credentials.uid,
    ));
  } catch (error) {
    return { ok: false, error: microphoneErrorMessage(error) };
  }
}

export function setNativePrivateAsrListening(
  listening: boolean,
): NativePrivateAsrResult {
  const bridge = nativeAudioBridge();
  if (!nativePrivateAsrAvailable() || !bridge?.setPrivateAsrListening) {
    return { ok: false, error: "Android Agora 原生音频接口不可用" };
  }
  try {
    return parseNativePrivateAsrResult(
      bridge.setPrivateAsrListening(listening),
    );
  } catch (error) {
    return { ok: false, error: microphoneErrorMessage(error) };
  }
}

export function stopNativePrivateAsr(): void {
  try {
    nativeAudioBridge()?.stopPrivateAsr?.();
  } catch {
    // The Activity or native RTC engine may already be shutting down.
  }
}

export function prepareNativeAudioCapture(): void {
  nativeAudioBridge()?.prepareForVoiceCapture?.();
}

export function startNativeAudioCapture(): NativeCaptureResult {
  const bridge = nativeAudioBridge();
  if (!bridge?.startVoiceCapture) {
    return { ok: false, error: "Android 原生麦克风接口不可用" };
  }
  try {
    const raw = bridge.startVoiceCapture();
    const result = JSON.parse(raw) as NativeCaptureResult;
    return result.ok
      ? result
      : { ...result, ok: false, error: result.error || "Android 原生麦克风无法启动" };
  } catch (error) {
    return { ok: false, error: microphoneErrorMessage(error) };
  }
}

export function stopNativeAudioCapture(): void {
  try {
    nativeAudioBridge()?.stopVoiceCapture?.();
  } catch {
    // Android may already be tearing down the Activity or disconnected input.
  }
}

export function decodeNativeWav(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: "audio/wav" });
}

function microphoneErrorMessage(error: unknown): string {
  if (error instanceof DOMException) return `${error.name}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

async function applyCompatibleAcousticProcessing(stream: MediaStream): Promise<void> {
  const track = stream.getAudioTracks?.()[0];
  if (!track || typeof track.applyConstraints !== "function") return;
  try {
    await track.applyConstraints(MIC_CONSTRAINTS_WITH_BOOLEAN_AEC);
  } catch {
    // Opening a real input is more important than optional acoustic processing
    // on Android 8 vendor WebViews. The browser's audio:true defaults remain in
    // effect when these best-effort constraints are unsupported.
  }
}

async function enumerateAudioInputs(): Promise<MediaDeviceInfo[]> {
  if (typeof navigator.mediaDevices.enumerateDevices !== "function") return [];
  try {
    return (await navigator.mediaDevices.enumerateDevices())
      .filter((device) => device.kind === "audioinput")
      .sort((left, right) => {
        const leftUsb = /usb|camera|webcam/i.test(left.label) ? 1 : 0;
        const rightUsb = /usb|camera|webcam/i.test(right.label) ? 1 : 0;
        return rightUsb - leftUsb;
      });
  } catch {
    return [];
  }
}

async function openMicrophone(audio: boolean | MediaTrackConstraints): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio });
}

export async function getEchoCancelledMicStream(): Promise<MediaStream> {
  const bridge = nativeAudioBridge();
  if (!bridge) {
    return openMicrophone(MIC_CONSTRAINTS_WITH_ALL_SYSTEM_AEC);
  }

  // Android 8 vendor WebViews can report a valid USB microphone yet fail to
  // create the source when given newer ConstrainDOMString values such as
  // echoCancellation: "all". Acquire the system-selected source with the
  // oldest, most compatible request first, then apply processing if supported.
  let lastError: unknown;
  try {
    const stream = await openMicrophone(true);
    await applyCompatibleAcousticProcessing(stream);
    return stream;
  } catch (error) {
    lastError = error;
  }

  let androidDevices = "";
  try {
    androidDevices = bridge.prepareForVoiceCapture?.()
      ?? bridge.describeInputDevices?.()
      ?? "";
  } catch {
    // A broken vendor bridge must not prevent WebView-only fallbacks.
  }
  await new Promise((resolve) => setTimeout(resolve, 120));

  const inputs = await enumerateAudioInputs();
  for (const input of inputs) {
    if (!input.deviceId) continue;
    try {
      const stream = await openMicrophone({
        deviceId: { exact: input.deviceId },
      });
      await applyCompatibleAcousticProcessing(stream);
      return stream;
    } catch (error) {
      lastError = error;
    }
  }

  for (const constraints of [MIC_CONSTRAINTS_WITH_BOOLEAN_AEC, true] as const) {
    try {
      const stream = await openMicrophone(constraints);
      await applyCompatibleAcousticProcessing(stream);
      return stream;
    } catch (error) {
      lastError = error;
    }
  }

  const webviewDevices = inputs.length > 0
    ? inputs.map((input) => input.label || "未命名输入设备").join("、")
    : "WebView 未列出音频输入";
  const nativeDetail = androidDevices
    ? `；Android 设备：${androidDevices}`
    : "";
  throw new Error(
    `无法启动麦克风（${microphoneErrorMessage(lastError)}）；WebView 设备：${webviewDevices}${nativeDetail}`,
  );
}

export interface CloudAsrStatus {
  available: boolean;
  detail: string;
}

export interface CloudAsrResult {
  status: "speech" | "no_speech";
  transcript: string;
}

interface NativeAsrBridge {
  isConfigured: () => boolean;
  transcribe: (requestId: string, wavBase64: string) => string;
  cancel: (requestId: string) => void;
}

declare global {
  interface Window {
    OctosNativeAsr?: NativeAsrBridge;
    __octosNativeAsrEvent?: (event: string) => void;
  }
}

interface PendingRecognition {
  finish: (result?: CloudAsrResult, error?: Error) => void;
}
const pending = new Map<string, PendingRecognition>();
let sequence = 0;

if (typeof window !== "undefined") {
  window.__octosNativeAsrEvent = (raw) => {
    try {
      const event = JSON.parse(raw) as CloudAsrResult & { requestId: string; error?: string };
      const recognition = pending.get(event.requestId);
      if (!recognition) return;
      if (event.error) recognition.finish(undefined, new Error(event.error));
      else if ((event.status === "speech" || event.status === "no_speech") && typeof event.transcript === "string") {
        recognition.finish({ status: event.status, transcript: event.transcript });
      } else recognition.finish(undefined, new Error("云端语音识别返回了无效结果。"));
    } catch { /* Ignore malformed or stale native events. */ }
  };
}

export function isCloudAsrEnabled(): boolean {
  return import.meta.env.VITE_CLOUD_ASR_ENABLED === "true"
    && !(import.meta.env.MODE === "android" && import.meta.env.DEV);
}

export async function fetchCloudAsrStatus(): Promise<CloudAsrStatus> {
  try {
    const available = window.OctosNativeAsr?.isConfigured() === true;
    return { available, detail: available ? "火山语音识别已配置。" : "正在取得语音配置，请联网后重试。" };
  } catch {
    return { available: false, detail: "语音识别组件暂不可用，请重新打开应用。" };
  }
}

/** Uses the native encrypted TTS credential; no new credential enters JS. */
export async function transcribeCloudSpeech(wav: Blob, signal: AbortSignal): Promise<CloudAsrResult> {
  const bridge = window.OctosNativeAsr;
  if (!bridge || !bridge.isConfigured()) throw new Error("尚未取得火山语音配置，请联网后重试。");
  if (wav.size > 5_760_044) throw new Error("语音过长，请分成短句。");
  const id = `asr-${Date.now().toString(36)}-${++sequence}`;
  return new Promise<CloudAsrResult>((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => finish(undefined, new DOMException("语音识别已取消", "AbortError"));
    const timeout = setTimeout(() => {
      finish(undefined, new Error("云端语音识别超时，请重试。"));
    }, 35_000);
    const finish = (result?: CloudAsrResult, error?: Error) => {
      if (!pending.delete(id)) return;
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      reader.onload = null;
      reader.onerror = null;
      if (reader.readyState === FileReader.LOADING) reader.abort();
      if (error) {
        try { bridge.cancel(id); } catch { /* best effort native cleanup */ }
        reject(error);
      } else if (result) resolve(result);
    };
    pending.set(id, { finish });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    reader.onerror = () => finish(undefined, new Error("无法读取语音数据。"));
    reader.onload = () => {
      try {
        const base64 = String(reader.result).split(",")[1];
        if (!base64) throw new Error("语音数据为空。");
        const result = JSON.parse(bridge.transcribe(id, base64)) as { ok: boolean; error?: string };
        if (!result.ok) finish(undefined, new Error(result.error || "无法启动云端语音识别。"));
      } catch (error) {
        finish(undefined, error instanceof Error ? error : new Error("无法启动云端语音识别。"));
      }
    };
    reader.readAsDataURL(wav);
  });
}

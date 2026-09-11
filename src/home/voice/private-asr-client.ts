import type {
  IAgoraRTCClient,
  ILocalAudioTrack,
} from "agora-rtc-sdk-ng";
import { requestPrivateAsrGrant } from "@/api/private-asr";
import {
  getEchoCancelledMicStream,
  nativePrivateAsrAvailable,
  NATIVE_AUDIO_EVENT,
  setNativePrivateAsrListening,
  startNativePrivateAsr,
  stopNativePrivateAsr,
  type NativeAudioEventDetail,
} from "./microphone";

const PRIVATE_ASR_PREFIX = "/private-asr";
const FINAL_TIMEOUT_MS = 12_000;

let agoraRuntimePromise: Promise<typeof import("agora-rtc-sdk-ng")> | null = null;

/** Start downloading the Agora runtime before a private-ASR session is ready.
 * The same promise is consumed by joinAgora(), so preloading never downloads
 * or initialises a second SDK instance. */
export function preloadPrivateAsrRuntime(): Promise<void> {
  // The APK owns Agora natively. Loading the 4 MB browser runtime on its old
  // WebView is both unnecessary and the source of the failed synthetic track.
  if (nativePrivateAsrAvailable()) return Promise.resolve();
  if (!agoraRuntimePromise) {
    agoraRuntimePromise = import("agora-rtc-sdk-ng").catch((error) => {
      agoraRuntimePromise = null;
      throw error;
    });
  }
  return agoraRuntimePromise.then(() => undefined);
}

async function getAgoraRuntime(): Promise<typeof import("agora-rtc-sdk-ng")> {
  await preloadPrivateAsrRuntime();
  return agoraRuntimePromise!;
}

interface PrivateAsrSessionResponse {
  sessionId: string;
  state: string;
  expiresAtMs: number;
  eventsWsPath: string;
  demoMode: boolean;
  agora: {
    appId: string;
    channel: string;
    uid: number;
    token: string;
  };
}

interface PrivateAsrEvent {
  type: string;
  sessionId?: string;
  text?: string;
  message?: string;
  state?: string;
  utteranceId?: string;
  seq?: number;
}

function parseSession(value: unknown): PrivateAsrSessionResponse {
  if (!value || typeof value !== "object") {
    throw new Error("Private ASR returned an invalid session");
  }
  const candidate = value as Partial<PrivateAsrSessionResponse>;
  const sessionId = candidate.sessionId;
  const agora = candidate.agora;
  if (
    typeof sessionId !== "string" ||
    !/^[A-Za-z0-9-]{1,128}$/.test(sessionId) ||
    candidate.eventsWsPath !== `/ws/client/${sessionId}` ||
    typeof candidate.expiresAtMs !== "number" ||
    candidate.expiresAtMs <= Date.now() ||
    typeof candidate.demoMode !== "boolean" ||
    !agora ||
    typeof agora.appId !== "string" ||
    !agora.appId ||
    typeof agora.channel !== "string" ||
    !agora.channel ||
    typeof agora.uid !== "number" ||
    !Number.isSafeInteger(agora.uid) ||
    typeof agora.token !== "string" ||
    !agora.token
  ) {
    throw new Error("Private ASR returned an invalid session");
  }
  return candidate as PrivateAsrSessionResponse;
}

type TranscriptWaiter = {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export function privateAsrEnabled(): boolean {
  return import.meta.env.VITE_PRIVATE_ASR_ENABLED === "true";
}

export function privateAsrHttpPath(upstreamPath: string): string {
  const normalized = upstreamPath.startsWith("/")
    ? upstreamPath
    : `/${upstreamPath}`;
  return `${PRIVATE_ASR_PREFIX}${normalized}`;
}

export function privateAsrWebSocketUrl(
  upstreamPath: string,
  locationLike: Pick<Location, "protocol" | "host"> = window.location,
): string {
  const scheme = locationLike.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${locationLike.host}${privateAsrHttpPath(upstreamPath)}`;
}

/** Keep the track publishable without sending microphone media before VAD
 * opens the speech window. Exported so the Agora ordering contract can be
 * regression-tested without starting a real RTC session. */
export async function publishPrivateAsrTrackMuted(
  client: Pick<IAgoraRTCClient, "publish">,
  audioTrack: ILocalAudioTrack,
): Promise<void> {
  await audioTrack.setMuted(true);
  await client.publish([audioTrack]);
}

export async function responseError(response: Response): Promise<Error> {
  const body = await response.json().catch(() => null) as
    | { error?: { code?: string; message?: string } }
    | null;
  if (body?.error?.code === "session_busy") {
    return new Error("语音服务正在使用中，你可以继续打字");
  }
  return new Error(
    body?.error?.message || `Private ASR request failed (${response.status})`,
  );
}

export class PrivateAsrClient {
  private session: PrivateAsrSessionResponse | null = null;
  private socket: WebSocket | null = null;
  private rtcClient: IAgoraRTCClient | null = null;
  private audioTrack: ILocalAudioTrack | null = null;
  private microphoneStream: MediaStream | null = null;
  private microphonePromise: Promise<MediaStream> | null = null;
  private nativeRtcActive = false;
  private finalQueue: string[] = [];
  private finalWaiter: TranscriptWaiter | null = null;
  private closed = false;
  private onConnectionError?: (error: Error) => void;

  constructor(onConnectionError?: (error: Error) => void) {
    this.onConnectionError = onConnectionError;
  }

  setConnectionErrorHandler(
    onConnectionError?: (error: Error) => void,
  ): void {
    this.onConnectionError = onConnectionError;
  }

  /** Whether an already-started transport can be handed to another Learn view. */
  isReusable(): boolean {
    return Boolean(
      !this.closed
      && this.session
      && this.socket?.readyState === WebSocket.OPEN
      && (this.session.demoMode || this.nativeRtcActive || this.rtcClient),
    );
  }

  async start(): Promise<void> {
    if (this.isReusable()) return;
    if (this.session) await this.stop();
    this.closed = false;
    // Permission acquisition and device setup are independent of the control
    // plane / Agora join. Start them immediately so public voice startup is
    // bounded by the slower branch instead of paying both costs serially.
    const useNativeRtc = nativePrivateAsrAvailable();
    const microphonePromise = useNativeRtc
      ? null
      : this.ensureMicrophoneStream();
    const { grant } = await requestPrivateAsrGrant();
    const response = await fetch(`${PRIVATE_ASR_PREFIX}/api/v1/sessions`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Authorization: `Bearer ${grant}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!response.ok) throw await responseError(response);
    const session = parseSession(await response.json());
    // stop() may have won while the session POST was in flight. The server
    // has already reserved its worker at this point, so release that exact
    // session instead of publishing it into an already-closed client.
    if (this.closed) {
      await this.releaseSession(session);
      throw new Error("Private ASR stopped during session startup");
    }
    this.session = session;

    try {
      await Promise.all([
        this.openEventSocket(session),
        session.demoMode
          ? Promise.resolve()
          : useNativeRtc
            ? this.joinNativeAgora(session)
            : this.joinAgora(session, microphonePromise!),
      ]);
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  getVadStream = async (): Promise<MediaStream> => {
    const stream = await this.ensureMicrophoneStream();
    return stream.clone();
  };

  async setListening(listening: boolean): Promise<void> {
    if (listening) this.finalQueue = [];
    if (this.nativeRtcActive) {
      const result = setNativePrivateAsrListening(listening);
      if (!result.ok) {
        throw new Error(result.error || "Android Agora 原生音频状态切换失败");
      }
      return;
    }
    // Keep the Agora track enabled (and therefore publishable) for the whole
    // session. VAD controls whether media is sent by muting/unmuting it.
    // Agora 4.24 rejects publish() for a disabled track.
    await this.audioTrack?.setMuted(!listening);
  }

  async commit(): Promise<string> {
    const session = this.session;
    if (!session || this.closed) throw new Error("Private ASR is not connected");
    if (this.finalWaiter) throw new Error("Private ASR already has a pending utterance");

    const queued = this.finalQueue.shift();
    if (queued) return queued;

    const transcript = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.finalWaiter?.timer === timer) this.finalWaiter = null;
        reject(new Error("Private ASR transcript timed out"));
      }, FINAL_TIMEOUT_MS);
      this.finalWaiter = { resolve, reject, timer };
    });
    const response = await fetch(
      privateAsrHttpPath(`/api/v1/sessions/${session.sessionId}/commit`),
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    if (!response.ok) {
      const error = await responseError(response);
      this.rejectWaiter(error);
      await transcript.catch(() => undefined);
      throw error;
    }
    return transcript;
  }

  async stop(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const session = this.session;
    this.rejectWaiter(new Error("Private ASR stopped"));
    this.finalQueue = [];
    this.socket?.close();
    this.socket = null;
    if (this.nativeRtcActive) {
      window.removeEventListener(NATIVE_AUDIO_EVENT, this.onNativeAudioEvent);
      stopNativePrivateAsr();
      this.nativeRtcActive = false;
    }
    try {
      await this.audioTrack?.setMuted(true);
    } catch {
      // The RTC client may already have disconnected.
    }
    this.audioTrack?.stop();
    this.audioTrack?.close();
    this.audioTrack = null;
    this.microphoneStream?.getTracks().forEach((track) => track.stop());
    this.microphoneStream = null;
    const pendingMicrophone = this.microphonePromise;
    this.microphonePromise = null;
    // A browser permission prompt can remain unanswered indefinitely. Do not
    // make transport teardown wait for it; ensureMicrophoneStream() and this
    // detached handler stop any stream that arrives after closure.
    void pendingMicrophone?.then((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    }).catch(() => undefined);
    if (this.rtcClient) await this.rtcClient.leave().catch(() => undefined);
    this.rtcClient = null;
    this.session = null;
    if (session) await this.releaseSession(session);
  }

  private async openEventSocket(session: PrivateAsrSessionResponse): Promise<void> {
    const socket = new WebSocket(privateAsrWebSocketUrl(session.eventsWsPath));
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Private ASR event connection timed out")),
        5_000,
      );
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Private ASR event connection failed"));
      }, { once: true });
    });
    socket.addEventListener("message", (event) => {
      try {
        this.handleEvent(JSON.parse(String(event.data)) as PrivateAsrEvent);
      } catch (error) {
        console.warn("[voice] ignored invalid private ASR event", error);
      }
    });
    socket.addEventListener("close", () => {
      if (!this.closed) {
        const error = new Error("Private ASR connection closed");
        this.rejectWaiter(error);
        this.onConnectionError?.(error);
      }
    });
  }

  private async ensureMicrophoneStream(): Promise<MediaStream> {
    const current = this.microphoneStream;
    if (current?.getAudioTracks().some((track) => track.readyState === "live")) {
      return current;
    }
    if (this.closed) throw new Error("Private ASR has stopped");
    if (!this.microphonePromise) {
      const microphonePromise = getEchoCancelledMicStream().then((stream) => {
        if (this.closed) {
          stream.getTracks().forEach((track) => track.stop());
          throw new Error("Private ASR stopped during microphone startup");
        }
        this.microphoneStream = stream;
        return stream;
      }).finally(() => {
        if (this.microphonePromise === microphonePromise) {
          this.microphonePromise = null;
        }
      });
      this.microphonePromise = microphonePromise;
    }
    return this.microphonePromise;
  }

  private async releaseSession(
    session: PrivateAsrSessionResponse,
  ): Promise<void> {
    await fetch(
      privateAsrHttpPath(`/api/v1/sessions/${session.sessionId}`),
      { method: "DELETE", credentials: "same-origin" },
    ).catch(() => undefined);
  }

  private async joinAgora(
    session: PrivateAsrSessionResponse,
    microphonePromise: Promise<MediaStream>,
  ): Promise<void> {
    const { default: AgoraRTC } = await getAgoraRuntime();
    AgoraRTC.setLogLevel(2);
    const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
    this.rtcClient = client;
    client.on("connection-state-change", (currentState) => {
      if (currentState === "DISCONNECTED" && !this.closed) {
        this.onConnectionError?.(new Error("Private ASR RTC disconnected"));
      }
    });
    await client.setClientRole("host");
    const [, stream] = await Promise.all([
      client.join(
        session.agora.appId,
        session.agora.channel,
        session.agora.token,
        session.agora.uid,
      ),
      microphonePromise,
    ]);
    const sourceTrack = stream.getAudioTracks()[0];
    if (!sourceTrack) throw new Error("Microphone did not provide an audio track");
    // Agora owns a clone, not the source used to create Silero's VAD clones.
    // Muting the published track must never mute the VAD stream itself.
    const mediaStreamTrack = sourceTrack.clone();
    const audioTrack = AgoraRTC.createCustomAudioTrack({
      mediaStreamTrack,
      encoderConfig: "speech_standard",
    });
    this.audioTrack = audioTrack;
    // A muted track remains enabled, so Agora accepts it in publish(), while
    // no microphone media is sent before Silero VAD opens the speech window.
    await publishPrivateAsrTrackMuted(client, audioTrack);
  }

  private async joinNativeAgora(
    session: PrivateAsrSessionResponse,
  ): Promise<void> {
    const result = startNativePrivateAsr(session.agora);
    if (!result.ok || !result.joined) {
      throw new Error(result.error || "Android Agora 原生音频频道未连接");
    }
    this.nativeRtcActive = true;
    window.addEventListener(NATIVE_AUDIO_EVENT, this.onNativeAudioEvent);
  }

  private readonly onNativeAudioEvent = (event: Event): void => {
    const detail = (event as CustomEvent<NativeAudioEventDetail>).detail;
    if (detail?.type !== "private-asr-error") return;
    const error = new Error(detail.message || "Android Agora 原生音频推送失败");
    this.rejectWaiter(error);
    this.onConnectionError?.(error);
  };

  private handleEvent(event: PrivateAsrEvent): void {
    if (event.type === "asr.final") {
      const text = event.text?.trim();
      if (text) {
        const waiter = this.finalWaiter;
        if (waiter) {
          this.finalWaiter = null;
          clearTimeout(waiter.timer);
          waiter.resolve(text);
        } else {
          this.finalQueue.push(text);
        }
      }
      this.acknowledge(event);
      return;
    }
    if (event.type === "asr.partial") {
      this.acknowledge(event);
      return;
    }
    if (event.type === "asr.error") {
      const error = new Error(event.message || "Private ASR failed");
      this.rejectWaiter(error);
      this.onConnectionError?.(error);
      return;
    }
    if (event.type === "session.expired" || event.type === "session.closed") {
      const error = new Error(
        event.type === "session.expired"
          ? "Private ASR session expired"
          : "Private ASR session closed",
      );
      this.rejectWaiter(error);
      this.onConnectionError?.(error);
    }
  }

  private acknowledge(event: PrivateAsrEvent): void {
    if (
      this.socket?.readyState !== WebSocket.OPEN ||
      !this.session ||
      !event.utteranceId ||
      event.seq === undefined
    ) return;
    this.socket.send(JSON.stringify({
      type: "client.result_ack",
      sessionId: this.session.sessionId,
      eventType: event.type,
      utteranceId: event.utteranceId,
      seq: event.seq,
    }));
  }

  private rejectWaiter(error: Error): void {
    const waiter = this.finalWaiter;
    if (!waiter) return;
    this.finalWaiter = null;
    clearTimeout(waiter.timer);
    waiter.reject(error);
  }
}

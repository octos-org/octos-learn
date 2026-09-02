import type {
  IAgoraRTCClient,
  ILocalAudioTrack,
} from "agora-rtc-sdk-ng";
import { requestPrivateAsrGrant } from "@/api/private-asr";
import { getEchoCancelledMicStream } from "./microphone";

const PRIVATE_ASR_PREFIX = "/private-asr";
const FINAL_TIMEOUT_MS = 12_000;

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

async function responseError(response: Response): Promise<Error> {
  const body = await response.json().catch(() => null) as
    | { error?: { message?: string } }
    | null;
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
  private finalQueue: string[] = [];
  private finalWaiter: TranscriptWaiter | null = null;
  private closed = false;
  private readonly onConnectionError?: (error: Error) => void;

  constructor(onConnectionError?: (error: Error) => void) {
    this.onConnectionError = onConnectionError;
  }

  async start(): Promise<void> {
    if (this.session) return;
    this.closed = false;
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
    this.session = session;

    try {
      await this.openEventSocket(session);
      if (!session.demoMode) await this.joinAgora(session);
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  getVadStream = async (): Promise<MediaStream> => {
    if (!this.microphoneStream) {
      throw new Error("Private ASR microphone is not ready");
    }
    return this.microphoneStream.clone();
  };

  async setListening(listening: boolean): Promise<void> {
    if (listening) this.finalQueue = [];
    await this.audioTrack?.setEnabled(listening);
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
    try {
      await this.audioTrack?.setEnabled(false);
    } catch {
      // The RTC client may already have disconnected.
    }
    this.audioTrack?.stop();
    this.audioTrack?.close();
    this.audioTrack = null;
    this.microphoneStream?.getTracks().forEach((track) => track.stop());
    this.microphoneStream = null;
    if (this.rtcClient) await this.rtcClient.leave().catch(() => undefined);
    this.rtcClient = null;
    this.session = null;
    if (session) {
      await fetch(
        privateAsrHttpPath(`/api/v1/sessions/${session.sessionId}`),
        { method: "DELETE", credentials: "same-origin" },
      ).catch(() => undefined);
    }
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

  private async joinAgora(session: PrivateAsrSessionResponse): Promise<void> {
    const { default: AgoraRTC } = await import("agora-rtc-sdk-ng");
    AgoraRTC.setLogLevel(2);
    const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
    this.rtcClient = client;
    client.on("connection-state-change", (currentState) => {
      if (currentState === "DISCONNECTED" && !this.closed) {
        this.onConnectionError?.(new Error("Private ASR RTC disconnected"));
      }
    });
    await client.setClientRole("host");
    await client.join(
      session.agora.appId,
      session.agora.channel,
      session.agora.token,
      session.agora.uid,
    );
    const stream = await getEchoCancelledMicStream();
    this.microphoneStream = stream;
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
    await audioTrack.setEnabled(false);
    await client.publish([audioTrack]);
  }

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

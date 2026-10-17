import type { Room, RemoteAudioTrack } from "livekit-client";
import { requestPrivateAsrGrant } from "@/api/private-asr";
import { getToken, getSelectedProfileId } from "@/api/client";
import { parseSession, privateAsrHttpPath, type PrivateAsrSessionResponse } from "./private-asr-client";

type Playback = {
  started: boolean;
  finish: () => void;
  fail: (error: Error) => void;
  start: () => void;
  cancel: () => void;
};

/** Receive-only LiveKit session: narration must never acquire a microphone. */
class PrivateTtsPlayer {
  session: PrivateAsrSessionResponse | null = null;
  room: Room | null = null;
  socket: WebSocket | null = null;
  elements: HTMLMediaElement[] = [];
  active: Playback | null = null;
  closed = false;
  timer: ReturnType<typeof setTimeout> | undefined;
  identity = `${getToken()}\0${getSelectedProfileId()}`;

  async connect(signal: AbortSignal): Promise<void> {
    if (this.session && this.socket?.readyState === WebSocket.OPEN && this.room?.state === "connected") return;
    const [runtime, { grant }] = await Promise.all([import("livekit-client"), requestPrivateAsrGrant()]);
    if (this.closed || signal.aborted) throw new Error("Private TTS cancelled");
    const response = await fetch(privateAsrHttpPath("/api/v1/sessions"), {
      method: "POST", credentials: "same-origin",
      headers: { Authorization: `Bearer ${grant}`, "Content-Type": "application/json" }, body: "{}", signal,
    });
    if (!response.ok) throw new Error(`Private TTS session failed (${response.status})`);
    const session = parseSession(await response.json());
    this.session = session;
    if (this.closed || signal.aborted) { this.close(); throw new Error("Private TTS cancelled"); }
    if (!session.livekit || session.demoMode) throw new Error("Private TTS requires a real LiveKit session");
    const room = new runtime.Room({ adaptiveStream: false, dynacast: false });
    this.room = room;
    room.on(runtime.RoomEvent.TrackSubscribed, (track) => {
      if (this.closed || track.kind !== "audio") return;
      const element = (track as RemoteAudioTrack).attach();
      this.elements.push(element);
      element.play().catch(() => this.active?.fail(new Error("Private TTS audio playback failed")));
    });
    room.on(runtime.RoomEvent.Disconnected, () => this.active?.fail(new Error("Private TTS RTC disconnected")));
    const socket = new WebSocket(new URL(session.eventsWsPath.replace(/^\//, "/private-asr/"), location.origin.replace(/^http/, "ws")));
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data)) as { type: string; sessionId?: string };
        if (message.sessionId && message.sessionId !== this.session?.sessionId) return;
        if (message.type === "tts.started") this.active?.start();
        if (message.type === "tts.finished") this.active?.finish();
        if (message.type === "tts.error" || message.type === "session.closed") this.active?.fail(new Error("Private TTS unavailable"));
      } catch { /* Ignore unrelated/malformed events. */ }
    });
    socket.addEventListener("close", () => this.active?.fail(new Error("Private TTS event socket closed")));
    await Promise.all([
      room.connect(session.livekit.url, session.livekit.token, { autoSubscribe: true }),
      new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => resolve(), { once: true });
        socket.addEventListener("error", () => reject(new Error("Private TTS socket failed")), { once: true });
        socket.addEventListener("close", () => reject(new Error("Private TTS socket closed")), { once: true });
      }),
    ]);
    if (this.closed || signal.aborted) { this.close(); throw new Error("Private TTS cancelled"); }
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.timer);
    this.active = null;
    this.socket?.close(); this.socket = null;
    void this.room?.disconnect().catch(() => undefined); this.room = null;
    this.elements.forEach(element => { element.pause(); element.srcObject = null; element.remove(); });
    this.elements = [];
    const session = this.session; this.session = null;
    if (session) void fetch(privateAsrHttpPath(`/api/v1/sessions/${session.sessionId}`), {
      method: "DELETE", credentials: "same-origin",
    }).catch(() => undefined);
  }
}

let player: PrivateTtsPlayer | null = null;

export function stopPrivateTts(): void { player?.active?.cancel(); player?.close(); player = null; }

export function playPrivateSpeech(
  text: string,
  onEnded: () => void,
  signal: AbortSignal,
  onPlaybackError: (error: Error) => void,
): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (text.length > 500) return Promise.reject(new Error("Private TTS text exceeds 500 characters"));
  const identity = `${getToken()}\0${getSelectedProfileId()}`;
  if (player?.closed || player?.identity !== identity || player?.active) { player?.active?.cancel(); player?.close(); player = null; }
  const current = player ?? new PrivateTtsPlayer(); player = current;
  clearTimeout(current.timer);
  return new Promise<boolean>((resolve, reject) => {
    const controller = new AbortController();
    let done = false;
    const startup = setTimeout(() => playback.fail(new Error("Private TTS startup timed out")), 5000);
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => { clearTimeout(startup); clearTimeout(watchdog); signal.removeEventListener("abort", abort); current.active = null; };
    const abort = () => {
      if (done) return;
      done = true; controller.abort(); cleanup(); current.close(); resolve(false);
    };
    const playback: Playback = {
      cancel: abort,
      started: false,
      start: () => {
        if (done || playback.started) return;
        playback.started = true; clearTimeout(startup); resolve(true);
        watchdog = setTimeout(() => playback.fail(new Error("Private TTS playback timed out")), 120_000);
      },
      finish: () => {
        if (done) return;
        done = true; cleanup(); resolve(playback.started);
        current.timer = setTimeout(() => current.close(), 120_000);
        if (playback.started) onEnded();
      },
      fail: (error) => {
        if (done) return;
        done = true; controller.abort(); cleanup(); current.close();
        if (playback.started) onPlaybackError(error); else reject(error);
      },
    };
    current.active = playback;
    signal.addEventListener("abort", abort, { once: true });
    void current.connect(controller.signal).then(async () => {
      if (done || signal.aborted || !current.session) return;
      const response = await fetch(privateAsrHttpPath(`/api/v1/sessions/${current.session.sessionId}/speak`), {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }), signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Private TTS synthesis failed (${response.status})`);
    }).catch(error => playback.fail(error instanceof Error ? error : new Error("Private TTS unavailable")));
  });
}

if (typeof window !== "undefined") window.addEventListener("crew:token_cleared", stopPrivateTts);

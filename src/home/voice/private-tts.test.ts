import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playPrivateSpeech, stopPrivateTts } from "./private-tts";

const mocks = vi.hoisted(() => ({ grant: vi.fn(), fetch: vi.fn(), connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}), token: "alice", rooms: [] as { handlers: Map<string, (track?: unknown) => void> }[] }));
vi.mock("@/api/client", () => ({ getToken: () => mocks.token, getSelectedProfileId: () => "profile" }));
vi.mock("@/api/private-asr", () => ({ requestPrivateAsrGrant: mocks.grant }));
vi.mock("./private-asr-client", () => ({
  parseSession: (session: unknown) => session,
  privateAsrHttpPath: (path: string) => `/private-asr${path}`,
}));
vi.mock("livekit-client", () => ({
  RoomEvent: { TrackSubscribed: "track", Disconnected: "disconnected" },
  Room: class {
    state = "connected";
    handlers = new Map<string, (track?: unknown) => void>();
    constructor() { mocks.rooms.push(this); }
    on(event: string, handler: (track?: unknown) => void) { this.handlers.set(event, handler); }
    connect = mocks.connect;
    disconnect = mocks.disconnect;
  },
}));

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  listeners = new Map<string, ((event?: { data: string }) => void)[]>();
  constructor() { Socket.instances.push(this); queueMicrotask(() => this.emit("open")); }
  addEventListener(event: string, fn: (event?: { data: string }) => void) {
    this.listeners.set(event, [...this.listeners.get(event) || [], fn]);
  }
  emit(event: string, data?: { data: string }) { this.listeners.get(event)?.forEach(fn => fn(data)); }
  message(type: string) { this.emit("message", { data: JSON.stringify({ type, sessionId: "session-1" }) }); }
  close() { this.readyState = 3; this.emit("close"); }
}

beforeEach(() => {
  mocks.grant.mockReset(); mocks.grant.mockResolvedValue({ grant: "one-use-grant" });
  mocks.fetch.mockReset(); mocks.connect.mockClear(); mocks.disconnect.mockClear(); mocks.rooms.length = 0;
  mocks.token = "alice"; Socket.instances.length = 0;
  mocks.fetch.mockImplementation(async url => {
    if (String(url).endsWith("/sessions")) return new Response(JSON.stringify({
      sessionId: "session-1", eventsWsPath: "/ws/client/session-1", demoMode: false,
      livekit: { url: "wss://rtc.example.test", token: "rtc-token" },
    }));
    return new Response("{}", { status: 202 });
  });
  vi.stubGlobal("WebSocket", Socket); vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => { stopPrivateTts(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function ready() {
  await vi.waitFor(() => expect(mocks.fetch.mock.calls.some(([url]) => String(url).endsWith("/speak"))).toBe(true));
  return Socket.instances.at(-1)!;
}

describe("private LiveKit narration", () => {
  it("creates a receive-only session and plays/finishes one narration", async () => {
    const ended = vi.fn(); const error = vi.fn();
    const promise = playPrivateSpeech("私有语音", ended, new AbortController().signal, error);
    const socket = await ready();
    expect(mocks.connect).toHaveBeenCalledWith("wss://rtc.example.test", "rtc-token", { autoSubscribe: true });
    const audio = { play: vi.fn(async () => {}), pause: vi.fn(), remove: vi.fn(), srcObject: {} };
    mocks.rooms[0].handlers.get("track")?.({ kind: "audio", attach: () => audio });
    expect(audio.play).toHaveBeenCalledOnce();
    socket.message("tts.started"); await expect(promise).resolves.toBe(true);
    socket.message("tts.finished"); expect(ended).toHaveBeenCalledOnce(); expect(error).not.toHaveBeenCalled();
    // No microphone creation or audio publication API exists in this player.
    expect(mocks.fetch.mock.calls.filter(([url]) => String(url).endsWith("/speak"))).toHaveLength(1);
  });
  it("reuses a warm session for the next narration", async () => {
    const signal = new AbortController().signal;
    const first = playPrivateSpeech("第一句", vi.fn(), signal, vi.fn());
    const socket = await ready(); socket.message("tts.started"); await first; socket.message("tts.finished");
    const second = playPrivateSpeech("第二句", vi.fn(), signal, vi.fn());
    await vi.waitFor(() => expect(mocks.fetch.mock.calls.filter(([url]) => String(url).endsWith("/speak"))).toHaveLength(2));
    socket.message("tts.started"); await second; socket.message("tts.finished");
    expect(mocks.grant).toHaveBeenCalledOnce(); expect(mocks.connect).toHaveBeenCalledOnce();
  });
  it("rejects unavailable synthesis before playback so the caller can fall back", async () => {
    const promise = playPrivateSpeech("错误", vi.fn(), new AbortController().signal, vi.fn());
    const assertion = expect(promise).rejects.toThrow("unavailable");
    const socket = await ready(); socket.message("tts.error"); await assertion;
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });
  it("reports a mid-playback disconnect for cloud fallback", async () => {
    const error = vi.fn(); const ended = vi.fn();
    const promise = playPrivateSpeech("错误", ended, new AbortController().signal, error);
    const socket = await ready(); socket.message("tts.started"); await promise;
    socket.close(); expect(error).toHaveBeenCalledOnce(); expect(ended).not.toHaveBeenCalled();
  });
  it("cancels without replay or a spurious completion callback", async () => {
    const controller = new AbortController(); const ended = vi.fn(); const error = vi.fn();
    const promise = playPrivateSpeech("取消", ended, controller.signal, error);
    const socket = await ready(); controller.abort(); socket.message("tts.finished");
    await expect(promise).resolves.toBe(false);
    expect(ended).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
    expect(mocks.fetch.mock.calls.some(([, options]) => options.method === "DELETE")).toBe(true);
  });
  it("times out a stalled session and releases it", async () => {
    vi.useFakeTimers(); mocks.connect.mockImplementationOnce(() => new Promise(() => {}));
    const promise = playPrivateSpeech("等待", vi.fn(), new AbortController().signal, vi.fn());
    const assertion = expect(promise).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(5001); await assertion;
  });
  it("does not pass a session across accounts", async () => {
    const signal = new AbortController().signal;
    const first = playPrivateSpeech("第一句", vi.fn(), signal, vi.fn());
    const socket = await ready(); socket.message("tts.started"); await first; socket.message("tts.finished");
    mocks.token = "bob";
    const second = playPrivateSpeech("第二句", vi.fn(), signal, vi.fn());
    await vi.waitFor(() => expect(mocks.fetch.mock.calls.filter(([url]) => String(url).endsWith("/speak"))).toHaveLength(2));
    Socket.instances.at(-1)?.message("tts.started"); await second;
  });
});

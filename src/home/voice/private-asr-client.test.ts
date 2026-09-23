import { afterEach, describe, expect, it, vi } from "vitest";
import type { IAgoraRTCClient, ILocalAudioTrack } from "agora-rtc-sdk-ng";
import type { LocalAudioTrack, Room } from "livekit-client";
import {
  parseSession,
  PrivateAsrClient,
  privateAsrHttpPath,
  privateAsrWebSocketUrl,
  publishLiveKitTrackMuted,
  publishPrivateAsrTrackMuted,
  responseError,
} from "./private-asr-client";

const { microphoneMock, requestGrantMock } = vi.hoisted(() => ({
  microphoneMock: vi.fn(),
  requestGrantMock: vi.fn(async () => ({ grant: "test-grant" })),
}));

vi.mock("./microphone", () => ({
  getEchoCancelledMicStream: microphoneMock,
  nativePrivateAsrAvailable: vi.fn(() => false),
  NATIVE_AUDIO_EVENT: "octos-native-audio",
  setNativePrivateAsrListening: vi.fn(() => ({ ok: true })),
  startNativePrivateAsr: vi.fn(() => ({ ok: true, joined: true })),
  stopNativePrivateAsr: vi.fn(),
}));

vi.mock("@/api/private-asr", () => ({
  requestPrivateAsrGrant: requestGrantMock,
}));

describe("private ASR same-origin routing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    microphoneMock.mockReset();
    requestGrantMock.mockClear();
  });

  it("explains a busy slot without disabling text input", async () => {
    const response = new Response(JSON.stringify({
      error: {
        code: "session_busy",
        message: "The ASR worker is at its single-session capacity",
      },
    }), { status: 409 });
    expect((await responseError(response)).message).toBe(
      "语音服务正在使用中，你可以继续打字",
    );
  });

  it("prefixes upstream HTTP paths exactly once", () => {
    expect(privateAsrHttpPath("/api/v1/sessions/abc/commit")).toBe(
      "/private-asr/api/v1/sessions/abc/commit",
    );
    expect(privateAsrHttpPath("ws/client/abc")).toBe(
      "/private-asr/ws/client/abc",
    );
  });

  it("uses a secure same-origin WebSocket on HTTPS", () => {
    expect(privateAsrWebSocketUrl("/ws/client/abc", {
      protocol: "https:",
      host: "learn.example.com",
    })).toBe("wss://learn.example.com/private-asr/ws/client/abc");
  });

  it("mutes an enabled track before publishing instead of disabling it", async () => {
    const order: string[] = [];
    const audioTrack = {
      setMuted: vi.fn(async (muted: boolean) => {
        order.push(`mute:${muted}`);
      }),
      setEnabled: vi.fn(),
    } as unknown as ILocalAudioTrack;
    const client = {
      publish: vi.fn(async () => {
        order.push("publish");
      }),
    } as unknown as Pick<IAgoraRTCClient, "publish">;

    await publishPrivateAsrTrackMuted(client, audioTrack);

    expect(order).toEqual(["mute:true", "publish"]);
    expect(audioTrack.setEnabled).not.toHaveBeenCalled();
    expect(client.publish).toHaveBeenCalledWith([audioTrack]);
  });

  it("mutes a LiveKit track before publishing it", async () => {
    const order: string[] = [];
    const track = {
      mute: vi.fn(async () => {
        order.push("mute");
      }),
    } as unknown as LocalAudioTrack;
    const room = {
      localParticipant: {
        publishTrack: vi.fn(async (t: unknown, options?: unknown) => {
          order.push("publish");
          return { track: t, options };
        }),
      },
    } as unknown as Pick<Room, "localParticipant">;

    await publishLiveKitTrackMuted(room, track);

    expect(order).toEqual(["mute", "publish"]);
    expect(track.mute).toHaveBeenCalledOnce();
    expect(room.localParticipant.publishTrack).toHaveBeenCalledWith(track, {
      name: "microphone",
    });
  });

  it("parses a valid LiveKit session", () => {
    const session = parseSession({
      sessionId: "session-lk-1",
      state: "ready",
      expiresAtMs: Date.now() + 60_000,
      eventsWsPath: "/ws/client/session-lk-1",
      demoMode: false,
      rtcProvider: "livekit",
      livekit: {
        url: "wss://rtc.pitun.cc:9443",
        room: "asr-session-lk-1",
        token: "eyJhbGciOi...",
        identity: "client-1001",
      },
    });
    expect(session.sessionId).toBe("session-lk-1");
    expect(session.rtcProvider).toBe("livekit");
    expect(session.livekit?.url).toBe("wss://rtc.pitun.cc:9443");
    expect(session.livekit?.room).toBe("asr-session-lk-1");
    expect(session.livekit?.token).toBe("eyJhbGciOi...");
    expect(session.livekit?.identity).toBe("client-1001");
  });

  it("parses a valid Agora session for backwards compatibility", () => {
    const session = parseSession({
      sessionId: "session-agora-1",
      state: "ready",
      expiresAtMs: Date.now() + 60_000,
      eventsWsPath: "/ws/client/session-agora-1",
      demoMode: false,
      agora: {
        appId: "test-app-id",
        channel: "test-channel",
        uid: 12345,
        token: "test-token",
      },
    });
    expect(session.sessionId).toBe("session-agora-1");
    expect(session.agora?.appId).toBe("test-app-id");
    expect(session.agora?.channel).toBe("test-channel");
    expect(session.agora?.uid).toBe(12345);
    expect(session.agora?.token).toBe("test-token");
  });

  it("rejects sessions missing both LiveKit and Agora credentials", () => {
    expect(() => parseSession({
      sessionId: "session-none",
      state: "ready",
      expiresAtMs: Date.now() + 60_000,
      eventsWsPath: "/ws/client/session-none",
      demoMode: false,
    })).toThrow("Private ASR returned an invalid session");
  });

  it("rejects expired or malformed sessions", () => {
    expect(() => parseSession({
      sessionId: "session-expired",
      state: "ready",
      expiresAtMs: Date.now() - 1000,
      eventsWsPath: "/ws/client/session-expired",
      demoMode: false,
      livekit: {
        url: "wss://rtc.pitun.cc:9443",
        room: "asr-session-lk-1",
        token: "eyJhbGciOi...",
      },
    })).toThrow("Private ASR returned an invalid session");

    expect(() => parseSession(null)).toThrow("Private ASR returned an invalid session");
  });

  it("releases a session created after stop wins the startup race", async () => {
    microphoneMock.mockReturnValue(new Promise<MediaStream>(() => {}));
    let finishSessionRequest!: (response: Response) => void;
    const sessionResponse = new Promise<Response>((resolve) => {
      finishSessionRequest = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return sessionResponse;
      if (init?.method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      throw new Error(`Unexpected private ASR request: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new PrivateAsrClient();
    const starting = client.start();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    await client.stop();
    finishSessionRequest(new Response(JSON.stringify({
      sessionId: "session-after-stop",
      state: "ready",
      expiresAtMs: Date.now() + 60_000,
      eventsWsPath: "/ws/client/session-after-stop",
      demoMode: true,
      agora: {
        appId: "app-id",
        channel: "channel",
        uid: 1,
        token: "agora-token",
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(starting).rejects.toThrow("stopped during session startup");
    expect(fetchMock).toHaveBeenCalledWith(
      "/private-asr/api/v1/sessions/session-after-stop",
      { method: "DELETE", credentials: "same-origin" },
    );
  });

  it("releases a LiveKit session created after stop wins the startup race", async () => {
    microphoneMock.mockReturnValue(new Promise<MediaStream>(() => {}));
    let finishSessionRequest!: (response: Response) => void;
    const sessionResponse = new Promise<Response>((resolve) => {
      finishSessionRequest = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return sessionResponse;
      if (init?.method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      throw new Error(`Unexpected private ASR request: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new PrivateAsrClient();
    const starting = client.start();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    await client.stop();
    finishSessionRequest(new Response(JSON.stringify({
      sessionId: "session-lk-after-stop",
      state: "ready",
      expiresAtMs: Date.now() + 60_000,
      eventsWsPath: "/ws/client/session-lk-after-stop",
      demoMode: false,
      rtcProvider: "livekit",
      livekit: {
        url: "wss://rtc.pitun.cc:9443",
        room: "asr-session-lk-after-stop",
        token: "livekit-token",
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(starting).rejects.toThrow("stopped during session startup");
    expect(fetchMock).toHaveBeenCalledWith(
      "/private-asr/api/v1/sessions/session-lk-after-stop",
      { method: "DELETE", credentials: "same-origin" },
    );
  });
});


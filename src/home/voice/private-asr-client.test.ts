import { afterEach, describe, expect, it, vi } from "vitest";
import type { IAgoraRTCClient, ILocalAudioTrack } from "agora-rtc-sdk-ng";
import {
  PrivateAsrClient,
  privateAsrHttpPath,
  privateAsrWebSocketUrl,
  publishPrivateAsrTrackMuted,
  responseError,
} from "./private-asr-client";

const { microphoneMock, requestGrantMock } = vi.hoisted(() => ({
  microphoneMock: vi.fn(),
  requestGrantMock: vi.fn(async () => ({ grant: "test-grant" })),
}));

vi.mock("./microphone", () => ({
  getEchoCancelledMicStream: microphoneMock,
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
});

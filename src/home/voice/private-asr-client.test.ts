import { describe, expect, it, vi } from "vitest";
import type { IAgoraRTCClient, ILocalAudioTrack } from "agora-rtc-sdk-ng";
import {
  privateAsrHttpPath,
  privateAsrWebSocketUrl,
  publishPrivateAsrTrackMuted,
} from "./private-asr-client";

describe("private ASR same-origin routing", () => {
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
});

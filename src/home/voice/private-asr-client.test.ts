import { describe, expect, it } from "vitest";
import {
  privateAsrHttpPath,
  privateAsrWebSocketUrl,
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
});

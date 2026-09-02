import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestPrivateAsrGrant } from "./private-asr";
import { request } from "./client";

vi.mock("./client", () => ({ request: vi.fn() }));

describe("requestPrivateAsrGrant", () => {
  beforeEach(() => vi.mocked(request).mockReset());

  it("uses the authenticated Octos grant endpoint without browser secrets", async () => {
    vi.mocked(request).mockResolvedValue({
      grant: "one-time-grant",
      expiresAtMs: 42,
    });

    await expect(requestPrivateAsrGrant()).resolves.toEqual({
      grant: "one-time-grant",
      expiresAtMs: 42,
    });
    expect(request).toHaveBeenCalledWith("/api/private-asr/grant", {
      method: "POST",
      body: "{}",
    });
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = readFileSync("deploy/nginx/octos-learn.conf.example", "utf8");

describe("public Nginx routing", () => {
  it("keeps authenticated file URLs ahead of static extension regexes", () => {
    // An ordinary prefix loses to the .jpg/.png static regex even when the
    // request is /api/files/<opaque handle>/frame.jpg. ^~ prevents that.
    expect(config).toMatch(/location\s+\^~\s+\/api\/\s*\{/);
    expect(config).not.toMatch(/location\s+\/api\/\s*\{/);
    expect(config).toMatch(/location\s+\^~\s+\/private-asr\/\s*\{/);
  });

  it("retains the exact OTP rate-limited route and VAD module MIME type", () => {
    expect(config).toMatch(/location = \/api\/auth\/send-code\s*\{/);
    expect(config).toContain("limit_req zone=octos_otp_send");
    expect(config).toContain("default_type application/javascript;");
  });
});

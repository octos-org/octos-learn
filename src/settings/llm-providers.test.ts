import { describe, it, expect } from "vitest";
import {
  buildCredentialEnvPatch,
  findProvider,
  providersForDeployment,
  showsBaseUrl,
  usesJsonCredential,
} from "./llm-providers";

describe("vertex provider entry", () => {
  it("is registered and uses a JSON credential", () => {
    const vertex = findProvider("vertex");
    expect(vertex).toBeDefined();
    expect(vertex?.envKey).toBe("VERTEX_SA_JSON");
    expect(usesJsonCredential(vertex)).toBe(true);
  });

  it("is hidden from public Linux builds without removing local Vertex support", () => {
    expect(providersForDeployment(false).some((provider) => provider.id === "vertex"))
      .toBe(true);
    expect(providersForDeployment(true).some((provider) => provider.id === "vertex"))
      .toBe(false);
  });

  it("treats normal providers as single-line API keys", () => {
    expect(usesJsonCredential(findProvider("openai"))).toBe(false);
    expect(usesJsonCredential(findProvider("google"))).toBe(false);
  });
});

describe("moonshot provider entry", () => {
  it("defaults to the China endpoint and allows editing the base URL", () => {
    const moonshot = findProvider("moonshot");
    expect(moonshot?.defaultBaseUrl).toBe("https://api.moonshot.cn/v1");
    expect(showsBaseUrl(moonshot!)).toBe(true);
  });
});

describe("buildCredentialEnvPatch", () => {
  const vertex = findProvider("vertex");
  const openai = findProvider("openai");

  it("overlays the JSON onto existing env vars", () => {
    const patch = buildCredentialEnvPatch(
      vertex,
      { OPENAI_API_KEY: "abcd***xyz" },
      '{"project_id":"p"}',
    );
    expect(patch).toEqual({
      OPENAI_API_KEY: "abcd***xyz",
      VERTEX_SA_JSON: '{"project_id":"p"}',
    });
  });

  it("returns undefined for a blank input (keep what's stored)", () => {
    expect(buildCredentialEnvPatch(vertex, {}, "   ")).toBeUndefined();
  });

  it("returns undefined for non-JSON providers", () => {
    expect(buildCredentialEnvPatch(openai, {}, '{"x":1}')).toBeUndefined();
  });
});

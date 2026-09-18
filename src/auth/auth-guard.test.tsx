import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthGuard } from "./auth-guard";
import { resetEmbeddedCoursePackCatalogCache } from "@/learning/course-pack/course-pack-catalog";

const authMocks = vi.hoisted(() => ({
  token: null as string | null,
  loading: false,
}));

vi.mock("./auth-context", () => ({
  useAuth: () => ({ token: authMocks.token, loading: authMocks.loading }),
}));

function LoginProbe() {
  const location = useLocation();
  return (
    <div data-testid="login-probe">{location.pathname + location.search}</div>
  );
}

function renderGuard(initialPath: string) {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<LoginProbe />} />
        <Route element={<AuthGuard />}>
          <Route path="/" element={<div>home page</div>} />
          <Route path="/chat" element={<div>chat page</div>} />
          <Route path="/board" element={<div>board page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AuthGuard", () => {
  afterEach(() => {
    cleanup();
    authMocks.token = null;
    authMocks.loading = false;
    resetEmbeddedCoursePackCatalogCache();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("bounces unauthenticated deep links to /login with the destination preserved", () => {
    renderGuard("/chat?topic=design");
    expect(screen.getByTestId("login-probe").textContent).toBe(
      `/login?redirect=${encodeURIComponent("/chat?topic=design")}`,
    );
  });

  it("bounces the home path without a redundant redirect param", () => {
    renderGuard("/");
    expect(screen.getByTestId("login-probe").textContent).toBe("/login");
  });

  it("renders the protected route when a token is present", () => {
    authMocks.token = "tok";
    renderGuard("/chat");
    expect(screen.getByText("chat page")).toBeTruthy();
  });

  it("allows an embedded course through without a token", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/course-packs/embedded/catalog.json")) {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          generatedAt: "2026-09-18T00:00:00Z",
          packs: [{
            packId: "grade-3-math",
            version: "1.0.0",
            title: "三年级数学",
            description: "一门互动课",
            locale: "zh-CN",
            subject: "mathematics",
            grade: "三年级",
            durationSeconds: 180,
            minimumPlayerVersion: "0.1.0",
            archiveSha256: "a".repeat(64),
            archiveBytes: 1000,
            recommended: true,
            archiveUrl: "/api/learn/course-packs/grade-3-math/1.0.0/archive.ocpack",
            manifestUrl: "/api/learn/course-packs/grade-3-math/1.0.0/manifest.json",
            thumbnailUrl: "/api/learn/course-packs/grade-3-math/1.0.0/files/thumbnail.webp",
            capabilities: {
              offlinePlayback: true,
              offlineNarration: true,
              interactiveWhiteboard: true,
              liveAi: "none",
            },
          }],
        }), { status: 200 });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderGuard("/board?course-pack=grade-3-math&course-version=1.0.0");
    expect(await screen.findByText("board page")).toBeTruthy();
  });

  it("still protects blank boards without a token", () => {
    renderGuard("/board?new-board=1");
    expect(screen.getByTestId("login-probe").textContent).toContain("/login?redirect=");
  });
});

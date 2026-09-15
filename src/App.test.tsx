import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "./App";
vi.mock("./settings/settings-api", () => ({
  getMyProfile: vi.fn(async () => ({
    id: "configured",
    config: {
      env_vars: {},
      llm: {
        primary: { family_id: "google", model_id: "test" },
        fallbacks: [],
      },
    },
  })),
}));

beforeEach(() => {
  localStorage.setItem("octos-learn:setup-skipped:configured", "yes");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

vi.mock("./auth/auth-guard", () => ({
  AuthGuard: () => <Outlet />,
}));

vi.mock("./auth/login-page", () => ({
  LoginPage: () => <div>login-page</div>,
}));

vi.mock("./learning/learning-page", () => ({
  LearningPage: () => <div>learning-page</div>,
}));

vi.mock("./learning/course-launcher", () => ({
  CourseLauncher: () => <div>course-launcher</div>,
}));

vi.mock("./settings/settings-page", () => ({
  AdminSettingsPage: () => <div>settings-page</div>,
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}{location.search}
    </output>
  );
}

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("Octos Learn routes", () => {
  it("opens the shared course launcher at the product root", async () => {
    renderRoute("/");
    expect(await screen.findByText("course-launcher")).toBeTruthy();
  });

  it("opens the learning canvas through the new board route", async () => {
    renderRoute("/board");
    expect(await screen.findByText("learning-page")).toBeTruthy();
  });

  it("keeps old /learn links working through the board route", async () => {
    renderRoute("/learn?oll-fixture=geometry-v2");
    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe(
        "/board?oll-fixture=geometry-v2",
      );
    });
    expect(screen.getByText("learning-page")).toBeTruthy();
  });

  it("preserves old root CoursePack deep links", async () => {
    renderRoute("/?course-pack=contract-smoke");
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(
      "/board?course-pack=contract-smoke",
    ));
    expect(screen.getByText("learning-page")).toBeTruthy();
  });

  it("opens a version-pinned catalog course on the existing board", async () => {
    renderRoute("/course/grade-3-math?version=1.0.0");
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(
      "/board?course-pack=grade-3-math&course-version=1.0.0&course-mode=preview",
    ));
  });

  it("preserves an explicit interactive course instance", async () => {
    renderRoute("/course/grade-3-math?version=1.0.0&title=%E6%95%B0%E5%AD%A6&mode=learn&instance=learn-123-abc");
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(
      "/board?course-pack=grade-3-math&course-version=1.0.0&course-mode=learn&course-title=%E6%95%B0%E5%AD%A6&course-instance=learn-123-abc",
    ));
  });

  it("retains login and settings", () => {
    const login = renderRoute("/login");
    expect(screen.getByText("login-page")).toBeTruthy();
    login.unmount();

    renderRoute("/settings?tab=skills");
    expect(screen.getByText("settings-page")).toBeTruthy();
  });

  it("does not expose inherited product routes", async () => {
    renderRoute("/slides");
    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe("/");
    });
    expect(screen.getByText("course-launcher")).toBeTruthy();
  });
});

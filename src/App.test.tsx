import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "./App";

afterEach(() => cleanup());

vi.mock("./auth/auth-guard", () => ({
  AuthGuard: () => <Outlet />,
}));

vi.mock("./auth/login-page", () => ({
  LoginPage: () => <div>login-page</div>,
}));

vi.mock("./learning/learning-page", () => ({
  LearningPage: () => <div>learning-page</div>,
}));

vi.mock("./settings/settings-page", () => ({
  AdminSettingsPage: () => <div>settings-page</div>,
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
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
  it("opens the learning canvas at the product root", () => {
    renderRoute("/");
    expect(screen.getByText("learning-page")).toBeTruthy();
  });

  it("keeps old /learn links working through the product root", async () => {
    renderRoute("/learn");
    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe("/");
    });
    expect(screen.getByText("learning-page")).toBeTruthy();
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
    expect(screen.getByText("learning-page")).toBeTruthy();
  });
});

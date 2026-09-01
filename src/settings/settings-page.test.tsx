import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminSettingsPage } from "./settings-page";

const apiMocks = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  portal: {
    accessible_profiles: [] as Array<{ id: string; name: string }>,
    can_access_admin_portal: true,
    home_profile_id: "",
  },
}));

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({
    portal: authMocks.portal,
  }),
}));

vi.mock("@/hooks/use-theme", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

vi.mock("./settings-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./settings-api")>();
  return { ...actual, ...apiMocks };
});

describe("AdminSettingsPage", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    apiMocks.getMyProfile.mockReset();
    apiMocks.getMyProfile.mockResolvedValue(null);
    authMocks.portal.can_access_admin_portal = true;
    authMocks.portal.accessible_profiles = [];
  });

  it("keeps self-service settings scoped to the authenticated profile", async () => {
    authMocks.portal.accessible_profiles = [
      { id: "profile-a", name: "Profile A" },
      { id: "profile-b", name: "Profile B" },
    ];

    render(
      <MemoryRouter>
        <AdminSettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(apiMocks.getMyProfile).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("keeps the Authentication menu icon visible beside the admin badge", async () => {
    render(
      <MemoryRouter>
        <AdminSettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /authentication/i })).toBeTruthy();
    });
    const button = screen.getByRole("button", { name: /authentication/i });
    const icon = button.querySelector("svg");

    expect(icon?.classList.contains("shrink-0")).toBe(true);
  });

  it("falls back to Profile when a non-admin deep-links to Authentication", async () => {
    authMocks.portal.can_access_admin_portal = false;
    render(
      <MemoryRouter initialEntries={["/settings?tab=authentication"]}>
        <AdminSettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/no profile available/i)).toBeTruthy();
    });
    expect(
      screen.getByRole("button", { name: "Profile" }).getAttribute("data-active"),
    ).toBe("true");
    expect(
      screen.queryByRole("button", { name: /authentication/i }),
    ).toBeNull();
  });

  it("exposes only settings required by Octos Learn", async () => {
    render(
      <MemoryRouter>
        <AdminSettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Personal")).toBeTruthy();
    });
    expect(screen.getByText("Learning")).toBeTruthy();
    expect(screen.getByText("Access")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Voice" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Learning Companion" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "LLM" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "API Keys" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skills" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Smart Home" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Channels" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Schedule" })).toBeNull();
  });

  it("restores the learning companion picker without requiring profile data", async () => {
    render(
      <MemoryRouter initialEntries={["/settings?tab=companion"]}>
        <AdminSettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Learning Companion" })).toBeTruthy();
    });
    expect(screen.getByTestId("teacher-skin-ocean")).toBeTruthy();
    expect(screen.getByTestId("teacher-skin-bee-3d")).toBeTruthy();

    fireEvent.click(screen.getByTestId("teacher-skin-bee-3d"));
    expect(screen.getByTestId("teacher-skin-bee-3d").getAttribute("aria-pressed"))
      .toBe("true");
    expect(localStorage.getItem("octos-teacher-skin")).toBe("bee-3d");
  });

  it("filters tabs by the search box", async () => {
    render(
      <MemoryRouter>
        <AdminSettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "LLM" })).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId("settings-tab-search"), {
      target: { value: "llm" },
    });

    expect(screen.getByRole("button", { name: "LLM" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Profile" })).toBeNull();
    // Group headers disappear while searching.
    expect(screen.queryByText("Personal")).toBeNull();
  });

  it("shows an empty state when the search matches nothing", async () => {
    render(
      <MemoryRouter>
        <AdminSettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("settings-tab-search")).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId("settings-tab-search"), {
      target: { value: "zzz-nothing" },
    });

    expect(screen.getByText(/no settings match/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Profile" })).toBeNull();
  });
});

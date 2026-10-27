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
      screen.getByRole("button", { name: "我的老师" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "LLM" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "API Keys" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Skills" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Smart Home" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Channels" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Schedule" })).toBeNull();
  });

  it("does not expose the removed Skills page through its old deep link", async () => {
    render(
      <MemoryRouter initialEntries={["/settings?tab=skills"]}>
        <AdminSettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/no profile available/i)).toBeTruthy();
    });
    expect(
      screen.getByRole("button", { name: "Profile" }).getAttribute("data-active"),
    ).toBe("true");
    expect(screen.queryByRole("button", { name: "Skills" })).toBeNull();
  });

  it("shows the teachers under 我的老师, also from the old companion link, without the old avatars", async () => {
    render(
      <MemoryRouter initialEntries={["/settings?tab=companion"]}>
        <AdminSettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 3, name: "我的老师" })).toBeTruthy();
    });
    for (const name of ["阿澜", "窦鸢", "苏绯"]) expect(screen.getByRole("heading", { level: 2, name })).toBeTruthy();
    expect(screen.queryByTestId("teacher-skin-ocean")).toBeNull();
    expect(screen.queryByTestId("teacher-skin-bee-3d")).toBeNull();

    fireEvent.click(screen.getByTestId("teacher-sufei"));
    expect(screen.getByTestId("teacher-sufei").textContent).toContain("正在陪你上课");
    expect(localStorage.getItem("octos-teacher-skin")).toBe("portrait");

    // The learning-record switches sit under 高级选项, collapsed at first.
    const advanced = screen.getByText("高级选项").closest("details");
    expect(advanced?.open).toBe(false);
    expect(advanced?.querySelectorAll("input[type=checkbox]")).toHaveLength(4);
    fireEvent.click(screen.getByText("高级选项"));
    expect(advanced?.open).toBe(true);
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

  it("groups Voice with LLM under Learning rather than Personal", async () => {
    render(<MemoryRouter><AdminSettingsPage /></MemoryRouter>);
    await screen.findByRole("button", { name: "Voice" });
    fireEvent.change(screen.getByTestId("settings-tab-search"), { target: { value: "learning" } });
    expect(screen.getByRole("button", { name: "Voice" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "LLM" })).toBeTruthy();
    fireEvent.change(screen.getByTestId("settings-tab-search"), { target: { value: "personal" } });
    expect(screen.queryByRole("button", { name: "Voice" })).toBeNull();
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

  it("renders Developer Options tab via direct link and toggles debug mode", async () => {
    render(
      <MemoryRouter initialEntries={["/settings?tab=developer"]}>
        <AdminSettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Developer Options/i })).toBeTruthy();
    });

    const toggle = screen.getByTestId("toggle-debug-mode");
    expect(toggle).toBeTruthy();

    fireEvent.click(toggle);

    const stored = JSON.parse(localStorage.getItem("octos_debug_settings") || "{}");
    expect(typeof stored.debugMode).toBe("boolean");
  });

  it("matches Developer Options tab when searching for 'debug' or '调试'", async () => {
    render(
      <MemoryRouter>
        <AdminSettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("settings-tab-search")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("settings-tab-search"), {
      target: { value: "debug" },
    });

    expect(screen.getByRole("button", { name: /Developer Options/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Profile" })).toBeNull();
  });
});

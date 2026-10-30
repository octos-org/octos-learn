import { tr } from "@/i18n";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthStatusResponse } from "@/api/types";
import { LoginPage } from "./login-page";

const authMocks = vi.hoisted(() => ({
  authStatus: null as AuthStatusResponse | null,
  login: vi.fn(),
  loginWithToken: vi.fn(),
  soloLogin: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  status: vi.fn(),
}));

vi.mock("./auth-context", () => ({
  useAuth: () => ({
    authStatus: authMocks.authStatus,
    login: authMocks.login,
    loginWithToken: authMocks.loginWithToken,
    soloLogin: authMocks.soloLogin,
  }),
}));

vi.mock("@/api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/auth")>()),
  status: apiMocks.status,
}));

function renderLogin(allowSelfRegistration: boolean) {
  authMocks.authStatus = {
    bootstrap_mode: false,
    email_login_enabled: true,
    admin_token_login_enabled: false,
    allow_self_registration: allowSelfRegistration,
    local_solo_enabled: false,
    scoped_profile: null,
  };
  apiMocks.status.mockResolvedValue(authMocks.authStatus);
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe("LoginPage registration guidance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it("invites a new user to create an account when registration is open", () => {
    renderLogin(true);

    expect(
      screen.getByText(new RegExp(tr("输入邮箱获取验证码。新邮箱验证后会自动注册，随后在设置白板连接你自己的模型。").replace(/[.*+?^${}()|[]\\]/g, "\\$&"), "")),
    ).toBeTruthy();
    expect(
      screen.queryByText(new RegExp(tr("Use an allowed or registered email to sign in.").replace(/[.*+?^${}()|[]\\]/g, "\\$&"), "i")),
    ).toBeNull();
  });

  it("requires an allowed or registered email when registration is restricted", () => {
    renderLogin(false);

    expect(
      screen.getByText(new RegExp(tr("Use an allowed or registered email to sign in.").replace(/[.*+?^${}()|[]\\]/g, "\\$&"), "i")),
    ).toBeTruthy();
  });

  it("refreshes a stale initial auth status when the login page mounts", async () => {
    authMocks.authStatus = {
      bootstrap_mode: false,
      email_login_enabled: false,
      admin_token_login_enabled: false,
      allow_self_registration: false,
      local_solo_enabled: false,
      scoped_profile: null,
    };
    apiMocks.status.mockResolvedValue({
      bootstrap_mode: false,
      email_login_enabled: true,
      admin_token_login_enabled: false,
      allow_self_registration: true,
      local_solo_enabled: false,
      scoped_profile: null,
    } satisfies AuthStatusResponse);

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(apiMocks.status).toHaveBeenCalledOnce());
    expect(
      await screen.findByText(
        new RegExp(tr("输入邮箱获取验证码。新邮箱验证后会自动注册，随后在设置白板连接你自己的模型。").replace(/[.*+?^${}()|[]\\]/g, "\\$&"), ""),
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(/email otp login is not enabled on this host/i),
    ).toBeNull();
  });

  it("never promises email sign-in when email login is disabled", async () => {
    authMocks.authStatus = {
      bootstrap_mode: false,
      email_login_enabled: false,
      admin_token_login_enabled: true,
      allow_self_registration: false,
      local_solo_enabled: true,
      scoped_profile: null,
    };
    apiMocks.status.mockResolvedValue(authMocks.authStatus);

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(new RegExp(tr("Continue with the local profile on this machine.").replace(/[.*+?^${}()|[]\\]/g, "\\$&"), "i")),
    ).toBeTruthy();
    expect(screen.queryByText(/email/i)).toBeNull();
  });

  it("offers a retry when the auth status probe fails", async () => {
    authMocks.authStatus = null;
    apiMocks.status.mockRejectedValue(new Error("connection refused"));

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(new RegExp(tr("Can't reach the server to load the sign-in options. Check that it is running, then retry.").replace(/[.*+?^${}()|[]\\]/g, "\\$&"), "i")),
    ).toBeTruthy();
    expect(screen.queryByText(new RegExp(tr("Checking sign-in options…").replace(/[.*+?^${}()|[]\\]/g, "\\$&"), "i"))).toBeNull();

    // The probe recovers on retry.
    apiMocks.status.mockResolvedValue({
      bootstrap_mode: false,
      email_login_enabled: true,
      admin_token_login_enabled: false,
      allow_self_registration: true,
      local_solo_enabled: false,
      scoped_profile: null,
    } satisfies AuthStatusResponse);
    screen.getByText(tr("Retry")).click();

    expect(
      await screen.findByText(
        new RegExp(tr("输入邮箱获取验证码。新邮箱验证后会自动注册，随后在设置白板连接你自己的模型。").replace(/[.*+?^${}()|[]\\]/g, "\\$&"), ""),
      ),
    ).toBeTruthy();
    expect(apiMocks.status).toHaveBeenCalledTimes(2);
  });
});

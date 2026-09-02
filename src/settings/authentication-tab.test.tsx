import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthenticationTab } from "./authentication-tab";

const apiMocks = vi.hoisted(() => ({
  fetchAuthenticationSettings: vi.fn(),
  getAllowedEmails: vi.fn(),
  addAllowedEmail: vi.fn(),
  removeAllowedEmail: vi.fn(),
  saveAuthenticationSettings: vi.fn(),
  sendAuthenticationTestEmail: vi.fn(),
  formatSettingsError: vi.fn((err: unknown, fallback = "Request failed.") =>
    err instanceof Error ? err.message : fallback,
  ),
}));

vi.mock("./settings-api", () => apiMocks);

describe("AuthenticationTab", () => {
  beforeEach(() => {
    cleanup();
    for (const mock of Object.values(apiMocks)) mock.mockReset();
    apiMocks.formatSettingsError.mockImplementation(
      (err: unknown, fallback = "Request failed.") =>
        err instanceof Error ? err.message : fallback,
    );
    apiMocks.fetchAuthenticationSettings.mockResolvedValue({
      host: "smtp.example.com",
      port: 587,
      username: "mailer@example.com",
      from_address: "Octos <mailer@example.com>",
      password_configured: true,
      allow_self_registration: false,
    });
    apiMocks.getAllowedEmails.mockResolvedValue([
      {
        email: "invited@example.com",
        note: "GOSIM reviewer",
        registered: false,
      },
      {
        email: "member@example.com",
        registered: true,
        registered_name: "Member",
      },
    ]);
    apiMocks.addAllowedEmail.mockResolvedValue(undefined);
    apiMocks.removeAllowedEmail.mockResolvedValue(undefined);
    apiMocks.saveAuthenticationSettings.mockResolvedValue(undefined);
    apiMocks.sendAuthenticationTestEmail.mockResolvedValue({
      ok: true,
      message: "Test email sent.",
    });
  });

  it("loads SMTP settings and shows restricted registration without revealing the password", async () => {
    render(<AuthenticationTab />);

    expect(await screen.findByDisplayValue("smtp.example.com")).toBeTruthy();
    expect(
      (screen.getByRole("radio", {
        name: /restricted registration/i,
      }) as HTMLInputElement).checked,
    ).toBe(true);
    expect((screen.getByLabelText(/SMTP password/i) as HTMLInputElement).value).toBe("");
    expect(screen.getByText(/password is already configured/i)).toBeTruthy();
  });

  it("enables open registration and preserves the stored password when saving", async () => {
    render(<AuthenticationTab />);
    await screen.findByDisplayValue("smtp.example.com");

    fireEvent.click(screen.getByRole("radio", { name: /open registration/i }));

    const warning = screen.getByRole("note", {
      name: /open registration warning/i,
    });
    expect(warning.className).toContain(
      "[color:var(--workbench-warning-text)]",
    );
    expect(screen.getByText(/anyone with an email address can register/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /save authentication settings/i }));

    await waitFor(() => {
      expect(apiMocks.saveAuthenticationSettings).toHaveBeenCalledWith({
        host: "smtp.example.com",
        port: 587,
        username: "mailer@example.com",
        from_address: "Octos <mailer@example.com>",
        allow_self_registration: true,
      });
    });
    expect((await screen.findByRole("status")).className).toContain(
      "[color:var(--workbench-success-text)]",
    );
  });

  it("uses theme-aware danger colors when saving fails", async () => {
    apiMocks.saveAuthenticationSettings.mockRejectedValue(
      new Error("SMTP save failed"),
    );
    render(<AuthenticationTab />);
    await screen.findByDisplayValue("smtp.example.com");

    fireEvent.click(
      screen.getByRole("button", { name: /save authentication settings/i }),
    );

    const error = await screen.findByRole("alert");
    expect(error.textContent).toContain("SMTP save failed");
    expect(error.className).toContain(
      "[color:var(--workbench-danger-text)]",
    );
  });

  it("sends a test login email to the requested recipient", async () => {
    render(<AuthenticationTab />);
    await screen.findByDisplayValue("smtp.example.com");

    fireEvent.change(screen.getByLabelText(/test recipient/i), {
      target: { value: "new-user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send test email/i }));

    await waitFor(() => {
      expect(apiMocks.sendAuthenticationTestEmail).toHaveBeenCalledWith(
        "new-user@example.com",
      );
    });
    expect(await screen.findByText("Test email sent.")).toBeTruthy();
  });

  it("manages invited emails without presenting registered users as removable invites", async () => {
    render(<AuthenticationTab />);

    expect(await screen.findByText("invited@example.com")).toBeTruthy();
    expect(screen.getByText("GOSIM reviewer")).toBeTruthy();
    expect(screen.getByText("member@example.com")).toBeTruthy();
    expect(screen.getByText("Registered as Member")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Remove member@example.com" }),
    ).toBeNull();

    fireEvent.change(screen.getByLabelText("Allowed email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Invitation note"), {
      target: { value: "Pilot learner" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add allowed email" }));

    await waitFor(() => {
      expect(apiMocks.addAllowedEmail).toHaveBeenCalledWith(
        "new@example.com",
        "Pilot learner",
      );
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Remove invited@example.com" }),
    );
    await waitFor(() => {
      expect(apiMocks.removeAllowedEmail).toHaveBeenCalledWith(
        "invited@example.com",
      );
    });
  });
});
